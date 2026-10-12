-- Migration 029: Remove automatic default stock creation trigger
-- Purpose:
--   Decouples the shared products catalog from branch-assigned inventory.
--   Previously, Migration 020 introduced trg_ensure_product_stock which automatically
--   inserted a stock row for Main Branch ('00000000-0000-0000-0000-000000000002') on every product insert.
--   By removing this trigger, new catalog products remain pure organization catalog records
--   and do not automatically generate placeholder stock rows in any branch until
--   explicitly initialized via opening stock or transferred to a branch.
--
-- Safety and Data Integrity:
--   - Does NOT delete or alter any existing stock records or historical stock movements.
--   - Completely safe DDL.
--   - Safe to apply to environments running migration 020 or later.
--
-- Rollback:
--   Re-run migration 020 definition:
--   CREATE OR REPLACE FUNCTION ensure_product_default_stock() ...
--   CREATE TRIGGER trg_ensure_product_stock AFTER INSERT ON products ...

DROP TRIGGER IF EXISTS trg_ensure_product_stock ON products;
DROP FUNCTION IF EXISTS ensure_product_default_stock();
