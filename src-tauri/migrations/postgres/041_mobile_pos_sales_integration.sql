-- Migration 041: mobile_sale_items linking core sales to serialized mobile_devices
--
-- Preserves the strict foreign key on standard product sale_lines (product_id REFERENCES products(id))
-- while seamlessly attaching serialized mobile handsets to the existing core sales, payments,
-- customer ledger, and cash movements pipeline.
--
-- All IDs are TEXT PRIMARY KEY CHECK(length(id) = 36) consistent with Niazi Mobile Mart schema.
-- Timestamps are TEXT NOT NULL (ISO 8601 UTC).

CREATE TABLE IF NOT EXISTS mobile_sale_items (
    id                      TEXT PRIMARY KEY CHECK(length(id) = 36),
    sale_id                 TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    device_id               TEXT NOT NULL REFERENCES mobile_devices(id) ON DELETE RESTRICT,
    organization_id         TEXT NOT NULL REFERENCES organizations(id),
    branch_id               TEXT NOT NULL REFERENCES branches(id),
    sold_by                 TEXT NOT NULL REFERENCES users(id),
    sold_by_role_snapshot   TEXT NOT NULL,
    brand_snapshot          TEXT NOT NULL CHECK(length(trim(brand_snapshot)) > 0),
    model_snapshot          TEXT NOT NULL CHECK(length(trim(model_snapshot)) > 0),
    imei1_snapshot          TEXT NOT NULL CHECK(length(imei1_snapshot) = 15),
    imei2_snapshot          TEXT,
    cost_price_snapshot     NUMERIC(12,2) NOT NULL CHECK(cost_price_snapshot >= 0),
    sale_price              NUMERIC(12,2) NOT NULL CHECK(sale_price >= 0),
    is_return               BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TEXT NOT NULL
);

-- Indices for performance and reporting
CREATE INDEX IF NOT EXISTS idx_mobile_sale_items_sale ON mobile_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_mobile_sale_items_device ON mobile_sale_items(device_id);
CREATE INDEX IF NOT EXISTS idx_mobile_sale_items_branch ON mobile_sale_items(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mobile_sale_items_sold_by ON mobile_sale_items(sold_by, created_at);

-- Partial unique index ensuring an active (non-returned) sale item can only exist once per device
CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_sale_items_unique_active_device
    ON mobile_sale_items(device_id)
    WHERE is_return = FALSE;

