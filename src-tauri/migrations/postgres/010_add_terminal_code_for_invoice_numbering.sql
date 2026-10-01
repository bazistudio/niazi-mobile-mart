-- Migration 010: Add terminal code column for collision-safe invoice numbering (B07)
-- Existing terminals are seeded with 'T1' as the default human-readable code.
-- New terminals are assigned their code at creation time in the repository.
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT 'T1';
