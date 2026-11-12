import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createAiConfig, deleteAiConfig, deleteAiSecret, getUsers, getAiConfigs, getAnalytics, getAudit, panicAiProviders,
  getSources, runMonitor, setSourceEnabled, updateAiConfig,
  type PlatformUser, type AiConfig, type AuditEvent, type MonitoredSource,
} from "../lib/admin-console";

type AdminPageId = "ai" | "users" | "analytics" | "security" | "settings";
const dateTime = (value: string | number | null | undefined) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(typeof value === "number" ? new Date(value * 1000) : new Date(value)) : "—";
const readable = (value: string) => value.replaceAll("_", " ");

function Feedback({ error, notice }: { error: string; notice: string }) {
  return <>{error && <div className="review-feedback review-error" role="alert">{error}</div>}{notice && <div className="review-feedback review-success" role="status">{notice}</div>}</>;
}

function AiConfiguration() {
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [encryption, setEncryption] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canPanic, setCanPanic] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState({ provider: "openai", label: "", default_model: "", base_url: "", api_key: "", enabled: false });
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await getAiConfigs(); setConfigs(result.configs); setEncryption(result.encryption_configured); setCanManage(!result.read_only); setCanPanic(result.can_panic); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load AI providers."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function beginEdit(config: AiConfig) {
    setEditing(config.id); setNotice("");
    setDraft({ provider: config.provider, label: config.label, default_model: config.default_model, base_url: config.base_url ?? "", api_key: "", enabled: Boolean(config.enabled) });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...draft, base_url: draft.base_url || null };
      if (editing === "new") await createAiConfig(payload); else await updateAiConfig(editing, payload);
      setNotice("Provider configuration saved."); setEditing(""); setDraft({ provider: "openai", label: "", default_model: "", base_url: "", api_key: "", enabled: false }); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save provider configuration."); }
    finally { setSaving(false); }
  }
  async function remove(config: AiConfig) {
    if (!window.confirm(`Delete ${config.label}?`)) return;
    setError(""); setNotice("");
    try { await deleteAiConfig(config.id); setNotice("Provider configuration deleted."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete provider."); }
  }
  async function removeKey(config: AiConfig) {
    if (!window.confirm(`Remove the stored API key for ${config.label}? This will also disable the provider.`)) return;
    setError(""); setNotice("");
    try { await deleteAiSecret(config.id); setDraft((value) => ({ ...value, enabled: false, api_key: "" })); setNotice("API key removed and provider disabled."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove the API key."); }
  }
  async function panic() {
    const confirmation = window.prompt("This permanently deletes every stored provider API key and disables every AI provider. It does not revoke keys with their providers. Type DISABLE ALL AI PROVIDERS to continue.");
    if (confirmation === null) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await panicAiProviders(confirmation.trim());
      setEditing("");
      setNotice(`Emergency stop complete: ${result.credentials_erased} stored key${result.credentials_erased === 1 ? "" : "s"} erased and ${result.providers_disabled} provider${result.providers_disabled === 1 ? "" : "s"} disabled. Revoke exposed keys with their providers.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Emergency stop failed."); }
    finally { setSaving(false); }
  }
  const form = editing !== "";
  return <div className="admin-page-stack"><Feedback error={error} notice={notice} />
    <section className="panel admin-explainer"><strong>Provider settings</strong><p>Choose a provider, enter its model ID, and store its API key for later AI integration. Keys are encrypted by the Worker before they enter D1 and are never returned to this page. These settings do not send requests to providers yet.</p><span className={`admin-state ${encryption ? "admin-state-good" : "admin-state-warn"}`}>{encryption ? "Secret encryption configured" : "Set AI_CONFIG_KEK to save API keys"}</span></section>
    {!form && <div className="admin-section-heading"><div><h2>Configured providers</h2><p>{configs.length} provider{configs.length === 1 ? "" : "s"}</p></div><button className="review-primary-button" disabled={!canManage} onClick={() => { setEditing("new"); setError(""); setNotice(""); }}>Add provider</button></div>}
    {form && <form className="panel admin-form" onSubmit={(event) => void save(event)}><div className="admin-section-heading"><div><h2>{editing === "new" ? "Add provider" : "Edit provider"}</h2><p>Credentials are encrypted by the Worker and never displayed again.</p></div><button type="button" className="review-secondary-button" onClick={() => setEditing("")}>Cancel</button></div>
      <div className="admin-form-grid"><label>Provider<select value={draft.provider} disabled={editing !== "new"} onChange={(e) => setDraft({ ...draft, provider: e.target.value })}><option value="openai">OpenAI</option><option value="google">Google</option><option value="anthropic">Anthropic</option><option value="custom">Custom compatible API</option></select></label><label>Display name<input required maxLength={80} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label><label>Model ID<input required maxLength={120} placeholder="Enter the model ID from your provider" value={draft.default_model} onChange={(e) => setDraft({ ...draft, default_model: e.target.value })} /></label><label>Base URL (optional)<input type="url" placeholder="https://api.example.com" value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} /></label><label className="admin-form-wide">Provider API key {editing !== "new" && <span className="admin-muted">(blank keeps the saved key)</span>}<input type="password" autoComplete="new-password" value={draft.api_key} onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} placeholder={encryption ? "Paste key to save or replace" : "Configure AI_CONFIG_KEK first"} disabled={!encryption} required={editing === "new" && draft.enabled} /></label><label className="admin-checkbox"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />Enabled in configuration</label></div>
      {editing !== "new" && configs.find((config) => config.id === editing)?.secret_configured === 1 && <button type="button" className="review-secondary-button admin-remove-key" disabled={!canManage} onClick={() => void removeKey(configs.find((config) => config.id === editing)!)}>Remove stored API key and disable provider</button>}
      <button className="review-primary-button" disabled={saving || !canManage}>{saving ? "Saving…" : "Save provider"}</button></form>}
    {loading ? <div className="panel review-empty"><span className="review-spinner" />Loading providers…</div> : configs.length === 0 ? <div className="panel review-empty"><strong>No providers configured</strong><p>Add a provider to keep its model and encrypted credential settings in one place.</p></div> : <div className="admin-card-list">{configs.map((config) => <article className="panel admin-list-card" key={config.id}><div className="admin-card-main"><div className="admin-card-title"><span className="admin-provider-icon">✳</span><div><strong>{config.label}</strong><span>{config.provider} · {config.default_model}</span></div></div><div className="admin-card-tags"><span className={`admin-state ${config.enabled ? "admin-state-good" : ""}`}>{config.enabled ? "Enabled" : "Disabled"}</span><span className="admin-state">{config.secret_configured ? "Key stored" : "No key"}</span></div></div><div className="admin-card-actions"><button className="review-secondary-button" disabled={!canManage} onClick={() => beginEdit(config)}>Edit</button><button className="review-secondary-button" disabled={!canManage} onClick={() => void remove(config)}>Delete</button></div></article>)} </div>}
    {canPanic && <section className="admin-panic-zone"><div><strong>Emergency stop</strong><p>Erase all provider API keys stored in D1 and disable every configured provider. This cannot revoke keys at Google or other providers; revoke any compromised key there as well.</p></div><button className="admin-panic-button" disabled={saving} onClick={() => void panic()}>{saving ? "Working…" : "Panic: erase keys and disable AI"}</button></section>}
  </div>;
}

function UserManagement() {
  const [users, setUsers] = useState<PlatformUser[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [page, setPage] = useState(1); const [hasMore, setHasMore] = useState(false); const [filter, setFilter] = useState("");
  const load = useCallback(async (nextPage: number) => { setLoading(true); setError(""); try { const result = await getUsers(nextPage); setUsers(result.users); setHasMore(result.has_more); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load users."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(page); }, [load, page]);
  const filteredUsers = users.filter((user) => user.email.toLowerCase().includes(filter.trim().toLowerCase()));
  return <div className="admin-page-stack"><Feedback error={error} notice=""/><section className="panel admin-explainer"><strong>Registered accounts</strong><p>User records come from Supabase Auth. Admin role assignments are shown from the protected admin table. This page is currently a directory; account creation, deletion, and access suspension are handled through Supabase until those workflows are implemented here.</p></section><div className="admin-section-heading"><div><h2>Users</h2><p>Page {page} · {users.length} loaded</p></div><div className="admin-user-tools"><input aria-label="Filter this page by email" className="admin-search-input" placeholder="Filter email on this page" value={filter} onChange={(event) => setFilter(event.target.value)} /><button className="review-secondary-button" onClick={() => void load(page)} disabled={loading}>Refresh</button></div></div>{loading ? <div className="panel review-empty"><span className="review-spinner"/>Loading users…</div> : users.length === 0 ? <div className="panel review-empty"><strong>No user accounts found</strong><p>Create accounts through Supabase Auth; they will appear here after signup.</p></div> : filteredUsers.length === 0 ? <div className="panel review-empty"><strong>No matching users</strong><p>Try another email search.</p></div> : <div className="panel admin-table-wrap"><table className="admin-table"><thead><tr><th>Email</th><th>Account status</th><th>Admin role</th><th>Registered</th><th>Last sign in</th></tr></thead><tbody>{filteredUsers.map((user) => { const banned = user.banned_until && new Date(user.banned_until).getTime() > Date.now(); return <tr key={user.id}><td className="admin-table-primary">{user.email || "Email not set"}</td><td><span className={`admin-state ${banned || !user.confirmed_at ? "admin-state-warn" : "admin-state-good"}`}>{banned ? "Suspended" : user.confirmed_at ? "Active" : "Awaiting confirmation"}</span></td><td>{user.admin_role ? <span className="admin-role-badge">{user.admin_role}</span> : "User"}</td><td>{dateTime(user.created_at)}</td><td>{dateTime(user.last_sign_in_at)}</td></tr>; })}</tbody></table></div>}<div className="admin-pagination"><button className="review-secondary-button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>Previous</button><span>Page {page}</span><button className="review-secondary-button" onClick={() => setPage((value) => value + 1)} disabled={!hasMore || loading}>Next</button></div></div>;
}

function Analytics() {
  const [days, setDays] = useState(30); const [data, setData] = useState<Awaited<ReturnType<typeof getAnalytics>> | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setData(await getAnalytics(days)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load analytics."); } finally { setLoading(false); } }, [days]);
  useEffect(() => { void load(); }, [load]);
  const usage = data?.usage ?? []; const totalRuns = data?.monitor_runs.reduce((sum, row) => sum + Number(row.checked_count ?? 0), 0) ?? 0; const detected = data?.monitor_runs.reduce((sum, row) => sum + Number(row.changed_count ?? 0), 0) ?? 0;
  const maxRequests = Math.max(1, ...usage.map((row) => Number(row.requests ?? 0)));
  return <div className="admin-page-stack"><Feedback error={error} notice=""/><div className="admin-section-heading"><div><h2>Platform activity</h2><p>Real measurements from the admin D1 database</p></div><select className="admin-range-select" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></div>{loading ? <div className="panel review-empty"><span className="review-spinner"/>Loading analytics…</div> : <><div className="admin-stats-grid"><article className="panel admin-stat"><span>AI requests</span><strong>{usage.reduce((sum, row) => sum + Number(row.requests ?? 0), 0).toLocaleString()}</strong><small>{usage.length ? `Recorded over ${days} days` : "No AI request telemetry recorded"}</small></article><article className="panel admin-stat"><span>Monitoring checks</span><strong>{totalRuns.toLocaleString()}</strong><small>{data?.monitor_runs.length ?? 0} recent runs loaded</small></article><article className="panel admin-stat"><span>Source changes detected</span><strong>{detected.toLocaleString()}</strong><small>Across the recent monitoring runs</small></article><article className="panel admin-stat"><span>Estimated AI cost</span><strong>${((usage.reduce((sum, row) => sum + Number(row.estimated_cost_microusd ?? 0), 0) / 1_000_000)).toFixed(4)}</strong><small>{usage.length ? "Estimated from recorded token usage" : "No billing data recorded"}</small></article></div><section className="panel admin-chart-panel"><div className="admin-section-heading"><div><h2>AI requests by day</h2><p>Empty until AI traffic is connected to usage logging.</p></div></div>{usage.length ? <div className="admin-bar-chart">{[...usage].reverse().map((row) => <div className="admin-bar-column" key={String(row.usage_date)} title={`${row.usage_date}: ${row.requests} requests`}><div className="admin-bar" style={{ height: `${Math.max(3, Number(row.requests ?? 0) / maxRequests * 100)}%` }} /><span>{String(row.usage_date).slice(5)}</span></div>)}</div> : <div className="admin-empty-inline">No AI usage has been recorded yet. Monitoring activity is shown above.</div>}</section><section className="panel admin-table-wrap"><div className="admin-section-heading admin-inset-heading"><div><h2>Recent monitoring runs</h2><p>Scheduled every 12 hours, or started from Platform Settings</p></div></div><table className="admin-table"><thead><tr><th>Started</th><th>Checked</th><th>Changed</th><th>Errors</th><th>Finished</th></tr></thead><tbody>{(data?.monitor_runs ?? []).map((run, index) => <tr key={String(run.id ?? index)}><td>{dateTime(String(run.started_at ?? ""))}</td><td>{run.checked_count}</td><td>{run.changed_count}</td><td>{run.error_count}</td><td>{dateTime(run.finished_at as string | null)}</td></tr>)}</tbody></table>{!data?.monitor_runs.length && <div className="admin-empty-inline">No monitoring runs have completed yet.</div>}</section></>}</div>;
}

function SecurityAudit() {
  const [events, setEvents] = useState<AuditEvent[]>([]); const [sessions, setSessions] = useState<Array<{ email: string; session_count: number; latest_session: number }>>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const result = await getAudit(); setEvents(result.events); setSessions(result.active_sessions); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load audit data."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="admin-page-stack"><Feedback error={error} notice=""/><div className="admin-section-heading"><div><h2>Security activity</h2><p>Admin actions recorded by the Worker</p></div><button className="review-secondary-button" onClick={() => void load()} disabled={loading}>Refresh</button></div>{loading ? <div className="panel review-empty"><span className="review-spinner"/>Loading audit data…</div> : <><div className="admin-stats-grid admin-stats-two"><article className="panel admin-stat"><span>Active admin sessions</span><strong>{sessions.reduce((sum, session) => sum + session.session_count, 0)}</strong><small>Sessions expire after eight hours</small></article><article className="panel admin-stat"><span>Recent audit events</span><strong>{events.length}</strong><small>Most recent 100 recorded events</small></article></div><section className="panel"><div className="admin-section-heading"><div><h2>Signed-in administrators</h2><p>Active Worker sessions</p></div></div>{sessions.length ? <div className="admin-session-list">{sessions.map((session) => <div className="admin-session-row" key={session.email}><span className="admin-session-avatar">{session.email[0]?.toUpperCase()}</span><span><strong>{session.email}</strong><small>Last session created {dateTime(session.latest_session)}</small></span><span className="admin-state admin-state-good">{session.session_count} active</span></div>)}</div> : <div className="admin-empty-inline">No active sessions recorded.</div>}</section><section className="panel admin-table-wrap"><div className="admin-section-heading admin-inset-heading"><div><h2>Audit log</h2><p>Administrative changes and review decisions</p></div></div>{events.length ? <table className="admin-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{dateTime(event.created_at)}</td><td>{event.actor_email}</td><td className="admin-table-primary">{readable(event.action)}</td><td>{event.target_type}{event.target_id ? ` · ${event.target_id}` : ""}</td></tr>)}</tbody></table> : <div className="admin-empty-inline">No audit events have been recorded yet.</div>}</section></>}</div>;
}

function PlatformSettings() {
  const [sources, setSources] = useState<MonitoredSource[]>([]); const [canManage, setCanManage] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const result = await getSources(); setSources(result.sources); setCanManage(result.can_manage); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load platform settings."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function toggle(source: MonitoredSource) { setBusy(source.id); setError(""); setNotice(""); try { await setSourceEnabled(source.id, !source.enabled); setNotice(`${source.label} ${source.enabled ? "paused" : "enabled"}.`); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update source."); } finally { setBusy(""); } }
  async function scanNow() { setBusy("scan"); setError(""); setNotice(""); try { const result = await runMonitor(); setNotice(`Monitoring finished: ${result.checked} checked, ${result.changed} changed, ${result.errors} errors.`); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Monitoring run failed."); } finally { setBusy(""); } }
  return <div className="admin-page-stack"><Feedback error={error} notice={notice}/><section className="panel admin-explainer"><strong>Loan source monitoring</strong><p>Enabled sources are checked by the scheduled Worker every 12 hours. You can pause sources or run a scan now. The monitor follows each source’s configured bank URL.</p></section><div className="admin-section-heading"><div><h2>Monitored sources</h2><p>{sources.filter((source) => source.enabled).length} of {sources.length} enabled</p></div><button className="review-primary-button" disabled={!canManage || busy !== "" || loading} onClick={() => void scanNow()}>{busy === "scan" ? "Scanning…" : "Run scan now"}</button></div>{loading ? <div className="panel review-empty"><span className="review-spinner"/>Loading sources…</div> : sources.length === 0 ? <div className="panel review-empty"><strong>No sources loaded yet</strong><p>Run the monitor once or wait for its next scheduled run to seed the bank source list.</p></div> : <div className="admin-card-list">{sources.map((source) => <article className="panel admin-source-card" key={source.id}><div className="admin-source-top"><div><div className="admin-bank-name">{source.bank}</div><strong>{source.label}</strong><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a></div><label className={`admin-toggle ${source.enabled ? "admin-toggle-on" : ""}`}><input type="checkbox" checked={Boolean(source.enabled)} disabled={!canManage || busy === source.id} onChange={() => void toggle(source)}/><span/>{source.enabled ? "Enabled" : "Paused"}</label></div><div className="admin-source-meta"><span>Locale: {source.locale}</span><span>Last checked: {dateTime(source.last_checked_at)}</span><span>{source.last_status ? `HTTP ${source.last_status}` : source.last_error ? "Check failed" : "Not checked"}</span></div>{source.last_error && <div className="admin-source-error">{source.last_error}</div>}</article>)}</div>}</div>;
}

export default function AdminPage({ page }: { page: AdminPageId }) {
  if (page === "ai") return <AiConfiguration />;
  if (page === "users") return <UserManagement />;
  if (page === "analytics") return <Analytics />;
  if (page === "security") return <SecurityAudit />;
  return <PlatformSettings />;
}
