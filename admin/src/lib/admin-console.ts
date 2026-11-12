const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body as T;
}

export type DashboardData = {
  monitoring: { total: number; enabled: number } | null;
  pending_changes: { count: number } | null;
  latest_run: { started_at: string; finished_at: string | null; checked_count: number; changed_count: number; error_count: number } | null;
  changes_30d: { count: number } | null;
  admin_count: number | null;
  active_sessions: { count: number } | null;
  recent_activity: AuditEvent[];
};
export type AuditEvent = { id: number; actor_email: string; action: string; target_type: string; target_id: string | null; details_json: string | null; created_at: string };
export type AiConfig = { id: string; provider: string; label: string; base_url: string | null; default_model: string; enabled: number; secret_configured: number; created_at: string; updated_at: string };
export type PlatformUser = { id: string; email: string; created_at: string; last_sign_in_at: string | null; confirmed_at: string | null; banned_until: string | null; admin_role: string | null };
export type MonitoredSource = { id: string; bank: string; label: string; url: string; locale: string; source_type: string; enabled: number; last_checked_at: string | null; last_status: number | null; last_error: string | null };

export const getDashboard = () => request<DashboardData>("/api/admin/dashboard");
export const getAiConfigs = () => request<{ configs: AiConfig[]; encryption_configured: boolean; read_only: boolean; can_panic: boolean }>("/api/admin/ai-configs");
export const createAiConfig = (value: Record<string, unknown>) => request<{ id: string }>("/api/admin/ai-configs", { method: "POST", body: JSON.stringify(value) });
export const updateAiConfig = (id: string, value: Record<string, unknown>) => request<{ id: string }>(`/api/admin/ai-configs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(value) });
export const deleteAiConfig = (id: string) => request<{ id: string }>(`/api/admin/ai-configs/${encodeURIComponent(id)}`, { method: "DELETE" });
export const deleteAiSecret = (id: string) => request<{ id: string }>(`/api/admin/ai-configs/${encodeURIComponent(id)}/secret`, { method: "DELETE" });
export const panicAiProviders = (confirmation: string) => request<{ ok: true; credentials_erased: number; providers_disabled: number }>("/api/admin/ai-configs/panic", { method: "POST", body: JSON.stringify({ confirmation }) });
export const getUsers = (page: number) => request<{ users: PlatformUser[]; page: number; per_page: number; has_more: boolean }>(`/api/admin/users?page=${page}`);
export const getAnalytics = (days: number) => request<{ days: number; usage: Array<Record<string, number | string>>; monitor_runs: Array<Record<string, string | number | null>>; changes: Array<{ review_status: string; count: number }>; sources: { total: number; enabled: number } | null }>(`/api/admin/analytics?days=${days}`);
export const getAudit = () => request<{ events: AuditEvent[]; active_sessions: Array<{ email: string; session_count: number; latest_session: number }> }>("/api/admin/audit");
export const getSources = () => request<{ sources: MonitoredSource[]; can_manage: boolean }>("/api/admin/settings/sources");
export const setSourceEnabled = (id: string, enabled: boolean) => request<{ id: string; enabled: boolean }>(`/api/admin/settings/sources/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
export const runMonitor = () => request<{ runId: string; checked: number; changed: number; errors: number }>("/api/admin/settings/monitor/run", { method: "POST" });
