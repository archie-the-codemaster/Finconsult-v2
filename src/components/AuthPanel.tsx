import { useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/api";


interface AuthPanelProps {
  session: Session | null;
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string;
  onClose: () => void;
  onRefreshProfile: () => void;
}

export default function AuthPanel({
  session,
  profile,
  profileLoading,
  profileError,
  onClose,
  onRefreshProfile,
}: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const [apiResult, setApiResult] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setError(false);

    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        setMessage(
          data.session
            ? "Contul a fost creat și ești autentificat."
            : "Cont creat! Verifică-ți emailul pentru confirmare."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setMessage("Autentificare reușită!");
      }
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error
          ? err.message
          : "A apărut o eroare neașteptată."
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyWorker = async () => {
    setApiResult("");

    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        throw new Error("Nu există o sesiune activă.");
      }

      const apiBase = import.meta.env.VITE_API_BASE_URL;

      const response = await fetch(`${apiBase}/api/me`, {
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Worker request failed.");
      }

      setApiResult(
        `Worker confirmed identity: ${result.user.email}`
      );
    } catch (err) {
      setApiResult(
        err instanceof Error ? err.message : "API request failed."
      );
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setError(true);
      setMessage(error.message);
      return;
    }

    setMessage("Te-ai deconectat.");
  };

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-heading">
          <div>
            <div className="eyebrow">CONT FINCONSULT</div>
            <h2 id="auth-title">
              {session ? "Contul meu" : "Autentificare"}
            </h2>
          </div>

          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Închide"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {session ? (
          <>
            <div className="surface-card form-card">
              <div className="eyebrow">AUTENTIFICAT</div>
              <h3>{session.user.email}</h3>
              <p className="muted-note">
                Contul tău este conectat prin Supabase Auth.
              </p>
            </div>

            <h3>Conexiune backend</h3>
            <p className="muted-note">
              Verifică dacă Worker-ul poate valida sesiunea ta.
            </p>

            <button
              className="button"
              onClick={verifyWorker}
            >
              Testează conexiunea API
            </button>

            {apiResult && (
              <div className="notice notice-success" role="status">
                {apiResult}
              </div>
            )}

            <button
              className="button button-secondary"
              onClick={onRefreshProfile}
              disabled={profileLoading}
            >
              Reîncarcă profilul
            </button>

            <button
              className="button button-secondary"
              onClick={signOut}
            >
              Deconectare
            </button>
          </>
        ) : (
          <>
            <div className="auth-tabs">
              <button
                className={`button ${mode === "login" ? "" : "button-secondary"}`}
                onClick={() => {
                  setMode("login");
                  setMessage("");
                }}
              >
                Autentificare
              </button>

              <button
                className={`button ${mode === "register" ? "" : "button-secondary"}`}
                onClick={() => {
                  setMode("register");
                  setMessage("");
                }}
              >
                Creează cont
              </button>
            </div>

            <form onSubmit={submit}>
              <label>
                Adresă email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nume@exemplu.com"
                />
              </label>

              <label>
                Parolă
                <input
                  type="password"
                  autoComplete={
                    mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  minLength={6}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 6 caractere"
                />
              </label>

              <button
                className="button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Se procesează..."
                  : mode === "login"
                    ? "Autentificare"
                    : "Creează cont"}
              </button>
            </form>
          </>
        )}

        {message && (
          <div
            className={`notice ${error ? "notice-danger" : "notice-success"}`}
            role="status"
          >
            {message}
          </div>
        )}
      </aside>
    </div>
  );
}