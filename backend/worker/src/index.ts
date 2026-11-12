
import { createClient } from "@supabase/supabase-js";
import { runOfferMonitor, type D1Database } from "./offer-monitor";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SECRET_KEY?: string;
  key_main?: string;
  // Legacy Supabase key name retained for deployments that have not migrated yet.
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AI_CONFIG_KEK?: string;
  ALLOWED_ORIGINS: string;
  DB: D1Database;
}

interface AdminIdentity {
  email: string;
  role: string;
}

const ADMIN_SESSION_COOKIE = "__Host-finconsult_admin";
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 10;

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  });

  const origin = request.headers.get("Origin");

  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

function json(data: unknown, status: number, cors: Headers): Response {
  const headers = new Headers(cors);

  for (const [key, value] of Object.entries(jsonHeaders)) {
    headers.set(key, value);
  }

  return new Response(JSON.stringify(data), { status, headers });
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins(env).has(origin);
}

function serviceSupabase(env: Env) {
  const serverKey = env.SUPABASE_SECRET_KEY || env.key_main || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !serverKey) return null;
  return createClient(env.SUPABASE_URL, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  return cookie?.slice(ADMIN_SESSION_COOKIE.length + 1) || null;
}

function cookieValue(token: string, maxAge: number): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function authenticateAdmin(request: Request, env: Env): Promise<AdminIdentity | Response> {
  const token = sessionToken(request);
  if (!token) return new Response("Authentication required", { status: 401 });
  const dbSession = await env.DB.prepare(`
    SELECT email FROM admin_sessions WHERE token_hash = ? AND expires_at > ?
  `).bind(await sha256Hex(token), Math.floor(Date.now() / 1000)).first<{ email: string }>();
  if (!dbSession) return new Response("Authentication required", { status: 401 });

  const supabase = serviceSupabase(env);
  if (!supabase) return new Response("Admin authentication is not configured", { status: 503 });
  const { data: admin, error } = await supabase
    .from("admin_users")
    .select("role")
    .eq("email", dbSession.email)
    .maybeSingle();
  if (error) return new Response("Administrator access could not be verified", { status: 502 });
  if (!admin) {
    await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    return new Response("Administrator access required", { status: 403 });
  }
  return { email: dbSession.email, role: admin.role };
}

function allowedAuthOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(origin && allowedOrigins(env).has(origin));
}

async function loginAttemptKey(email: string): Promise<string> {
  return sha256Hex(`finconsult-admin-login:${email}`);
}

