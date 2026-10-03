-- Migration 010: Add terminal code (Adapted for online architecture)
-- Still useful for auditing and prefixing invoice numbers in a centralized system.
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT 'T1';
