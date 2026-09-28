-- =============================================================================
-- 007_parties_foundation.sql — Canonical Party identity (Phase 1.1)
-- =============================================================================
-- Purpose
--   Introduce `parties` as the canonical identity/contact record for anyone
--   the shop trades with. `customers` and `suppliers` remain the ROLE tables
--   (codes, credit limits, ledgers, sales/purchase references are unchanged)
--   and gain a nullable `party_id` link.
--
-- Safety
--   * Purely ADDITIVE: no DROP, no column type change, no data rewrite of
--     existing columns. Existing customer/supplier rows keep every value.
--   * IDEMPOTENT: PostgresAdapter::run_migrations() re-executes every file on
--     each server start inside one transaction, so every statement below is
--     guarded (IF NOT EXISTS / ON CONFLICT / WHERE party_id IS NULL).
--   * DETERMINISTIC backfill: party.id = role.id. Every PC (SQLite migration
--     021) and the central database derive the SAME party UUID for the same
--     legacy row without coordination. Rows are NEVER merged automatically
--     (phone is not unique, so any merge rule would be a guess).
--   * Backfilled parties carry updated_at = '1970-01-01T00:00:00+00:00'
--     (sentinel "derived, never edited") so any real later edit wins the
--     updated_at guard used by PARTY_UPSERTED and role mirroring.
--   * Self-healing: because the file re-runs on every start, any role row that
--     was inserted unlinked (e.g. through the legacy REST create path) is
--     linked on the next server start.
--
-- Preflight / verification query (read-only; expected result 0 | 0):
--   SELECT (SELECT count(*) FROM customers WHERE party_id IS NULL) AS unlinked_customers,
--          (SELECT count(*) FROM suppliers WHERE party_id IS NULL) AS unlinked_suppliers;
--   A supplier whose UUID equals a customer UUID is deliberately left unlinked
--   (reported by the query above) instead of being silently merged.
-- =============================================================================

CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    display_name TEXT NOT NULL CHECK(length(trim(display_name)) > 0),
    company_name TEXT,
    phone TEXT NOT NULL DEFAULT '',
    alternate_phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    is_active INT NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parties_phone ON parties(phone);
CREATE INDEX IF NOT EXISTS idx_parties_display_name ON parties(display_name);
CREATE INDEX IF NOT EXISTS idx_parties_is_active ON parties(is_active);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS party_id TEXT REFERENCES parties(id) ON DELETE RESTRICT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS party_id TEXT REFERENCES parties(id) ON DELETE RESTRICT;

-- One customer role and one supplier role per party at most.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_party_id ON customers(party_id) WHERE party_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_party_id ON suppliers(party_id) WHERE party_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Deterministic backfill: customers
-- ---------------------------------------------------------------------------
INSERT INTO parties (id, display_name, company_name, phone, alternate_phone, email, address, notes, is_active, created_at, updated_at)
SELECT c.id, COALESCE(NULLIF(trim(c.name), ''), c.customer_code), NULL, c.phone, c.alternate_phone, c.email, c.address, c.notes, c.is_active,
       c.created_at, '1970-01-01T00:00:00+00:00'
FROM customers c
WHERE c.party_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE customers c
SET party_id = c.id
WHERE c.party_id IS NULL
  AND EXISTS (SELECT 1 FROM parties p WHERE p.id = c.id)
  AND NOT EXISTS (SELECT 1 FROM customers o WHERE o.party_id = c.id);

-- ---------------------------------------------------------------------------
-- Deterministic backfill: suppliers (skip the theoretical UUID collision with
-- a customer so two different businesses are never merged silently)
-- ---------------------------------------------------------------------------
INSERT INTO parties (id, display_name, company_name, phone, alternate_phone, email, address, notes, is_active, created_at, updated_at)
SELECT s.id, COALESCE(NULLIF(trim(s.name), ''), s.supplier_code), NULL, s.phone, s.alternate_phone, s.email, s.address, s.notes, s.is_active,
       s.created_at, '1970-01-01T00:00:00+00:00'
FROM suppliers s
WHERE s.party_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = s.id)
ON CONFLICT (id) DO NOTHING;

UPDATE suppliers s
SET party_id = s.id
WHERE s.party_id IS NULL
  AND EXISTS (SELECT 1 FROM parties p WHERE p.id = s.id)
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = s.id)
  AND NOT EXISTS (SELECT 1 FROM suppliers o WHERE o.party_id = s.id);
