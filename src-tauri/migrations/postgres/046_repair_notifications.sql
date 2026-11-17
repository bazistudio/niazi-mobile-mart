-- Migration 046: Repair Completion & System Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id                  TEXT PRIMARY KEY,
    organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    branch_id           TEXT REFERENCES branches(id) ON DELETE CASCADE,
    recipient_user_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
    type                TEXT NOT NULL,
    title               TEXT NOT NULL,
    message             TEXT NOT NULL,
    reference_type      TEXT NOT NULL DEFAULT 'REPAIR_JOB',
    reference_id        TEXT NOT NULL,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON notifications(recipient_user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_org_date
    ON notifications(organization_id, created_at DESC);
