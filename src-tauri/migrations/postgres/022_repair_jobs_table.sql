-- Migration 022: repair_jobs and repair_parts tables
-- P6: Real PostgreSQL backend for repair management, replacing mocked repair.api.ts
-- Additive only. Safe to run multiple times (idempotent CREATE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS repair_jobs (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               VARCHAR(50)  NOT NULL UNIQUE,  -- Human-readable ticket e.g. REP-0001
  customer_id          TEXT         REFERENCES parties(id) ON DELETE SET NULL,
  customer_name        TEXT         NOT NULL,           -- Denormalized for display even if party deleted
  customer_phone       TEXT,

  -- Device info
  device_type          TEXT         NOT NULL DEFAULT '',
  device_brand         TEXT         NOT NULL DEFAULT '',
  device_model         TEXT         NOT NULL DEFAULT '',
  device_color         TEXT         NOT NULL DEFAULT '',
  device_imei          TEXT         NOT NULL DEFAULT '',
  device_password      TEXT,

  -- Accessories received with device (stored as individual booleans)
  acc_charger          BOOLEAN      NOT NULL DEFAULT FALSE,
  acc_battery          BOOLEAN      NOT NULL DEFAULT FALSE,
  acc_sim              BOOLEAN      NOT NULL DEFAULT FALSE,
  acc_memory_card      BOOLEAN      NOT NULL DEFAULT FALSE,
  acc_cover            BOOLEAN      NOT NULL DEFAULT FALSE,
  acc_box              BOOLEAN      NOT NULL DEFAULT FALSE,
  acc_other            TEXT,

  -- Problem and inspection
  problem_description  TEXT         NOT NULL DEFAULT '',
  initial_inspection   TEXT         NOT NULL DEFAULT '[]',  -- JSON array of strings
  technician_id        TEXT         REFERENCES users(id) ON DELETE SET NULL,

  -- Job metadata
  priority             TEXT         NOT NULL DEFAULT 'Normal'
                         CHECK (priority IN ('Low', 'Normal', 'High', 'Urgent')),
  status               TEXT         NOT NULL DEFAULT 'Received'
                         CHECK (status IN (
                           'Received', 'Diagnosing', 'Waiting Customer Approval',
                           'Waiting Parts', 'Repair In Progress', 'Quality Check',
                           'Ready for Pickup', 'Delivered', 'Cancelled', 'Rejected',
                           'On Hold', 'Returned Under Warranty'
                         )),

  estimated_cost       BIGINT       NOT NULL DEFAULT 0,
  additional_charges   BIGINT       NOT NULL DEFAULT 0,
  discount             BIGINT       NOT NULL DEFAULT 0,
  expected_delivery_date TEXT,

  -- Notes
  internal_notes       TEXT,
  customer_notes       TEXT,

  -- Timeline events stored as JSONB for simplicity
  timeline             TEXT         NOT NULL DEFAULT '[]',  -- JSON array of RepairTimelineEvent

  -- Labor charges stored as JSONB
  labor_charges        TEXT         NOT NULL DEFAULT '[]',  -- JSON array of LaborCharge

  -- Image paths stored as JSONB
  images_before        TEXT         NOT NULL DEFAULT '[]',  -- JSON array of paths
  images_after         TEXT         NOT NULL DEFAULT '[]',
  images_proof         TEXT         NOT NULL DEFAULT '[]',

  -- Warranty
  warranty_period      TEXT,
  warranty_expiry_date TEXT,
  warranty_notes       TEXT,
  warranty_status      TEXT         CHECK (warranty_status IN ('Active', 'Expired', 'Voided')),

  -- Audit
  branch_id            TEXT         REFERENCES branches(id) ON DELETE SET NULL,
  performed_by         TEXT         REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT         NOT NULL,
  updated_at           TEXT         NOT NULL
);

-- Parts used in a repair job (separate table for stock linkage)
CREATE TABLE IF NOT EXISTS repair_parts (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id UUID   NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  product_id   TEXT    REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT    NOT NULL,   -- Denormalized snapshot
  product_sku  TEXT    NOT NULL DEFAULT '',
  qty          BIGINT  NOT NULL CHECK (qty > 0),
  cost         BIGINT  NOT NULL DEFAULT 0,  -- Cost per unit at time of use
  price        BIGINT  NOT NULL DEFAULT 0,  -- Selling price per unit
  added_at     TEXT    NOT NULL
);

-- Payments recorded against a repair job
CREATE TABLE IF NOT EXISTS repair_payments (
  id            UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id UUID   NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  amount        BIGINT NOT NULL CHECK (amount > 0),
  method        TEXT   NOT NULL DEFAULT 'CASH',
  reference     TEXT,
  created_at    TEXT   NOT NULL
);

-- Job ID sequence counter
CREATE SEQUENCE IF NOT EXISTS repair_job_seq START WITH 1 INCREMENT BY 1;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_repair_jobs_status       ON repair_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_customer      ON repair_jobs (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_branch        ON repair_jobs (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_technician    ON repair_jobs (technician_id);
CREATE INDEX IF NOT EXISTS idx_repair_parts_job          ON repair_parts (repair_job_id);
CREATE INDEX IF NOT EXISTS idx_repair_payments_job       ON repair_payments (repair_job_id);