async function isLoginLimited(env: Env, email: string, now: number): Promise<boolean> {
  const key = await loginAttemptKey(email);
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS attempts FROM admin_login_attempts WHERE subject_hash = ? AND attempted_at > ?
  `).bind(key, now - LOGIN_WINDOW_SECONDS).first<{ attempts: number }>();
  return (row?.attempts ?? 0) >= LOGIN_MAX_ATTEMPTS;
}

async function recordFailedLogin(env: Env, email: string, now: number): Promise<void> {
  const key = await loginAttemptKey(email);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_login_attempts WHERE attempted_at <= ?").bind(now - 24 * 60 * 60),
    env.DB.prepare("INSERT INTO admin_login_attempts (id, subject_hash, attempted_at) VALUES (?, ?, ?)")
      .bind(crypto.randomUUID(), key, now),
  ]);
}

async function handleAdminAuth(
  request: Request,
  env: Env,
  cors: Headers,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/admin/auth/")) return null;
  if (request.method !== "GET" && !allowedAuthOrigin(request, env)) {
    return json({ error: "Origin not allowed" }, 403, cors);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/auth/session") {
    const admin = await authenticateAdmin(request, env);
    if (admin instanceof Response) return json({ error: await admin.text() }, admin.status, cors);
    return json(admin, 200, cors);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/auth/login") {
    let body: { email?: unknown; password?: unknown };
    try { body = await request.json() as typeof body; }
    catch { return json({ error: "Invalid email or password" }, 400, cors); }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || email.length > 320 || !password || new TextEncoder().encode(password).length > 72) {
      return json({ error: "Invalid email or password" }, 401, cors);
    }
    const now = Math.floor(Date.now() / 1000);
    if (await isLoginLimited(env, email, now)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429, cors);
    const supabase = serviceSupabase(env);
    if (!supabase) return json({ error: "Admin authentication is not configured" }, 503, cors);
    try {
      const { data, error } = await supabase.rpc("verify_admin_password", {
        p_email: email,
        p_password: password,
      });
      if (error) return json({ error: "Admin authentication is unavailable" }, 503, cors);
      const admin = Array.isArray(data) ? data[0] as AdminIdentity | undefined : undefined;
      if (!admin?.email || !admin.role) {
        await recordFailedLogin(env, email, now);
        return json({ error: "Invalid email or password" }, 401, cors);
      }
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      const token = base64Url(tokenBytes);
      const tokenHash = await sha256Hex(token);
      const expiresAt = now + ADMIN_SESSION_SECONDS;
      await env.DB.batch([
        env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
        env.DB.prepare("INSERT INTO admin_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
          .bind(tokenHash, admin.email, now, expiresAt),
      ]);
      const response = json({ email: admin.email, role: admin.role }, 200, cors);
      return withCookie(response, cookieValue(token, ADMIN_SESSION_SECONDS));
    } catch {
      return json({ error: "Admin authentication is unavailable" }, 503, cors);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/admin/auth/logout") {
    const token = sessionToken(request);
    if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    return withCookie(json({ ok: true }, 200, cors), cookieValue("", 0));
  }

  if (request.method === "POST" && url.pathname === "/api/admin/auth/password") {
    const authorization = request.headers.get("Authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json({ error: "Sign in with your existing administrator account to set a password" }, 401, cors);
    }
    let body: { password?: unknown };
    try { body = await request.json() as typeof body; }
    catch { return json({ error: "Invalid password request" }, 400, cors); }
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 12 || new TextEncoder().encode(password).length > 72) {
      return json({ error: "Use at least 12 characters and no more than 72 UTF-8 bytes." }, 400, cors);
    }
    const supabase = serviceSupabase(env);
    if (!supabase) return json({ error: "Admin authentication is not configured" }, 503, cors);
    try {
      const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: authData, error: authError } = await authClient.auth.getUser(match[1]);
      const email = authData.user?.email?.trim().toLowerCase();
      if (authError || !email) return json({ error: "The existing administrator sign-in could not be verified" }, 401, cors);
      const { data: admin, error: roleError } = await supabase.from("admin_users").select("email").eq("email", email).maybeSingle();
      if (roleError) return json({ error: "Administrator access could not be verified" }, 502, cors);
      if (!admin) return json({ error: "Administrator access required" }, 403, cors);
      const { data: updated, error: passwordError } = await supabase.rpc("set_admin_password", {
        p_email: email,
        p_password: password,
      });
      if (passwordError) return json({ error: "The admin password could not be saved" }, 502, cors);
      if (!updated) return json({ error: "Administrator access required" }, 403, cors);
      await env.DB.prepare("DELETE FROM admin_sessions WHERE email = ?").bind(email).run();
      return json({ ok: true, email }, 200, cors);
    } catch {
      return json({ error: "Password setup is unavailable" }, 503, cors);
    }
  }

  return json({ error: "Not found" }, 404, cors);
}

function isResponse(value: { email: string; role: string } | Response): value is Response {
  return value instanceof Response;
}

async function handleAdminOfferChanges(
  request: Request,
  env: Env,
  cors: Headers,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET" && !allowedAuthOrigin(request, env)) {
    return json({ error: "Origin not allowed" }, 403, cors);
  }
  const actor = await authenticateAdmin(request, env);
  if (isResponse(actor)) return json({ error: await actor.text() }, actor.status, cors);

  if (request.method === "GET" && url.pathname === "/api/admin/offer-changes") {
    const allowedStatuses = new Set(["pending", "reviewed", "dismissed", "all"]);
    const status = url.searchParams.get("status") ?? "pending";
    if (!allowedStatuses.has(status)) return json({ error: "Invalid review status" }, 400, cors);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
    const filter = status === "all" ? "" : "WHERE c.review_status = ?";
    const bindValues = status === "all" ? [limit, offset] : [status, limit, offset];
    const results = await env.DB.prepare(`
      SELECT c.id, c.source_id, s.bank, s.label, s.url, s.locale,
        c.detected_at, c.http_status, c.content_type, c.extracted_text,
        c.review_status, c.reviewed_at, c.reviewed_by
      FROM offer_source_changes c
      JOIN monitored_sources s ON s.id = c.source_id
      ${filter}
      ORDER BY c.detected_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindValues).all();
    const countStatement = status === "all"
      ? env.DB.prepare("SELECT COUNT(*) AS count FROM offer_source_changes")
      : env.DB.prepare("SELECT COUNT(*) AS count FROM offer_source_changes WHERE review_status = ?").bind(status);
    const total = await countStatement.first<{ count: number }>();
    return json({
      changes: results.results ?? [],
      total: total?.count ?? 0,
      limit,
      offset,
      can_review: actor.role !== "analyst",
    }, 200, cors);
  }

  const match = url.pathname.match(/^\/api\/admin\/offer-changes\/([\w-]+)$/);
  if (request.method === "PATCH" && match) {
    if (actor.role === "analyst") return json({ error: "Review actions are not permitted for this role" }, 403, cors);
    let body: { status?: unknown };
    try {
      body = await request.json() as { status?: unknown };
    } catch {
      return json({ error: "Invalid JSON body" }, 400, cors);
    }
    if (body.status !== "reviewed" && body.status !== "dismissed") {
      return json({ error: "Status must be reviewed or dismissed" }, 400, cors);
    }
    const changeId = match[1];
    const existing = await env.DB.prepare(`
      SELECT id FROM offer_source_changes WHERE id = ?
    `).bind(changeId).first<{ id: string }>();
    if (!existing) return json({ error: "Change not found" }, 404, cors);

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE offer_source_changes SET review_status = ?, reviewed_at = ?, reviewed_by = ?
        WHERE id = ?
      `).bind(body.status, new Date().toISOString(), actor.email, changeId),
      env.DB.prepare(`
        INSERT INTO audit_log (actor_email, action, target_type, target_id, details_json)
        VALUES (?, ?, 'offer_source_change', ?, ?)
      `).bind(actor.email, `offer_change_${body.status}`, changeId, JSON.stringify({ status: body.status })),
    ]);
    return json({ id: changeId, status: body.status }, 200, cors);
  }

  return json({ error: "Not found" }, 404, cors);
}

async function recordAdminAction(env: Env, actor: AdminIdentity, action: string, targetType: string, targetId: string | null, details: Record<string, unknown> = {}) {
  await env.DB.prepare(`INSERT INTO audit_log (actor_email, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?)`)
    .bind(actor.email, action, targetType, targetId, JSON.stringify(details)).run();
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function encryptProviderSecret(env: Env, plaintext: string) {
  if (!env.AI_CONFIG_KEK) throw new Error("AI secret encryption is not configured. Set AI_CONFIG_KEK before saving provider secrets.");
  const kekBytes = decodeBase64(env.AI_CONFIG_KEK);
  if (kekBytes.byteLength !== 32) throw new Error("AI_CONFIG_KEK must be a base64-encoded 32-byte key.");
  const dekBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapNonce = crypto.getRandomValues(new Uint8Array(12));
  const dek = await crypto.subtle.importKey("raw", arrayBuffer(dekBytes), "AES-GCM", false, ["encrypt"]);
  const kek = await crypto.subtle.importKey("raw", arrayBuffer(kekBytes), "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: arrayBuffer(nonce) }, dek, new TextEncoder().encode(plaintext));
  const wrappedDek = await crypto.subtle.encrypt({ name: "AES-GCM", iv: arrayBuffer(wrapNonce) }, kek, arrayBuffer(dekBytes));
  return { ciphertext: new Uint8Array(ciphertext), nonce, wrappedDek: new Uint8Array(wrappedDek), wrapNonce };
}

async function handleAdminConsole(request: Request, env: Env, cors: Headers, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/admin/")) return null;
  const actor = await authenticateAdmin(request, env);
  if (actor instanceof Response) return json({ error: await actor.text() }, actor.status, cors);
  const readOnly = actor.role === "analyst";
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/admin/dashboard") {
    const [sources, pending, runs, changes, admins, sessions, activity] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled FROM monitored_sources").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM offer_source_changes WHERE review_status = 'pending'").first(),
      env.DB.prepare("SELECT * FROM offer_monitor_runs ORDER BY started_at DESC LIMIT 1").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM offer_source_changes WHERE detected_at >= datetime('now', '-30 days')").first(),
      serviceSupabase(env)?.from("admin_users").select("email", { count: "exact", head: true }) ?? Promise.resolve({ count: null }),
      env.DB.prepare("SELECT COUNT(*) AS count FROM admin_sessions WHERE expires_at > ?").bind(Math.floor(Date.now() / 1000)).first(),
      env.DB.prepare("SELECT id, actor_email, action, target_type, target_id, details_json, created_at FROM audit_log ORDER BY created_at DESC LIMIT 8").all(),
    ]);
    return json({ monitoring: sources, pending_changes: pending, latest_run: runs, changes_30d: changes, admin_count: admins.count, active_sessions: sessions, recent_activity: activity.results ?? [] }, 200, cors);
  }

  if (request.method === "GET" && path === "/api/admin/analytics") {
    const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 7), 90);
    const [usage, monitorRuns, changes, sources] = await Promise.all([
      env.DB.prepare(`SELECT usage_date, SUM(request_count) AS requests, SUM(error_count) AS errors, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(estimated_cost_microusd) AS estimated_cost_microusd FROM daily_usage WHERE usage_date >= date('now', ?) GROUP BY usage_date ORDER BY usage_date DESC LIMIT 90`).bind(`-${days} days`).all(),
      env.DB.prepare(`SELECT id, started_at, finished_at, checked_count, changed_count, error_count FROM offer_monitor_runs ORDER BY started_at DESC LIMIT 30`).all(),
      env.DB.prepare(`SELECT review_status, COUNT(*) AS count FROM offer_source_changes WHERE detected_at >= datetime('now', ?) GROUP BY review_status`).bind(`-${days} days`).all(),
      env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled FROM monitored_sources").first(),
    ]);
    return json({ days, usage: usage.results ?? [], monitor_runs: monitorRuns.results ?? [], changes: changes.results ?? [], sources }, 200, cors);
  }

  if (request.method === "GET" && path === "/api/admin/audit") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 200);
    const result = await env.DB.prepare("SELECT id, actor_email, action, target_type, target_id, details_json, created_at FROM audit_log ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    const sessions = await env.DB.prepare("SELECT email, COUNT(*) AS session_count, MAX(created_at) AS latest_session FROM admin_sessions WHERE expires_at > ? GROUP BY email ORDER BY latest_session DESC").bind(Math.floor(Date.now() / 1000)).all();
    return json({ events: result.results ?? [], active_sessions: sessions.results ?? [] }, 200, cors);
  }

  if (request.method === "GET" && path === "/api/admin/users") {
    if (readOnly) return json({ error: "User directory access is not permitted for this role" }, 403, cors);
    const supabase = serviceSupabase(env);
    if (!supabase) return json({ error: "Admin authentication is not configured" }, 503, cors);
    const page = Math.min(Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1), 10000);
    const perPage = 50;
    try {
      const [{ data, error }, { data: admins, error: adminError }] = await Promise.all([
        supabase.auth.admin.listUsers({ page, perPage }),
        supabase.from("admin_users").select("email, role"),
      ]);
      if (error || adminError) return json({ error: "User directory is unavailable" }, 502, cors);
      const roles = new Map((admins ?? []).map((admin) => [admin.email.toLowerCase(), admin.role]));
      const users = data.users.map((user) => ({
        id: user.id,
        email: user.email ?? "",
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        confirmed_at: user.confirmed_at,
        banned_until: user.banned_until,
        admin_role: roles.get((user.email ?? "").toLowerCase()) ?? null,
      }));
      return json({ users, page, per_page: perPage, has_more: users.length === perPage }, 200, cors);
    } catch {
      return json({ error: "User directory is unavailable" }, 502, cors);
    }
  }

  if (path === "/api/admin/ai-configs" && request.method === "GET") {
    const result = await env.DB.prepare(`SELECT c.id, c.provider, c.label, c.base_url, c.default_model, c.enabled, c.created_at, c.updated_at, CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS secret_configured FROM ai_provider_configs c LEFT JOIN provider_secrets s ON s.config_id = c.id ORDER BY c.created_at DESC`).all();
    return json({ configs: result.results ?? [], encryption_configured: Boolean(env.AI_CONFIG_KEK), read_only: readOnly, can_panic: actor.role === "owner" }, 200, cors);
  }

  if (path === "/api/admin/ai-configs/panic" && request.method === "POST") {
    if (actor.role !== "owner") return json({ error: "Only an owner can use the AI emergency stop" }, 403, cors);
    let body: { confirmation?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: "Invalid JSON body" }, 400, cors); }
    if (body.confirmation !== "DISABLE ALL AI PROVIDERS") return json({ error: "Emergency confirmation phrase did not match" }, 400, cors);
    const [secrets, providers] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM provider_secrets").first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM ai_provider_configs WHERE enabled = 1").first<{ count: number }>(),
    ]);
    const details = JSON.stringify({ credentials_erased: secrets?.count ?? 0, providers_disabled: providers?.count ?? 0 });
    await env.DB.batch([
      env.DB.prepare("DELETE FROM provider_secrets"),
      env.DB.prepare("UPDATE ai_provider_configs SET enabled = 0, updated_at = datetime('now')"),
      env.DB.prepare("INSERT INTO audit_log (actor_email, action, target_type, details_json) VALUES (?, 'ai_emergency_stop', 'all_ai_providers', ?)").bind(actor.email, details),
    ]);
    return json({ ok: true, credentials_erased: secrets?.count ?? 0, providers_disabled: providers?.count ?? 0 }, 200, cors);
  }

  if (path === "/api/admin/ai-configs" && request.method === "POST") {
    if (readOnly) return json({ error: "This role cannot change AI settings" }, 403, cors);
    let body: { provider?: unknown; label?: unknown; base_url?: unknown; default_model?: unknown; enabled?: unknown; api_key?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: "Invalid JSON body" }, 400, cors); }
    const provider = body.provider;
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const model = typeof body.default_model === "string" ? body.default_model.trim() : "";
    const baseUrl = typeof body.base_url === "string" ? body.base_url.trim() : null;
    const secret = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (!["openai", "google", "anthropic", "custom"].includes(String(provider)) || !label || label.length > 80 || !model || model.length > 120) return json({ error: "Choose a provider and enter a label and model" }, 400, cors);
    if (baseUrl && (!baseUrl.startsWith("https://") || baseUrl.length > 500)) return json({ error: "Base URL must be a valid HTTPS URL" }, 400, cors);
    if (secret.length > 4096) return json({ error: "API key is too long" }, 400, cors);
    if (body.enabled === true && !secret) return json({ error: "Enter an API key before enabling this provider" }, 400, cors);
    const id = crypto.randomUUID();
    try {
      const encrypted = secret ? await encryptProviderSecret(env, secret) : null;
      const insertConfig = env.DB.prepare(`INSERT INTO ai_provider_configs (id, provider, label, base_url, default_model, enabled) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, provider, label, baseUrl, model, body.enabled === true ? 1 : 0);
      if (encrypted) {
        await env.DB.batch([
          insertConfig,
          env.DB.prepare(`INSERT INTO provider_secrets (id, config_id, ciphertext, nonce, wrapped_dek, wrap_nonce, kek_version) VALUES (?, ?, ?, ?, ?, ?, 'v1')`)
            .bind(crypto.randomUUID(), id, encrypted.ciphertext, encrypted.nonce, encrypted.wrappedDek, encrypted.wrapNonce),
        ]);
      } else await insertConfig.run();
    } catch (error) {
      await env.DB.prepare("DELETE FROM ai_provider_configs WHERE id = ?").bind(id).run();
      return json({ error: error instanceof Error ? error.message : "AI configuration could not be saved" }, 400, cors);
    }
    await recordAdminAction(env, actor, "ai_provider_created", "ai_provider_config", id, { provider, label, model });
    return json({ id }, 201, cors);
  }

  const aiMatch = path.match(/^\/api\/admin\/ai-configs\/([\w-]+)$/);
  if (aiMatch && request.method === "PATCH") {
    if (readOnly) return json({ error: "This role cannot change AI settings" }, 403, cors);
    let body: { label?: unknown; base_url?: unknown; default_model?: unknown; enabled?: unknown; api_key?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: "Invalid JSON body" }, 400, cors); }
    const id = aiMatch[1];
    const existing = await env.DB.prepare("SELECT id FROM ai_provider_configs WHERE id = ?").bind(id).first();
    if (!existing) return json({ error: "AI provider not found" }, 404, cors);
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const model = typeof body.default_model === "string" ? body.default_model.trim() : "";
    const baseUrl = typeof body.base_url === "string" ? body.base_url.trim() : null;
    const secret = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (!label || label.length > 80 || !model || model.length > 120 || (baseUrl && (!baseUrl.startsWith("https://") || baseUrl.length > 500))) return json({ error: "Check the label, model, and HTTPS base URL" }, 400, cors);
    if (secret.length > 4096) return json({ error: "API key is too long" }, 400, cors);
    try {
      const encrypted = secret ? await encryptProviderSecret(env, secret) : null;
      if (body.enabled === true && !encrypted) {
        const storedSecret = await env.DB.prepare("SELECT id FROM provider_secrets WHERE config_id = ?").bind(id).first();
        if (!storedSecret) return json({ error: "Enter an API key before enabling this provider" }, 400, cors);
      }
      const updateConfig = env.DB.prepare("UPDATE ai_provider_configs SET label = ?, base_url = ?, default_model = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(label, baseUrl, model, body.enabled === true ? 1 : 0, id);
      if (encrypted) {
        await env.DB.batch([
          updateConfig,
          env.DB.prepare(`INSERT INTO provider_secrets (id, config_id, ciphertext, nonce, wrapped_dek, wrap_nonce, kek_version) VALUES (?, ?, ?, ?, ?, ?, 'v1') ON CONFLICT(config_id) DO UPDATE SET ciphertext = excluded.ciphertext, nonce = excluded.nonce, wrapped_dek = excluded.wrapped_dek, wrap_nonce = excluded.wrap_nonce, kek_version = excluded.kek_version, updated_at = datetime('now')`)
            .bind(crypto.randomUUID(), id, encrypted.ciphertext, encrypted.nonce, encrypted.wrappedDek, encrypted.wrapNonce),
        ]);
      } else await updateConfig.run();
    } catch (error) { return json({ error: error instanceof Error ? error.message : "AI configuration could not be saved" }, 400, cors); }
    await recordAdminAction(env, actor, secret ? "ai_provider_and_key_updated" : "ai_provider_updated", "ai_provider_config", id, { label, model, enabled: body.enabled === true, key_replaced: Boolean(secret) });
    return json({ id }, 200, cors);
  }

  const aiSecretMatch = path.match(/^\/api\/admin\/ai-configs\/([\w-]+)\/secret$/);
  if (aiSecretMatch && request.method === "DELETE") {
    if (readOnly) return json({ error: "This role cannot change AI settings" }, 403, cors);
    const id = aiSecretMatch[1];
    const existing = await env.DB.prepare("SELECT id FROM ai_provider_configs WHERE id = ?").bind(id).first();
    if (!existing) return json({ error: "AI provider not found" }, 404, cors);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM provider_secrets WHERE config_id = ?").bind(id),
      env.DB.prepare("UPDATE ai_provider_configs SET enabled = 0, updated_at = datetime('now') WHERE id = ?").bind(id),
    ]);
    await recordAdminAction(env, actor, "ai_provider_key_removed", "ai_provider_config", id);
    return json({ id }, 200, cors);
  }

  if (aiMatch && request.method === "DELETE") {
    if (readOnly) return json({ error: "This role cannot change AI settings" }, 403, cors);
    await env.DB.prepare("DELETE FROM ai_provider_configs WHERE id = ?").bind(aiMatch[1]).run();
    await recordAdminAction(env, actor, "ai_provider_deleted", "ai_provider_config", aiMatch[1]);
    return json({ id: aiMatch[1] }, 200, cors);
  }

  if (path === "/api/admin/settings/sources" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT id, bank, label, url, locale, source_type, enabled, last_checked_at, last_status, last_error, created_at, updated_at FROM monitored_sources ORDER BY bank, label").all();
    return json({ sources: result.results ?? [], can_manage: !readOnly }, 200, cors);
  }

  const sourceMatch = path.match(/^\/api\/admin\/settings\/sources\/([\w-]+)$/);
  if (sourceMatch && request.method === "PATCH") {
    if (readOnly) return json({ error: "This role cannot change monitoring settings" }, 403, cors);
    let body: { enabled?: unknown };
    try { body = await request.json() as typeof body; } catch { return json({ error: "Invalid JSON body" }, 400, cors); }
    if (typeof body.enabled !== "boolean") return json({ error: "Enabled must be true or false" }, 400, cors);
    const result = await env.DB.prepare("UPDATE monitored_sources SET enabled = ?, updated_at = datetime('now') WHERE id = ?").bind(body.enabled ? 1 : 0, sourceMatch[1]).run();
    if (!result.meta?.changes) return json({ error: "Monitored source not found" }, 404, cors);
    await recordAdminAction(env, actor, "monitor_source_toggled", "monitored_source", sourceMatch[1], { enabled: body.enabled });
    return json({ id: sourceMatch[1], enabled: body.enabled }, 200, cors);
  }

  if (path === "/api/admin/settings/monitor/run" && request.method === "POST") {
    if (readOnly) return json({ error: "This role cannot start monitoring runs" }, 403, cors);
    const result = await runOfferMonitor(env.DB);
    await recordAdminAction(env, actor, "monitor_run_started", "offer_monitor_run", result.runId, result);
    return json(result, 200, cors);
  }

  return null;
}

