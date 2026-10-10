-- Migration 019: Backfill missing stock table rows for existing products
-- Ensures all existing products (including those created without stock rows) receive a corresponding stock entry for the main branch.

INSERT INTO stock (product_id, branch_id, quantity, updated_at)
SELECT p.id, '00000000-0000-0000-0000-000000000002', 0, NOW()::text
FROM products p
LEFT JOIN stock s ON p.id = s.product_id
WHERE s.product_id IS NULL
ON CONFLICT (product_id, branch_id) DO NOTHING;
