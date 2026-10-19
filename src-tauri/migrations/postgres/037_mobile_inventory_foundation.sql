-- Migration 037: mobile_devices, mobile_imei_identifiers, mobile_purchase_paperwork,
--                mobile_inspection_records, mobile_device_movements
--
-- Five-table Mobile Inventory foundation.
-- All IDs are TEXT PRIMARY KEY CHECK(length(id) = 36) consistent with main schema.
-- All timestamps are TEXT NOT NULL (ISO string, e.g. new Date().toISOString()).
-- Gate 3 and Gate 4 remain CLOSED. This file must not be executed until separately authorized.

-- -----------------------------------------------------------------------------
-- Table 1: mobile_devices
-- The central serialized-device record. One row per physical handset.
-- status is intentionally limited to IN_STOCK | INSPECTION | SOLD.
-- RETURNED and TRANSFERRED are excluded from the current-status constraint per owner decision 4 and 12.
-- supplier_id is nullable and applies to NEW phones only (enforced application-layer in Phase C).
-- sale_id is reserved for the future Phase F sale flow.
-- cost_price is immutable after registration (enforced application-layer in Phase C).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mobile_devices (
    id                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    organization_id     TEXT NOT NULL REFERENCES organizations(id),
    branch_id           TEXT NOT NULL REFERENCES branches(id),
    brand               TEXT NOT NULL CHECK(length(trim(brand)) > 0),
    model               TEXT NOT NULL CHECK(length(trim(model)) > 0),
    storage             TEXT NOT NULL,
    ram                 TEXT,
    color               TEXT,
    serial_number       TEXT,
    pta_status          TEXT NOT NULL
                            CHECK(pta_status IN ('PTA_APPROVED', 'NON_PTA', 'JV', 'GEVEY')),
    condition           TEXT NOT NULL
                            CHECK(condition IN ('NEW', 'USED')),
    status              TEXT NOT NULL DEFAULT 'IN_STOCK'
                            CHECK(status IN ('IN_STOCK', 'INSPECTION', 'SOLD')),
    cost_price          NUMERIC(12,2) NOT NULL CHECK(cost_price >= 0),
    expected_sale_price NUMERIC(12,2) CHECK(expected_sale_price >= 0),
    supplier_id         TEXT REFERENCES suppliers(id) ON DELETE RESTRICT,
    sale_id             TEXT REFERENCES sales(id),
    notes               TEXT,
    created_by          TEXT NOT NULL REFERENCES users(id),
    updated_by          TEXT REFERENCES users(id),
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mobile_devices_branch
    ON mobile_devices (branch_id, status);

CREATE INDEX IF NOT EXISTS idx_mobile_devices_org_status
    ON mobile_devices (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_mobile_devices_sale
    ON mobile_devices (sale_id)
    WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mobile_devices_supplier
    ON mobile_devices (supplier_id)
    WHERE supplier_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Table 2: mobile_imei_identifiers
-- Normalized IMEI storage. IMEI uniqueness is organization-wide and permanent.
-- IMEI1 required / IMEI2 optional is enforced application-layer in Phase C.
-- Cross-domain uniqueness with repair_jobs.imei is deferred.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mobile_imei_identifiers (
    id              TEXT PRIMARY KEY CHECK(length(id) = 36),
    device_id       TEXT NOT NULL REFERENCES mobile_devices(id) ON DELETE RESTRICT,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    imei            TEXT NOT NULL
                        CHECK(length(imei) = 15 AND imei ~ '^[0-9]{15}$'),
    slot            TEXT NOT NULL
                        CHECK(slot IN ('IMEI1', 'IMEI2')),
    created_at      TEXT NOT NULL,
    UNIQUE (organization_id, imei)
);

CREATE INDEX IF NOT EXISTS idx_mobile_imei_device
    ON mobile_imei_identifiers (device_id);

-- -----------------------------------------------------------------------------
-- Table 3: mobile_purchase_paperwork
-- Legal seller-identity record for every USED-phone acquisition.
-- One record per device (UNIQUE device_id).
-- voucher_no is mandatory, non-blank, and unique within the branch.
-- Seller CNIC and personal fields are stored here only; they must not appear in
-- list/detail API responses, logs, or audit payloads (enforced application-layer).
-- No CNIC-copy-attached field (owner decision, Phase A.3 §4.3).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mobile_purchase_paperwork (
    id                                  TEXT PRIMARY KEY CHECK(length(id) = 36),
    device_id                           TEXT NOT NULL UNIQUE
                                            REFERENCES mobile_devices(id) ON DELETE RESTRICT,
    organization_id                     TEXT NOT NULL REFERENCES organizations(id),
    branch_id                           TEXT NOT NULL REFERENCES branches(id),
    voucher_no                          TEXT NOT NULL CHECK(length(trim(voucher_no)) > 0),
    purchase_date                       TEXT NOT NULL,
    purchase_price                      NUMERIC(12,2) NOT NULL CHECK(purchase_price > 0),
    seller_name                         TEXT NOT NULL CHECK(length(trim(seller_name)) > 0),
    father_name                         TEXT NOT NULL CHECK(length(trim(father_name)) > 0),
    seller_cnic                         TEXT NOT NULL
                                            CHECK(seller_cnic ~ '^\d{5}-\d{7}-\d$'),
    seller_phone                        TEXT NOT NULL CHECK(length(trim(seller_phone)) > 0),
    seller_address                      TEXT NOT NULL CHECK(length(trim(seller_address)) > 0),
    ownership_declaration_acknowledged  BOOLEAN NOT NULL DEFAULT FALSE,
    physical_affidavit_acknowledged     BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_by                         TEXT NOT NULL REFERENCES users(id),
    created_at                          TEXT NOT NULL,
    updated_at                          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_paperwork_branch_voucher
    ON mobile_purchase_paperwork (branch_id, voucher_no);

CREATE INDEX IF NOT EXISTS idx_mobile_paperwork_cnic
    ON mobile_purchase_paperwork (seller_cnic);

-- -----------------------------------------------------------------------------
-- Table 4: mobile_inspection_records
-- One mutable inspection record per device (UNIQUE device_id).
-- Old inspection values are overwritten; full history is deferred (owner decision 5).
-- updated_by tracks the last editor; it is not a full audit trail.
-- PhysicalBodyGrade UI type mismatch correction (PRISTINE/GOOD/HEAVY_WEAR/DENTED) is Phase D.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mobile_inspection_records (
    id                          TEXT PRIMARY KEY CHECK(length(id) = 36),
    device_id                   TEXT NOT NULL UNIQUE
                                    REFERENCES mobile_devices(id) ON DELETE RESTRICT,
    organization_id             TEXT NOT NULL REFERENCES organizations(id),
    body_grade                  TEXT NOT NULL
                                    CHECK(body_grade IN ('PRISTINE', 'GOOD', 'HEAVY_WEAR', 'DENTED')),
    screen_condition            TEXT NOT NULL
                                    CHECK(screen_condition IN ('ORIGINAL', 'REPLACED', 'CRACKED')),
    battery_health_percent      INTEGER
                                    CHECK(battery_health_percent BETWEEN 1 AND 100),
    touch_working               BOOLEAN NOT NULL DEFAULT TRUE,
    battery_backup_ok           BOOLEAN NOT NULL DEFAULT TRUE,
    front_camera_ok             BOOLEAN NOT NULL DEFAULT TRUE,
    back_camera_ok              BOOLEAN NOT NULL DEFAULT TRUE,
    speaker_ok                  BOOLEAN NOT NULL DEFAULT TRUE,
    microphone_ok               BOOLEAN NOT NULL DEFAULT TRUE,
    charging_port_ok            BOOLEAN NOT NULL DEFAULT TRUE,
    buttons_ok                  BOOLEAN NOT NULL DEFAULT TRUE,
    biometrics_ok               BOOLEAN NOT NULL DEFAULT TRUE,
    wifi_bluetooth_ok           BOOLEAN NOT NULL DEFAULT TRUE,
    sim_network_ok              BOOLEAN NOT NULL DEFAULT TRUE,
    accessories_box             BOOLEAN NOT NULL DEFAULT FALSE,
    accessories_original_charger BOOLEAN NOT NULL DEFAULT FALSE,
    accessories_cable           BOOLEAN NOT NULL DEFAULT FALSE,
    accessories_handsfree       BOOLEAN NOT NULL DEFAULT FALSE,
    defect_notes                TEXT,
    inspected_by                TEXT NOT NULL REFERENCES users(id),
    updated_by                  TEXT REFERENCES users(id),
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
);

-- No extra indexes needed: device_id is UNIQUE (already indexed by the constraint).

-- -----------------------------------------------------------------------------
-- Table 5: mobile_device_movements
-- Append-only audit log for every device state change.
-- TRANSFERRED, RETURNED, SOLD are present as historical event vocabulary for future phases.
-- Their presence does NOT authorize Phase E/F workflows in Phase B/C.
-- No row is ever deleted or updated.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mobile_device_movements (
    id              TEXT PRIMARY KEY CHECK(length(id) = 36),
    device_id       TEXT NOT NULL REFERENCES mobile_devices(id) ON DELETE RESTRICT,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    movement_type   TEXT NOT NULL
                        CHECK(movement_type IN (
                            'ACQUIRED',
                            'TRANSFERRED',
                            'SOLD',
                            'RETURNED',
                            'STATUS_CHANGE',
                            'INSPECTION_UPDATE'
                        )),
    from_branch_id  TEXT REFERENCES branches(id),
    to_branch_id    TEXT REFERENCES branches(id),
    from_status     TEXT,
    to_status       TEXT NOT NULL,
    notes           TEXT,
    performed_by    TEXT NOT NULL REFERENCES users(id),
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mobile_movements_device
    ON mobile_device_movements (device_id, created_at);

CREATE INDEX IF NOT EXISTS idx_mobile_movements_org
    ON mobile_device_movements (organization_id, created_at);
