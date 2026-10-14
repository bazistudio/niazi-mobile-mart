-- Migration 033: Sale idempotency keys table
-- Purpose (DEF-SALE-12): The sale submission endpoint had no protection against
-- duplicate requests. A double-click, network timeout, or retry would create a
-- second sale, deduct inventory twice, and double-charge the customer's ledger.
--
-- This migration creates a dedicated sale_idempotency_keys table that stores each
-- successfully committed sale's idempotency key with a unique constraint.
-- The backend checks this table inside the same database transaction as the sale:
--   - If the key is absent: proceed, commit, then INSERT the key.
--   - If the key already exists (committed sale): return the original sale_id.
--   - Concurrent requests for the same key: PostgreSQL's unique constraint and
--     transaction isolation guarantee exactly one winner; the other receives a
--     conflict error and is retried as a lookup.
--
-- Key design:
--   idempotency_key: client-supplied opaque string (e.g. pos_txn_<timestamp>_<rand>)
--   sale_id:         UUID of the committed sale
--   branch_id:       Branch scope (keys from different branches are isolated)
--   created_at:      For TTL cleanup (future: expire keys older than 30 days)
--
-- Payload hash is stored to detect conflicting reuse (same key, different payload).
-- A NULL payload_hash means the key predates this feature and is treated as a
-- committed key with unknown payload — the original sale is returned.
--
-- Retention: keys can safely be pruned after 30 days; the unique constraint
-- prevents any functional duplicate during normal operation.

-- UP

-- FINDING-04: branch_id and sale_id must be TEXT CHECK(length=36) to match the
-- existing schema convention (branches.id, sales.id are TEXT PRIMARY KEY CHECK(length=36)).
-- Declaring them as UUID causes a PostgreSQL type-operator mismatch on joins with sales.id.
-- If this migration was already applied with UUID columns, migration 034 alters them.
CREATE TABLE IF NOT EXISTS sale_idempotency_keys (
  idempotency_key  TEXT        NOT NULL,
  branch_id        TEXT        NOT NULL CHECK(length(branch_id) = 36),
  sale_id          TEXT        NOT NULL CHECK(length(sale_id) = 36),
  payload_hash     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sale_idempotency_keys_pkey PRIMARY KEY (idempotency_key, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_idempotency_sale_id
  ON sale_idempotency_keys (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_idempotency_created_at
  ON sale_idempotency_keys (created_at);

-- DOWN
-- DROP TABLE IF EXISTS sale_idempotency_keys;
