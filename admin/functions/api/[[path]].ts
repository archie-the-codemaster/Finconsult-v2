interface PagesEnv {
  WORKER_API_BASE_URL?: string;
}

interface PagesContext {
  request: Request;
  env: PagesEnv;
}

const FORWARDED_HEADERS = ["accept", "authorization", "content-type", "cookie", "origin"];

export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  const base = env.WORKER_API_BASE_URL?.replace(/\/+$/, "");
  if (!base) return Response.json({ error: "Admin API proxy is not configured" }, { status: 503 });

  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, `${base}/`);
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();

  try {
    const response = await fetch(target, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "Admin API is unavailable" }, { status: 502 });
  }
}
