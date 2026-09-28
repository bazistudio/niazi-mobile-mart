#!/bin/bash
# Phase 1.1 — PostgreSQL migration 007 verification against a SCRATCH database (never production).
# Usage: PSQL_CONN="-h HOST -p PORT -U USER" bash pg_migration_007_test.sh   (run from the repo root; uses scratch DBs p11/p11f)
M="${M:-src-tauri/migrations/postgres}"
PSQL="psql ${PSQL_CONN:--h localhost -U postgres} -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "DROP DATABASE IF EXISTS p11" -c "CREATE DATABASE p11"
runner() { # emulate PostgresAdapter::run_migrations: every file, one transaction
  local files=("$@"); { echo "BEGIN;"; for f in "${files[@]}"; do cat "$M/$f"; echo; done; echo "COMMIT;"; } | $PSQL -d p11 >/dev/null
}
OLD=(001_initial_schema.sql 002_add_terminals_and_sync_queue.sql 003_add_change_log.sql 004_add_master_data_foundation.sql 005_product_identity_and_normalization.sql 006_multi_payment.sql)
ALL=("${OLD[@]}" 007_parties_foundation.sql)
runner "${OLD[@]}" && echo "baseline 001-006 applied"
$PSQL -d p11 <<'SQL'
INSERT INTO customers (id, customer_code, name, phone, email, credit_limit, is_active, created_at, updated_at) VALUES
 ('11111111-1111-4111-8111-111111111111','CUS-000001','Ali Traders','0300111222','ali@x.pk',5000,1,'2026-01-01T00:00:00+00:00','2026-02-01T00:00:00+00:00'),
 ('22222222-2222-4222-8222-222222222222','CUS-000002','Bilal','0300111222',NULL,0,0,'2026-01-02T00:00:00+00:00','2026-01-02T00:00:00+00:00'),
 ('99999999-9999-4999-8999-999999999999','CUS-000003','Collide Cust','1',NULL,0,1,'2026-01-03T00:00:00+00:00','2026-01-03T00:00:00+00:00'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','CUS-BLANK','  ','0',NULL,0,1,'2026-01-03T00:00:00+00:00','2026-01-03T00:00:00+00:00');
INSERT INTO suppliers (id, supplier_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES
 ('33333333-3333-4333-8333-333333333333','SUP-000001','Hall Road Parts','0300999888',0,1,'2026-01-01T00:00:00+00:00','2026-01-01T00:00:00+00:00'),
 ('99999999-9999-4999-8999-999999999999','SUP-000002','Collide Sup','2',0,1,'2026-01-01T00:00:00+00:00','2026-01-01T00:00:00+00:00');
SQL
BEFORE_C=$($PSQL -d p11 -Atc "SELECT md5(string_agg(row(id,customer_code,name,phone,alternate_phone,email,address,notes,credit_limit,is_active,created_at,updated_at)::text, '|' ORDER BY id)) FROM customers")
BEFORE_S=$($PSQL -d p11 -Atc "SELECT md5(string_agg(row(id,supplier_code,name,phone,alternate_phone,email,address,notes,credit_limit,is_active,created_at,updated_at)::text, '|' ORDER BY id)) FROM suppliers")
runner "${ALL[@]}" && echo "001-007 applied (upgrade path)"
q() { $PSQL -d p11 -Atc "$1"; }
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 (got '$2' want '$3')"; fail=$((fail+1)); fi; }
chk "party count (4 customers + 1 non-colliding supplier)" "$(q 'SELECT count(*) FROM parties')" 5
chk "blank name falls back to code" "$(q "SELECT display_name FROM parties WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'")" CUS-BLANK
chk "customers linked party_id=id" "$(q 'SELECT count(*) FROM customers WHERE party_id IS DISTINCT FROM id')" 0
chk "non-colliding supplier linked" "$(q "SELECT party_id FROM suppliers WHERE id='33333333-3333-4333-8333-333333333333'")" 33333333-3333-4333-8333-333333333333
chk "colliding supplier unlinked (no silent merge)" "$(q "SELECT coalesce(party_id,'NULL') FROM suppliers WHERE id='99999999-9999-4999-8999-999999999999'")" NULL
chk "customer columns preserved" "$(q "SELECT md5(string_agg(row(id,customer_code,name,phone,alternate_phone,email,address,notes,credit_limit,is_active,created_at,updated_at)::text, '|' ORDER BY id)) FROM customers")" "$BEFORE_C"
chk "supplier columns preserved" "$(q "SELECT md5(string_agg(row(id,supplier_code,name,phone,alternate_phone,email,address,notes,credit_limit,is_active,created_at,updated_at)::text, '|' ORDER BY id)) FROM suppliers")" "$BEFORE_S"
chk "contact copied" "$(q "SELECT display_name||'/'||phone||'/'||email||'/'||is_active FROM parties WHERE id='11111111-1111-4111-8111-111111111111'")" "Ali Traders/0300111222/ali@x.pk/1"
chk "sentinel updated_at" "$(q "SELECT count(*) FROM parties WHERE updated_at <> '1970-01-01T00:00:00+00:00'")" 0
chk "inactive customer -> inactive party" "$(q "SELECT is_active FROM parties WHERE id='22222222-2222-4222-8222-222222222222'")" 0
H1=$(q "SELECT md5(string_agg(row(p.*)::text,'|' ORDER BY id)) FROM parties p")
runner "${ALL[@]}"; runner "${ALL[@]}"
chk "re-running 001-007 twice is idempotent" "$(q "SELECT md5(string_agg(row(p.*)::text,'|' ORDER BY id)) FROM parties p")" "$H1"
# legacy REST path inserts an unlinked customer; next start heals it
q "INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES ('44444444-4444-4444-8444-444444444444','CUST-x','Rest Cust','0311',0,1,'2026-03-01T00:00:00+00:00','2026-03-01T00:00:00+00:00')"
runner "${ALL[@]}"
chk "unlinked row self-heals on next start" "$(q "SELECT party_id FROM customers WHERE id='44444444-4444-4444-8444-444444444444'")" 44444444-4444-4444-8444-444444444444
if q "UPDATE customers SET party_id='11111111-1111-4111-8111-111111111111' WHERE id='22222222-2222-4222-8222-222222222222'" 2>/dev/null; then r=allowed; else r=rejected; fi
chk "unique customers.party_id" "$r" rejected
if q "UPDATE customers SET party_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE id='22222222-2222-4222-8222-222222222222'" 2>/dev/null; then r=allowed; else r=rejected; fi
chk "FK party_id -> parties" "$r" rejected
if q "DELETE FROM parties WHERE id='11111111-1111-4111-8111-111111111111'" 2>/dev/null; then r=allowed; else r=rejected; fi
chk "linked party delete RESTRICT" "$r" rejected
q "UPDATE suppliers SET party_id='11111111-1111-4111-8111-111111111111' WHERE id='99999999-9999-4999-8999-999999999999'"
chk "BOTH: customer+supplier share a party" "$(q "SELECT count(*) FROM suppliers WHERE party_id='11111111-1111-4111-8111-111111111111'")" 1
# fresh install path
$PSQL -d postgres -c "DROP DATABASE IF EXISTS p11f" -c "CREATE DATABASE p11f"
{ echo "BEGIN;"; for f in "${ALL[@]}"; do cat "$M/$f"; echo; done; echo "COMMIT;"; } | $PSQL -d p11f >/dev/null && fresh=ok || fresh=fail
chk "fresh install 001-007" "$fresh" ok
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
