-- Migration 016: Add status TEXT column and access_profile JSONB column to users table
-- Phase 4 (Branches + Users migration to TypeScript)
--
-- REASON:
--   The TypeScript users.repo.ts (Phase 1 migration) uses `status` TEXT and
--   `access_profile` JSONB columns on the users table. These were designed to
--   mirror the SQLite local_auth_snapshot semantic status enum and the
--   user_access_profiles JSONB convenience view. They were never added to the
--   PostgreSQL schema during Phase 1 because the Rust server does not use them.
--
--   This migration closes the schema gap so that TypeScript-owned user operations
--   work correctly against the live PostgreSQL database.
--
-- STATUS MAPPING (mirrors Rust UserStatus enum i32 values → TEXT):
--   is_active=1, status not yet set → 'ACTIVE'
--   is_active=0, status not yet set → 'DISABLED'
--   PENDING and REJECTED are staff-approval states seeded from TypeScript
--
-- access_profile JSONB stores a convenience snapshot of the user's access profile
-- derived from user_access_profiles table (allowed_pages, allowed_actions, etc.).
-- This is a denormalized copy for fast JWT claims construction; the authoritative
-- data lives in user_access_profiles. A NULL access_profile means no custom profile.

-- Add status column if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'status'
    ) THEN
        ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'
            CHECK(status IN ('ACTIVE', 'PENDING', 'DISABLED', 'REJECTED'));
    END IF;
END$$;

-- Backfill status from is_active for existing rows
UPDATE users
SET status = CASE
    WHEN is_active = 1 THEN 'ACTIVE'
    ELSE 'DISABLED'
END
WHERE status = 'ACTIVE' AND is_active = 0;

-- Add access_profile JSONB column if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'access_profile'
    ) THEN
        ALTER TABLE users ADD COLUMN access_profile JSONB;
    END IF;
END$$;

-- Add full_name column (alias for name, used in some queries)
-- The TypeScript repo uses 'full_name' in some JOIN aliases but the column is 'name'.
-- This is handled in SQL via aliases; no column needed.

-- Add index on status for fast suspended-user lockout checks
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Record migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (16, '016_users_status_and_access_profile', NOW()::TEXT)
ON CONFLICT (version) DO NOTHING;