async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);

  if (!isOriginAllowed(request, env)) {
    return json({ error: "Origin not allowed" }, 403, cors);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const adminAuthResponse = await handleAdminAuth(request, env, cors, url);
  if (adminAuthResponse) return adminAuthResponse;

  const adminConsoleResponse = await handleAdminConsole(request, env, cors, url);
  if (adminConsoleResponse) return adminConsoleResponse;

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json(
      { ok: true, service: "finconsult-api" },
      200,
      cors,
    );
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    const authorization = request.headers.get("Authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
      return json({ error: "Authentication required" }, 401, cors);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json(
        { error: "Authentication service is not configured" },
        503,
        cors,
      );
    }

    const accessToken = match[1];

    try {
      const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_ANON_KEY,
        {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );

      // Verify the access token with Supabase Auth.
      const { data: authData, error: authError } =
        await supabase.auth.getUser(accessToken);

      if (authError || !authData.user) {
        return json(
          { error: "Invalid or expired session" },
          401,
          cors,
        );
      }

      const user = authData.user;

      // Fetch only the profile belonging to the verified user.
      // The user's token is forwarded so PostgreSQL RLS applies.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        return json(
          { error: "Profile service unavailable" },
          502,
          cors,
        );
      }

      return json(
        {
          user: {
            id: user.id,
            email: user.email ?? null,
          },
          profile: profile,
          profile_status: profile ? "available" : "missing",
        },
        200,
        cors,
      );
    } catch {
      return json(
        { error: "Authentication service unavailable" },
        502,
        cors,
      );
    }
  }

  if (url.pathname.startsWith("/api/admin/offer-changes")) {
    return handleAdminOfferChanges(request, env, cors, url);
  }

  return json({ error: "Not found" }, 404, cors);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(_controller: { cron: string }, env: Env): Promise<void> {
    const result = await runOfferMonitor(env.DB);
    console.log("Offer monitoring run completed", result);
  },
};
