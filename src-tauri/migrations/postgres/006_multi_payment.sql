-- 006_multi_payment.sql
-- Modify existing sale_payments.payment_method CHECK constraint to accept multi-payment methods

ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS sale_payments_payment_method_check;

ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_payment_method_check 
CHECK (payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH', 'OTHER'));
