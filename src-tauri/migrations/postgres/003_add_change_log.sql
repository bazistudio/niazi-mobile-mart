-- PostgreSQL Migration 003: Central Change Log Table for Downstream Delta Sync
CREATE TABLE IF NOT EXISTS change_log (
    sequence BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    client_event_id TEXT,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_change_log_org_seq ON change_log(organization_id, sequence);
CREATE INDEX IF NOT EXISTS idx_change_log_branch_seq ON change_log(branch_id, sequence);
