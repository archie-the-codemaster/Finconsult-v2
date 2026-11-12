CREATE TABLE admin_sessions (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX idx_admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE admin_login_attempts (
    id TEXT PRIMARY KEY,
    subject_hash TEXT NOT NULL,
    attempted_at INTEGER NOT NULL
);

CREATE INDEX idx_admin_login_attempts_subject_time
    ON admin_login_attempts(subject_hash, attempted_at DESC);
