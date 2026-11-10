
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/api";

type AuthMode = "login" | "register" | "forgot";

interface AuthPanelProps {
  session: Session | null;
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string;
  recoveryMode: boolean;
  onRecoveryComplete: () => void;
  onProfileUpdated: (profile: Profile) => void;
  onClose: () => void;
  onRefreshProfile: () => void;
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function AuthPanel({
  session,
  profile,
  profileLoading,
  profileError,
  recoveryMode,
  onRecoveryComplete,
  onProfileUpdated,
  onClose,
  onRefreshProfile,
}: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
  }, [profile?.display_name]);

  const showMessage = (text: string, isError = false) => {
    setMessage(text);
    setError(isError);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    showMessage("");

    try {
      if (mode === "register") {
        const name = displayName.trim();

        if (name.length < 2 || name.length > 40) {
          throw new Error(
            "Numele trebuie să aibă între 2 și 40 de caractere."
          );
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: name,
            },
          },
        });

        if (error) throw error;

        showMessage(
          data.session
            ? "Contul a fost creat și ești autentificat."
            : "Cont creat! Verifică emailul pentru confirmare."
        );
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        showMessage("Autentificare reușită!");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: window.location.origin,
          }
        );

        if (error) throw error;

        showMessage(
          "Dacă adresa este înregistrată, vei primi un email cu instrucțiunile de recuperare."
        );
      }
    } catch (err) {
      showMessage(
        err instanceof Error
          ? err.message
          : "A apărut o eroare neașteptată.",
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session) return;

    const name = displayName.trim();

    if (name.length < 2 || name.length > 40) {
      showMessage(
        "Numele trebuie să aibă între 2 și 40 de caractere.",
        true
      );
      return;
    }

    setSavingProfile(true);
    showMessage("");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ display_name: name })
        .eq("id", session.user.id)
        .select("display_name, created_at, updated_at")
        .single();

      if (error) throw error;

      onProfileUpdated(data as Profile);
      showMessage("Profilul a fost actualizat.");
    } catch (err) {
      showMessage(
        err instanceof Error
          ? err.message
          : "Nu s-a putut salva profilul.",
        true
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword.length < 8) {
      showMessage("Parola trebuie să aibă cel puțin 8 caractere.", true);
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("Parolele nu coincid.", true);
      return;
    }

    setSavingPassword(true);
    showMessage("");

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      showMessage("Parola a fost schimbată.");
    } catch (err) {
      showMessage(
        err instanceof Error
          ? err.message
          : "Nu s-a putut schimba parola.",
        true
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const finishRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword.length < 8) {
      showMessage("Parola trebuie să aibă cel puțin 8 caractere.", true);
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("Parolele nu coincid.", true);
      return;
    }

    setSavingPassword(true);
    showMessage("");

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      onRecoveryComplete();
      showMessage("Parola a fost resetată cu succes.");
    } catch (err) {
      showMessage(
        err instanceof Error
          ? err.message
          : "Nu s-a putut reseta parola.",
        true
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    showMessage("");

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      showMessage("Te-ai deconectat.");
    } catch (err) {
      showMessage(
        err instanceof Error ? err.message : "Deconectarea a eșuat.",
        true
      );
    } finally {
      setLoading(false);
    }
  };

  const passwordForm = (
    onSubmit: (event: FormEvent<HTMLFormElement>) => void,
    buttonText: string,
    busy: boolean
  ) => (
    <form onSubmit={onSubmit}>
      <label>
        Parolă nouă
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="Minimum 8 caractere"
        />
      </label>

      <label>
        Confirmă parola
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Introdu parola din nou"
        />
      </label>

      <button className="button" type="submit" disabled={busy}>
        {busy ? "Se procesează..." : buttonText}
      </button>
    </form>
  );

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
              {recoveryMode
                ? "Resetare parolă"
                : session
                  ? "Contul meu"
                  : mode === "forgot"
                    ? "Recuperare cont"
                    : "Autentificare"}
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

        {recoveryMode ? (
          <>
            <p className="muted-note">
              Alege o parolă nouă pentru contul tău.
            </p>

            {passwordForm(
              finishRecovery,
              "Resetează parola",
              savingPassword
            )}
          </>
        ) : session ? (
          <>
            <section className="surface-card form-card">
              <div className="eyebrow">CONT AUTENTIFICAT</div>

              <h3>
                {profile?.display_name || "Bine ai venit!"}
              </h3>

              <p className="muted-note">{session.user.email}</p>

              {profile?.created_at && (
                <p className="muted-note">
                  Membru din {formatDate(profile.created_at)}
                </p>
              )}

              {profileLoading && (
                <p className="muted-note">Se încarcă profilul...</p>
              )}

              {profileError && (
                <div className="notice notice-warning" role="alert">
                  {profileError}
                </div>
              )}

              <button
                className="button button-secondary"
                onClick={onRefreshProfile}
                disabled={profileLoading}
              >
                Reîncarcă profilul
              </button>
            </section>

            <section className="surface-card form-card">
              <h3>Informații personale</h3>

              <form onSubmit={saveProfile}>
                <label>
                  Nume afișat
                  <input
                    type="text"
                    minLength={2}
                    maxLength={40}
                    required
                    value={displayName}
                    onChange={(event) =>
                      setDisplayName(event.target.value)
                    }
                    placeholder="Cum vrei să fii numit?"
                  />
                </label>

                <button
                  className="button"
                  type="submit"
                  disabled={savingProfile || profileLoading || !profile}
                >
                  {savingProfile ? "Se salvează..." : "Salvează profilul"}
                </button>
              </form>
            </section>

            <section className="surface-card form-card">
              <h3>Securitate</h3>

              <p className="muted-note">
                Schimbă parola asociată contului tău.
              </p>

              {passwordForm(
                changePassword,
                "Schimbă parola",
                savingPassword
              )}
            </section>

            <button
              className="button button-secondary"
              onClick={signOut}
              disabled={loading}
            >
              {loading ? "Se deconectează..." : "Deconectare"}
            </button>
          </>
        ) : (
          <>
            {mode !== "forgot" && (
              <div className="auth-tabs">
                <button
                  className={`button ${
                    mode === "login" ? "" : "button-secondary"
                  }`}
                  onClick={() => {
                    setMode("login");
                    showMessage("");
                  }}
                >
                  Autentificare
                </button>

                <button
                  className={`button ${
                    mode === "register" ? "" : "button-secondary"
                  }`}
                  onClick={() => {
                    setMode("register");
                    showMessage("");
                  }}
                >
                  Creează cont
                </button>
              </div>
            )}

            <form onSubmit={submit}>
              {mode === "register" && (
                <label>
                  Nume afișat
                  <input
                    type="text"
                    minLength={2}
                    maxLength={40}
                    autoComplete="name"
                    required
                    value={displayName}
                    onChange={(event) =>
                      setDisplayName(event.target.value)
                    }
                    placeholder="Numele tău"
                  />
                </label>
              )}

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

              {mode !== "forgot" && (
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
              )}

              <button className="button" type="submit" disabled={loading}>
                {loading
                  ? "Se procesează..."
                  : mode === "register"
                    ? "Creează cont"
                    : mode === "forgot"
                      ? "Trimite email de recuperare"
                      : "Autentificare"}
              </button>
            </form>

            {mode === "login" && (
              <button
                className="button button-secondary"
                onClick={() => {
                  setMode("forgot");
                  showMessage("");
                }}
              >
                Am uitat parola
              </button>
            )}

            {mode === "forgot" && (
              <button
                className="button button-secondary"
                onClick={() => {
                  setMode("login");
                  showMessage("");
                }}
              >
                Înapoi la autentificare
              </button>
            )}
          </>
        )}

        {message && (
          <div
            className={`notice ${
              error ? "notice-danger" : "notice-success"
            }`}
            role="status"
          >
            {message}
          </div>
        )}
      </aside>
    </div>
  );
}
