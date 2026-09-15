-- PostgreSQL Migration 002: Terminal Registry and Central Sync Audit
-- Mirrored directly from canonical SQLite migration 012

CREATE TABLE IF NOT EXISTS terminals (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    device_name TEXT NOT NULL,
    is_active INT NOT NULL DEFAULT 1,
    is_offline_terminal INT NOT NULL DEFAULT 0,
    registered_centrally INT NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pg_terminals_org ON terminals(organization_id);
CREATE INDEX IF NOT EXISTS idx_pg_terminals_branch ON terminals(branch_id);

CREATE TABLE IF NOT EXISTS sync_audit (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    client_event_id TEXT NOT NULL UNIQUE CHECK(length(client_event_id) = 36),
    terminal_id TEXT NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SYNCED',
    processed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pg_sync_audit_client_event ON sync_audit(client_event_id);
