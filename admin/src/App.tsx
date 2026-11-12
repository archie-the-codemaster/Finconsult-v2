
import { useEffect, useState, type FormEvent } from "react";
import OfferReview from "./components/OfferReview";
import AdminPage from "./components/AdminPages";
import { getAdminSession, setAdminPassword, signInAdmin, signOutAdmin, type AdminSession } from "./lib/admin-auth";
import { getDashboard, type DashboardData } from "./lib/admin-console";
import { supabase } from "./lib/supabase";
import "./admin-review.css";
import "./admin-pages.css";

type Page =
  | "overview"
  | "ai"
  | "users"
  | "offers"
  | "analytics"
  | "security"
  | "settings";

const navigation: { id: Page; label: string; icon: string; group: string }[] = [
  { id: "overview", label: "Overview", icon: "◫", group: "Workspace" },
  { id: "ai", label: "AI Configuration", icon: "✳", group: "Workspace" },
  { id: "users", label: "User Management", icon: "♙", group: "Management" },
  { id: "offers", label: "Loan Source Review", icon: "↻", group: "Management" },
  { id: "analytics", label: "Analytics", icon: "▥", group: "Management" },
  { id: "security", label: "Security & Audit", icon: "◇", group: "System" },
  { id: "settings", label: "Platform Settings", icon: "⚙", group: "System" },
];

const pageInfo: Record<Page, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "A snapshot of your Finconsult platform.",
  },
  ai: {
    title: "AI Configuration",
    description: "Manage providers, models, and platform AI settings.",
  },
  users: {
    title: "User Management",
    description: "Manage platform accounts and access roles.",
  },
  offers: {
    title: "Loan Source Review",
    description: "Review changes detected on bank loan product pages.",
  },
  analytics: {
    title: "Analytics",
    description: "Monitor usage, performance, and estimated costs.",
  },
  security: {
    title: "Security & Audit",
    description: "Review administrative activity and security events.",
  },
  settings: {
    title: "Platform Settings",
    description: "Configure global platform behaviour.",
  },
};

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </article>
  );
}

