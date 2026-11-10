PRAGMA foreign_keys = ON;

CREATE TABLE admin_users (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'analyst')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT
);

CREATE TABLE ai_provider_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (
        provider IN ('openai', 'google', 'anthropic', 'custom')
    ),
    label TEXT NOT NULL,
    base_url TEXT,
    default_model TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE provider_secrets (
    id TEXT PRIMARY KEY,
    config_id TEXT NOT NULL UNIQUE,
    ciphertext BLOB NOT NULL,
    nonce BLOB NOT NULL,
    wrapped_dek BLOB NOT NULL,
    wrap_nonce BLOB NOT NULL,
    kek_version TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (config_id)
        REFERENCES ai_provider_configs(id)
        ON DELETE CASCADE
);

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_created
    ON audit_log(created_at DESC);

CREATE TABLE daily_usage (
    usage_date TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_latency_ms INTEGER NOT NULL DEFAULT 0,
    estimated_cost_microusd INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date, provider, model)
);