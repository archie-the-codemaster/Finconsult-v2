interface D1Result {
  success: boolean;
  meta?: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = Record<string, unknown>>(): Promise<D1Result & { results?: T[] }>;
  all<T = Record<string, unknown>>(): Promise<D1Result & { results?: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

interface MonitoredSource {
  id: string;
  bank: string;
  label: string;
  url: string;
  locale: string;
  sourceType: "product_page" | "document";
}

const SOURCES: MonitoredSource[] = [
  {
    id: "maib-consumer-loans",
    bank: "maib",
    label: "Credite persoane fizice",
    url: "https://www.maib.md/ro/credite",
    locale: "ro",
    sourceType: "product_page",
  },
  {
    id: "micb-smart-credit",
    bank: "Moldindconbank",
    label: "Smart Credit",
    url: "https://micb.md/credits/smartcredit/",
    locale: "ro",
    sourceType: "product_page",
  },
  {
    id: "otp-personal-loans",
    bank: "OTP Bank",
    label: "Credite persoane fizice",
    url: "https://otpbank.md/individuals-loans",
    locale: "ro",
    sourceType: "product_page",
  },
  {
    id: "procredit-personal-loans",
    bank: "ProCredit Bank",
    label: "Credit de nevoi personale",
    url: "https://procreditbank.md/ro/nevoi_personale",
    locale: "ro",
    sourceType: "product_page",
  },
  {
    id: "exim-consumer-loans",
    bank: "EXIMBANK",
    label: "Credite de consum",
    url: "https://eximbank.md/ro/credit-de-consum",
    locale: "ro",
    sourceType: "product_page",
  },
];

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_STORED_TEXT_LENGTH = 30_000;
const FETCH_TIMEOUT_MS = 15_000;

interface PreviousState {
  etag: string | null;
  last_modified: string | null;
  last_content_hash: string | null;
}

function uuid(): string {
  return crypto.randomUUID();
}

function cleanHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readBoundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Response exceeded the 1 MB monitoring limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function upsertSources(db: D1Database): Promise<void> {
  const statements = SOURCES.map((source) => db.prepare(`
    INSERT INTO monitored_sources (id, bank, label, url, locale, source_type)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(source.id, source.bank, source.label, source.url, source.locale, source.sourceType));
  await db.batch(statements);
}

async function monitorSource(
  db: D1Database,
  source: MonitoredSource,
  runId: string,
): Promise<"changed" | "unchanged" | "error"> {
  const previous = await db.prepare(`
    SELECT etag, last_modified, last_content_hash
    FROM monitored_sources WHERE id = ?
  `).bind(source.id).first<PreviousState>();

  const headers = new Headers({
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    "User-Agent": "FinconsultOfferMonitor/0.1",
  });
  if (previous?.etag) headers.set("If-None-Match", previous.etag);
  if (previous?.last_modified) headers.set("If-Modified-Since", previous.last_modified);

  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(source.url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status === 304) {
      await db.prepare(`
        UPDATE monitored_sources SET last_checked_at = ?, last_status = 304,
          last_error = NULL, updated_at = datetime('now') WHERE id = ?
      `).bind(checkedAt, source.id).run();
      return "unchanged";
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("Content-Type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
    }

    const body = await readBoundedText(response);
    const text = cleanHtml(body);
    if (text.length < 100) throw new Error("Page returned too little readable text");
    const contentHash = await sha256(text);
    const changed = contentHash !== previous?.last_content_hash;
    const etag = response.headers.get("ETag");
    const lastModified = response.headers.get("Last-Modified");
    const statements = [db.prepare(`
      UPDATE monitored_sources SET last_checked_at = ?, last_status = ?,
        last_content_hash = ?, etag = ?, last_modified = ?, last_error = NULL,
        updated_at = datetime('now') WHERE id = ?
    `).bind(checkedAt, response.status, contentHash, etag, lastModified, source.id)];

    if (changed) {
      statements.push(db.prepare(`
        INSERT INTO offer_source_changes
          (id, run_id, source_id, detected_at, http_status, content_hash, content_type, extracted_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(uuid(), runId, source.id, checkedAt, response.status, contentHash, contentType, text.slice(0, MAX_STORED_TEXT_LENGTH)));
    }
    await db.batch(statements);
    return changed ? "changed" : "unchanged";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    await db.prepare(`
      UPDATE monitored_sources SET last_checked_at = ?, last_status = NULL,
        last_error = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(checkedAt, message.slice(0, 500), source.id).run();
    return "error";
  }
}

export async function runOfferMonitor(db: D1Database): Promise<{
  runId: string;
  checked: number;
  changed: number;
  errors: number;
}> {
  await upsertSources(db);
  const sourceRows = await db.prepare(`SELECT id, bank, label, url, locale, source_type FROM monitored_sources WHERE enabled = 1 ORDER BY bank, label`).all<{
    id: string; bank: string; label: string; url: string; locale: string; source_type: "product_page" | "document";
  }>();
  const sources = (sourceRows.results ?? []).map((source) => ({
    id: source.id, bank: source.bank, label: source.label, url: source.url, locale: source.locale, sourceType: source.source_type,
  }));
  const runId = uuid();
  const startedAt = new Date().toISOString();
  await db.prepare(`INSERT INTO offer_monitor_runs (id, started_at) VALUES (?, ?)`)
    .bind(runId, startedAt).run();

  // Keep concurrency low to avoid stressing bank websites.
  const results: Array<"changed" | "unchanged" | "error"> = [];
  for (const source of sources) {
    results.push(await monitorSource(db, source, runId));
  }

  const counts = {
    runId,
    checked: results.length,
    changed: results.filter((result) => result === "changed").length,
    errors: results.filter((result) => result === "error").length,
  };
  await db.prepare(`
    UPDATE offer_monitor_runs SET finished_at = ?, checked_count = ?,
      changed_count = ?, error_count = ? WHERE id = ?
  `).bind(new Date().toISOString(), counts.checked, counts.changed, counts.errors, runId).run();
  return counts;
}
