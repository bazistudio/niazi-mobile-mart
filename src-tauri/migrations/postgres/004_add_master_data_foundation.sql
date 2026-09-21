-- 004_add_master_data_foundation.sql
-- Create database-backed master tables for Companies, Qualities, and Colors in PostgreSQL

CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INT NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qualities (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INT NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS colors (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INT NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Seed canonical Companies
INSERT INTO companies (id, name, code, description, is_active, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000101', 'Official Importer', 'CMP-OFFICIAL', 'Official Authorized Importer', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000102', 'China Direct', 'CMP-CHINA', 'Direct Sourcing from China', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000103', 'Local Wholesale', 'CMP-LOCAL', 'Local Wholesale Market', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000104', 'Niazi Trading', 'CMP-NIAZI', 'Niazi Internal Direct Sourcing', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Seed canonical Qualities
INSERT INTO qualities (id, name, code, description, is_active, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000201', 'Original / 100% Genuine', 'QLT-ORIGINAL', '100% Original Genuine Product', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000202', 'A+ Master Copy', 'QLT-MASTER-COPY', 'A+ Grade Master Replica', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000203', 'High Copy', 'QLT-HIGH-COPY', 'High Quality Market Copy', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000204', 'Standard Market Quality', 'QLT-STANDARD', 'Standard Commercial Grade', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000205', 'Refurbished / Used', 'QLT-REFURBISHED', 'Refurbished or Used Grade', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Seed canonical Colors
INSERT INTO colors (id, name, code, description, is_active, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000301', 'Black', 'CLR-BLACK', 'Black Color Variant', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000302', 'White', 'CLR-WHITE', 'White Color Variant', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000303', 'Blue', 'CLR-BLUE', 'Blue Color Variant', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000304', 'Gold', 'CLR-GOLD', 'Gold Color Variant', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000305', 'Silver', 'CLR-SILVER', 'Silver Color Variant', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000306', 'Green', 'CLR-GREEN', 'Green Color Variant', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000307', 'Red', 'CLR-RED', 'Red Color Variant', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ('00000000-0000-0000-0000-000000000308', 'Purple', 'CLR-PURPLE', 'Purple Color Variant', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
