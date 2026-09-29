-- Migration 009: Fix public_rates.published_by FK to ON DELETE SET NULL
-- PostgreSQL supports ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT directly.
-- The auto-generated constraint name is public_rates_published_by_fkey
-- (PostgreSQL default: {table}_{column}_fkey).

ALTER TABLE public_rates
    DROP CONSTRAINT IF EXISTS public_rates_published_by_fkey;

ALTER TABLE public_rates
    ADD CONSTRAINT public_rates_published_by_fkey
        FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL;
