
import { createClient } from "@supabase/supabase-js";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_ORIGINS: string;
}

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

  return json({ error: "Not found" }, 404, cors);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
