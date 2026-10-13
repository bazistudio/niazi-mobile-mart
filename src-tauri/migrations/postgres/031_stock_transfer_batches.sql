-- Migration 031: stock_transfer_batches table for durable atomic batch idempotency
-- Supports F-13: Ensures multi-product transfer batches have a durable, unique identity
-- and cannot mutate inventory twice under concurrent requests or network retries.
-- Additive only. Safe to run multiple times (idempotent CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS stock_transfer_batches (
  id                    UUID        PRIMARY KEY,
  payload_hash          TEXT        NOT NULL,
  source_branch_id      TEXT        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  destination_branch_id TEXT        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  total_items           INT         NOT NULL,
  total_quantity        BIGINT      NOT NULL,
  response_payload      JSONB,
  reason                TEXT,
  notes                 TEXT,
  performed_by          TEXT        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TEXT        NOT NULL
);

-- Index for auditing batches by date
CREATE INDEX IF NOT EXISTS idx_stock_transfer_batches_created_at
  ON stock_transfer_batches (created_at DESC);

-- Index for querying batches by source branch
CREATE INDEX IF NOT EXISTS idx_stock_transfer_batches_source_branch
  ON stock_transfer_batches (source_branch_id, created_at DESC);

-- Index for querying batches by destination branch
CREATE INDEX IF NOT EXISTS idx_stock_transfer_batches_dest_branch
  ON stock_transfer_batches (destination_branch_id, created_at DESC);
