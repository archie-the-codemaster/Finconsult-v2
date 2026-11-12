
import { createClient } from "@supabase/supabase-js";
import { runOfferMonitor, type D1Database } from "./offer-monitor";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SECRET_KEY?: string;
  key_main?: string;
  // Legacy Supabase key name retained for deployments that have not migrated yet.
  SUPABASE_SERVICE_ROLE_KEY?: string;
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
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
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
