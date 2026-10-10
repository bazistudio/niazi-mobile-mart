-- Migration 017: Ensure stock and stock_movements tables exist
-- Idempotent safety migration.
--
-- The stock and stock_movements tables were defined in 001_initial_schema.sql
-- using CREATE TABLE IF NOT EXISTS. This migration re-asserts them to guarantee
-- they are present on any live PostgreSQL instance where 001 may have run
-- partially or where schema drift has occurred.
--
-- Also adds a reference_id index on stock_movements that the sync push handler
-- uses for idempotency checks (INVENTORY_OPERATION_RECORDED deduplication).

-- Ensure stock table exists (primary store for current quantity per product+branch)
CREATE TABLE IF NOT EXISTS stock (
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id  TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity   BIGINT NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (product_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_branch_id ON stock(branch_id);

-- Ensure stock_movements table exists (append-only audit log of every stock change)
CREATE TABLE IF NOT EXISTS stock_movements (
    id              TEXT PRIMARY KEY CHECK(length(id) = 36),
    product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    branch_id       TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    movement_type   TEXT NOT NULL CHECK(movement_type IN ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT')),
    quantity        BIGINT NOT NULL CHECK(quantity > 0),
    previous_stock  BIGINT NOT NULL CHECK(previous_stock >= 0),
    resulting_stock BIGINT NOT NULL CHECK(resulting_stock >= 0),
    reason          TEXT,
    performed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    reference_id    TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product    ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch     ON stock_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created    ON stock_movements(created_at);

-- Index used by sync push handler to detect duplicate INVENTORY_OPERATION_RECORDED events
-- (idempotency: SELECT id FROM stock_movements WHERE reference_id = $clientEventId LIMIT 1)
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_id)
    WHERE reference_id IS NOT NULL;
