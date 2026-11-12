export interface AdminSession {
  email: string;
  role: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body as T;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    return await request<AdminSession>("/api/admin/auth/session");
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") return null;
    throw error;
  }
}

export function signInAdmin(email: string, password: string) {
  return request<AdminSession>("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signOutAdmin() {
  return request<{ ok: true }>("/api/admin/auth/logout", { method: "POST" });
}

export function setAdminPassword(accessToken: string, password: string) {
  return request<{ ok: true; email: string }>("/api/admin/auth/password", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
}