function Overview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getDashboard().then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "Dashboard data is unavailable.")).finally(() => setLoading(false));
  }, []);
  const lastRun = data?.latest_run;
  const fmt = (value: string | null | undefined) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow">PLATFORM STATUS</div>
          <h2>Welcome to your control room.</h2>
          <p>Here's what's happening across Finconsult.</p>
        </div>
          <span className={`status-pill ${!loading && !error ? "admin-live-pill" : ""}`}>
          <span className="status-dot" />
            {loading ? "Connecting to admin API" : error ? "Admin API unavailable" : "Admin API connected"}
        </span>
      </div>

      <section className="metrics-grid">
        <MetricCard
          label="Admin accounts"
          value={data?.admin_count == null ? "—" : String(data.admin_count)}
          detail="Registered admin accounts"
          icon="♙"
        />
        <MetricCard
          label="AI requests"
          value="—"
          detail="AI usage logging not connected"
          icon="✳"
        />
        <MetricCard
          label="Loan changes awaiting review"
          value={data?.pending_changes?.count == null ? "—" : String(data.pending_changes.count)}
          detail="Detected changes in need of review"
          icon="↻"
        />
        <MetricCard
          label="System health"
          value={lastRun ? `${lastRun.error_count ? "Attention" : "Healthy"}` : "Pending"}
          detail={lastRun ? `Last scan ${fmt(lastRun.finished_at)}` : "No monitoring run yet"}
          icon="⌁"
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h3>Recent activity</h3>
              <p>Latest events across the platform</p>
            </div>
            <span className="subtle-tag">{data?.recent_activity.length ? "RECENT EVENTS" : "NO EVENTS YET"}</span>
          </div>
          {data?.recent_activity.length ? <div className="admin-activity-list">{data.recent_activity.map((event) => <div className="admin-activity-row" key={event.id}><span className="admin-activity-mark">↗</span><span><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.actor_email} · {fmt(event.created_at)}</small></span></div>)}</div> : <div className="empty-state">
            <div className="empty-icon">⌁</div>
            <strong>No activity to display</strong>
            <p>
              Events will appear when administrators review loan sources or change settings.
            </p>
          </div>}
        </article>

        <article className="panel infrastructure-panel">
          <div className="panel-heading">
            <div>
              <h3>Infrastructure</h3>
              <p>Connected platform services</p>
            </div>
          </div>
          <div className="service-list">
            {[
              ["Admin dashboard", "Connected"],
              ["Cloudflare Worker", error ? "Unavailable" : loading ? "Checking…" : "Connected"],
              ["D1 database", error ? "Unavailable" : loading ? "Checking…" : "Connected"],
              ["Loan sources", data ? `${data.monitoring?.enabled ?? 0} enabled` : "Checking…"],
            ].map(([name, status]) => (
              <div className="service-item" key={name}>
                <span className="service-indicator" />
                <span className="service-name">{name}</span>
                <span className="service-status">{status}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      {error && <div className="review-feedback review-error" role="alert">{error}</div>}
      <div className="notice">
        <span className="notice-icon">i</span>
        <div>
          <strong>Development environment</strong>
          <p>
            Dashboard figures come from the development admin database. AI usage and billing remain empty until those integrations are connected.
          </p>
        </div>
      </div>
    </>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (session: AdminSession) => void }) {
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [supabasePassword, setSupabasePassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSignedIn(await signInAdmin(email.trim(), password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function setupPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) {
      setError("Password setup is not configured. Contact your administrator.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: supabasePassword,
      });
      if (authError || !data.session) throw new Error("The existing administrator sign-in could not be verified.");
      await setAdminPassword(data.session.access_token, newPassword);
      await supabase.auth.signOut();
      onSignedIn(await signInAdmin(email.trim(), newPassword));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password setup failed.");
    } finally {
      setLoading(false);
      setSupabasePassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={mode === "login" ? submit : setupPassword}>
        <div className="brand-mark">F</div>
        <div className="eyebrow">FINCONSULT ADMIN</div>
        <h1>{mode === "login" ? "Sign in to continue" : "Set your admin password"}</h1>
        <p>{mode === "login" ? "Use your Finconsult admin credentials." : "Verify your existing admin account, then choose a password for future sign-ins."}</p>
        <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {mode === "login" ? (
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        ) : (
          <>
            <label>Current Supabase password<input type="password" autoComplete="current-password" required value={supabasePassword} onChange={(event) => setSupabasePassword(event.target.value)} /></label>
            <label>New admin password<input type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          </>
        )}
        {error && <div className="review-feedback review-error" role="alert">{error}</div>}
        <button className="review-primary-button" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Set password and sign in"}</button>
        <button className="auth-mode-button" type="button" onClick={() => { setMode(mode === "login" ? "setup" : "login"); setError(""); }}>
          {mode === "login" ? "Set or reset admin password" : "Back to sign in"}
        </button>
        <span className="auth-security-note">Passwords are salted and hashed on the server. Admin permissions are checked by the API.</span>
      </form>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signOutError, setSignOutError] = useState("");
  const [activePage, setActivePage] = useState<Page>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getAdminSession()
      .then((nextSession) => { if (alive) setSession(nextSession); })
      .catch(() => { if (alive) setSession(null); })
      .finally(() => { if (alive) setAuthLoading(false); });
    return () => {
      alive = false;
    };
  }, []);

  const activeInfo = pageInfo[activePage];

  function navigate(page: Page) {
    setActivePage(page);
    setMobileMenuOpen(false);
  }

  async function handleSignOut() {
    setSignOutError("");
    try {
      await signOutAdmin();
      setSession(null);
    } catch {
      setSignOutError("Could not end this session. Check your connection and try again.");
    }
  }

  if (authLoading) return <main className="auth-screen"><div className="review-spinner" /></main>;
  if (!session) return <SignIn onSignedIn={setSession} />;

  return (
    <div className="admin-shell">
      {mobileMenuOpen && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">F</div>
          <div>
            <strong>Finconsult</strong>
            <span>ADMINISTRATION</span>
          </div>
        </div>

        <div className="sidebar-label">CONTROL PANEL</div>

        {["Workspace", "Management", "System"].map((group) => (
          <div className="nav-group" key={group}>
            <div className="nav-group-label">{group}</div>
            {navigation
              .filter((item) => item.group === group)
              .map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${
                    activePage === item.id ? "nav-item-active" : ""
                  }`}
                  onClick={() => navigate(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {activePage === item.id && <span className="nav-active-mark" />}
                </button>
              ))}
          </div>
        ))}

        <div className="sidebar-bottom">
          <div className="environment-card">
            <span className="environment-dot" />
            <div>
              <strong>Development</strong>
              <span>Cloudflare Pages + Worker</span>
            </div>
          </div>
          <div className="sidebar-version">FINCONSULT ADMIN · v1.0.0</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>
          <div className="breadcrumb">
            <span>Finconsult</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{activeInfo.title}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-environment">ADMIN</span>
            <span className="admin-user-email">{session.email}</span>
            <button className="sign-out-button" onClick={() => void handleSignOut()}>Sign out</button>
          </div>
        </header>

        <div className="page-content">
          {signOutError && <div className="review-feedback review-error" role="alert">{signOutError}</div>}
          <div className="page-heading">
            <div>
              <div className="eyebrow">FINCONSULT / ADMIN</div>
              <h1>{activeInfo.title}</h1>
              <p>{activeInfo.description}</p>
            </div>
          </div>

          {activePage === "overview" ? (
            <Overview />
          ) : activePage === "offers" ? (
            <OfferReview />
          ) : (
            <AdminPage page={activePage} />
          )}

          <footer className="page-footer">
            <span>© 2026 Finconsult</span>
            <span>Administration panel</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
export default App;
