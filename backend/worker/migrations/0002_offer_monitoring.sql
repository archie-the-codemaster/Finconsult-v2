CREATE TABLE monitored_sources (
    id TEXT PRIMARY KEY,
    bank TEXT NOT NULL,
    label TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    locale TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('product_page', 'document')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    last_checked_at TEXT,
    last_status INTEGER,
    last_content_hash TEXT,
    etag TEXT,
    last_modified TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE offer_monitor_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    checked_count INTEGER NOT NULL DEFAULT 0,
    changed_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE offer_source_changes (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    http_status INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    content_type TEXT,
    extracted_text TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'reviewed', 'dismissed')),
    reviewed_at TEXT,
    reviewed_by TEXT,
    FOREIGN KEY (run_id) REFERENCES offer_monitor_runs(id),
    FOREIGN KEY (source_id) REFERENCES monitored_sources(id)
);

CREATE INDEX idx_offer_changes_review ON offer_source_changes(review_status, detected_at DESC);
CREATE INDEX idx_offer_changes_source ON offer_source_changes(source_id, detected_at DESC);
