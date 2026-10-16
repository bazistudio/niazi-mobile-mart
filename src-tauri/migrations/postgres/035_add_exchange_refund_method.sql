-- Migration 035: Extend sales_returns.refund_method check constraint
--
-- The exchange feature (exchange.repo.ts) and the returns repository (returns.repo.ts) use
-- two additional refund_method values beyond those in the original schema:
--
--   'EXCHANGE'       — return processed as part of an exchange with no monetary refund
--                      (positive or zero difference). Used by exchange.repo.ts.
--
--   'CREDIT'         — internal alias for customer-account credit refund used throughout
--                      exchange.repo.ts and returns.repo.ts. The original constraint uses
--                      'CUSTOMER_CREDIT' which was the legacy/UI-facing name; 'CREDIT' is
--                      the normalized internal value both repos write to the database.
--
-- Both repos were introduced as part of the Phase 3 exchange feature (untracked files).
-- The original constraint (migration 001) predated this feature and only allowed
-- 'CASH' and 'CUSTOMER_CREDIT'. This migration extends the allowed set to include
-- 'CREDIT' and 'EXCHANGE' without removing any existing permitted values.
--
-- Safe to apply to any existing database: the constraint drop/add is transactional.
-- No existing conforming rows are affected because neither 'CREDIT' nor 'EXCHANGE' could
-- have been inserted under the previous constraint.

ALTER TABLE sales_returns
  DROP CONSTRAINT IF EXISTS sales_returns_refund_method_check;

ALTER TABLE sales_returns
  ADD CONSTRAINT sales_returns_refund_method_check
    CHECK (refund_method IN ('CASH', 'CUSTOMER_CREDIT', 'CREDIT', 'EXCHANGE'));
