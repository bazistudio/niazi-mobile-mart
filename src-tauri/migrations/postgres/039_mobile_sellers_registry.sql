-- Migration: 039_mobile_sellers_registry.sql
-- Phase 2: Permanent Used-Mobile Seller Registry
-- Strictly additive — no existing columns, tables or constraints are altered.
-- Safe for repeated execution (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ── 1. Create mobile_sellers table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mobile_sellers (
    id                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id     TEXT NOT NULL REFERENCES organizations(id),
    name                TEXT NOT NULL CHECK(length(trim(name)) > 0),
    father_name         TEXT,
    cnic                TEXT CHECK(cnic IS NULL OR cnic ~ '^\d{5}-\d{7}-\d$'),
    phone               TEXT NOT NULL CHECK(length(trim(phone)) > 0),
    alternate_phone     TEXT,
    address             TEXT NOT NULL CHECK(length(trim(address)) > 0),
    city                TEXT,
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
                            CHECK(verification_status IN ('UNVERIFIED', 'IDENTITY_RECORDED', 'FLAGGED')),
    is_active           INT  NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    notes               TEXT,
    created_by          TEXT NOT NULL REFERENCES users(id),
    updated_by          TEXT REFERENCES users(id),
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

-- Partial unique index: one CNIC per organization (NULL CNICs are excluded,
-- allowing multiple sellers without a CNIC in the same org).
CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_sellers_org_cnic
    ON mobile_sellers (organization_id, cnic)
    WHERE cnic IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mobile_sellers_org_name
    ON mobile_sellers (organization_id, name);

CREATE INDEX IF NOT EXISTS idx_mobile_sellers_org_phone
    ON mobile_sellers (organization_id, phone);

-- ── 3. Add nullable seller_id FK to mobile_purchase_paperwork ────────────────

ALTER TABLE mobile_purchase_paperwork
    ADD COLUMN IF NOT EXISTS seller_id TEXT
        REFERENCES mobile_sellers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_mobile_paperwork_seller
    ON mobile_purchase_paperwork (seller_id)
    WHERE seller_id IS NOT NULL;

-- ── 4. Historical backfill ───────────────────────────────────────────────────
-- Inserts one seller per (organization_id, seller_cnic) using the earliest
-- paperwork row as the canonical profile source.
-- Skips rows without a valid CNIC format.
-- ON CONFLICT DO NOTHING makes this idempotent.

INSERT INTO mobile_sellers (
    id,
    organization_id,
    name,
    father_name,
    cnic,
    phone,
    address,
    verification_status,
    is_active,
    created_by,
    created_at,
    updated_at
)
SELECT DISTINCT ON (p.organization_id, p.seller_cnic)
    gen_random_uuid()::text   AS id,
    p.organization_id,
    p.seller_name             AS name,
    p.father_name,
    p.seller_cnic             AS cnic,
    p.seller_phone            AS phone,
    p.seller_address          AS address,
    'UNVERIFIED'              AS verification_status,
    1                         AS is_active,
    p.recorded_by             AS created_by,
    p.created_at,
    p.created_at              AS updated_at
FROM mobile_purchase_paperwork p
WHERE p.seller_cnic ~ '^\d{5}-\d{7}-\d$'
ORDER BY p.organization_id, p.seller_cnic, p.created_at ASC, p.id ASC
ON CONFLICT DO NOTHING;

-- ── 5. Link historical paperwork rows to their matching seller ───────────────
-- Only updates rows that already have a valid CNIC and are not yet linked.
-- Stays within organization boundaries.

UPDATE mobile_purchase_paperwork p
SET    seller_id = s.id
FROM   mobile_sellers s
WHERE  p.organization_id = s.organization_id
  AND  p.seller_cnic     = s.cnic
  AND  p.seller_id IS NULL;
