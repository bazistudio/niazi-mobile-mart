-- Migration 020: Guarantee stock row existence for every product via database trigger and backfill missing stock rows
-- Ensures that whenever a product is inserted into products table in PostgreSQL,
-- a stock row for the Main Branch ('00000000-0000-0000-0000-000000000002') is automatically created.

CREATE OR REPLACE FUNCTION ensure_product_default_stock()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO stock (product_id, branch_id, quantity, updated_at)
    VALUES (NEW.id, '00000000-0000-0000-0000-000000000002', 0, NOW()::text)
    ON CONFLICT (product_id, branch_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_product_stock ON products;
CREATE TRIGGER trg_ensure_product_stock
AFTER INSERT ON products
FOR EACH ROW EXECUTE FUNCTION ensure_product_default_stock();

-- Backfill any existing products currently missing a stock row (including a09)
INSERT INTO stock (product_id, branch_id, quantity, updated_at)
SELECT p.id, '00000000-0000-0000-0000-000000000002', 0, NOW()::text
FROM products p
LEFT JOIN stock s ON p.id = s.product_id
WHERE s.product_id IS NULL
ON CONFLICT (product_id, branch_id) DO NOTHING;
