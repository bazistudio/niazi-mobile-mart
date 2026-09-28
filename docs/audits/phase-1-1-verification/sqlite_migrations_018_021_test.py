# Phase 1.1 — SQLite migrations 018-021 verification (run from the repo root: python3 docs/audits/phase-1-1-verification/sqlite_migrations_018_021_test.py)
import re, sqlite3, uuid, sys
src = open('src-tauri/src/db/migrations.rs').read()
body = src.split('pub const MIGRATIONS')[1].split('pub struct MigrationRunner')[0]
migs = re.findall(r'version:\s*(\d+),\s*name:\s*"([^"]+)",\s*up:\s*r#"(.*?)"#', body, re.S)
migs = [(int(v), n, u) for v, n, u in migs]
assert [m[0] for m in migs] == list(range(1, 22)), [m[0] for m in migs]
def run(conn, upto, start=1):
    for v, n, u in migs:
        if start <= v <= upto:
            try:
                conn.executescript("BEGIN;" + u + "COMMIT;")
            except sqlite3.OperationalError as e:
                if 'duplicate column name' in str(e):
                    conn.execute("ROLLBACK") if conn.in_transaction else None
                    print("  tolerated duplicate column in", n)
                else:
                    raise
results = []
def check(name, cond):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name)

conn = sqlite3.connect(':memory:'); conn.execute('PRAGMA foreign_keys=ON')
run(conn, 17)
now = '2026-09-28T10:00:00+00:00'
cust = [str(uuid.uuid4()) for _ in range(5)]
sup = [str(uuid.uuid4()) for _ in range(4)]
for i, c in enumerate(cust):
    conn.execute("INSERT INTO customers (id, customer_code, name, phone, alternate_phone, email, address, notes, credit_limit, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                 (c, f'CUS-{i:06}', f'Cust {i}', '0300111222' if i < 2 else f'03{i}', None, f'c{i}@x.pk' if i%2 else None, 'Lahore', 'n', 1000*i, 1 if i != 3 else 0, now, now))
for i, s in enumerate(sup):
    conn.execute("INSERT INTO suppliers (id, supplier_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                 (s, f'SUP-{i:06}', f'Sup {i}', '0300111222', 0, 1, now, now))
# theoretical collision: a supplier sharing a customer's UUID
collide = cust[4]
conn.execute("INSERT INTO suppliers (id, supplier_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
             (collide, 'SUP-COLL', 'Colliding Sup', '1', 0, 1, now, now))
conn.execute("INSERT INTO customers (id, customer_code, name, phone, credit_limit, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','CUS-BLANK','   ','0',0,1,now,now))
snap_c = conn.execute("SELECT * FROM customers ORDER BY id").fetchall()
snap_s = conn.execute("SELECT * FROM suppliers ORDER BY id").fetchall()
ledger_ok = conn.execute("SELECT count(*) FROM customer_ledger_entries").fetchone()[0]
run(conn, 21, 18)
check("parties table exists", conn.execute("SELECT count(*) FROM sqlite_master WHERE name='parties'").fetchone()[0] == 1)
check("party count = customers + non-colliding suppliers (6+4=10)", conn.execute("SELECT count(*) FROM parties").fetchone()[0] == 10)
check("every customer linked with party_id = id", conn.execute("SELECT count(*) FROM customers WHERE party_id IS NULL OR party_id != id").fetchone()[0] == 0)
check("non-colliding suppliers linked with party_id = id", conn.execute("SELECT count(*) FROM suppliers WHERE id != ? AND (party_id IS NULL OR party_id != id)", (collide,)).fetchone()[0] == 0)
check("colliding supplier left unlinked (not merged)", conn.execute("SELECT party_id FROM suppliers WHERE id=?", (collide,)).fetchone()[0] is None)
check("colliding customer's party still carries customer name", conn.execute("SELECT display_name FROM parties WHERE id=?", (collide,)).fetchone()[0] == 'Cust 4')
cols_c = [r[1] for r in conn.execute("PRAGMA table_info(customers)")]
old_c = [tuple(r[:len(snap_c[0])]) for r in conn.execute("SELECT * FROM customers ORDER BY id").fetchall()]
old_s = [tuple(r[:len(snap_s[0])]) for r in conn.execute("SELECT * FROM suppliers ORDER BY id").fetchall()]
check("customers: every pre-existing column value preserved", old_c == snap_c)
check("suppliers: every pre-existing column value preserved", old_s == snap_s)
check("party contact copied (name/phone/email/is_active)", conn.execute("SELECT count(*) FROM parties p JOIN customers c ON c.id=p.id WHERE p.display_name=c.name AND p.phone=c.phone AND COALESCE(p.email,'')=COALESCE(c.email,'') AND p.is_active=c.is_active").fetchone()[0] == 5)
check("blank role name falls back to role code", conn.execute("SELECT display_name FROM parties WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'").fetchone()[0] == 'CUS-BLANK')
check("backfilled parties carry sentinel updated_at", conn.execute("SELECT count(*) FROM parties WHERE updated_at != '1970-01-01T00:00:00+00:00'").fetchone()[0] == 0)
check("inactive customer -> inactive party", conn.execute("SELECT is_active FROM parties WHERE id=?", (cust[3],)).fetchone()[0] == 0)
# uniqueness: second customer may not link to the same party
try:
    conn.execute("UPDATE customers SET party_id=? WHERE id=?", (cust[0], cust[1])); ok=False
except sqlite3.IntegrityError: ok=True
check("unique customers.party_id enforced", ok)
try:
    conn.execute("UPDATE suppliers SET party_id=? WHERE id=?", (sup[0], sup[1])); ok=False
except sqlite3.IntegrityError: ok=True
check("unique suppliers.party_id enforced", ok)
# BOTH: one customer and one supplier may share a party
conn.execute("UPDATE suppliers SET party_id=? WHERE id=?", (cust[0], collide))
check("customer+supplier can share one party (BOTH)", conn.execute("SELECT count(*) FROM suppliers WHERE party_id=?", (cust[0],)).fetchone()[0] == 1)
conn.execute("UPDATE suppliers SET party_id=NULL WHERE id=?", (collide,))
try:
    conn.execute("UPDATE customers SET party_id=? WHERE id=?", (str(uuid.uuid4()), cust[2])); ok=False
except sqlite3.IntegrityError: ok=True
check("FK: party_id must reference an existing party", ok)
try:
    conn.execute("DELETE FROM parties WHERE id=?", (cust[0],)); ok=False
except sqlite3.IntegrityError: ok=True
check("FK: linked party cannot be deleted (RESTRICT)", ok)
try:
    conn.execute("INSERT INTO parties (id, display_name, created_at, updated_at) VALUES (?,?,?,?)", (str(uuid.uuid4()), '   ', now, now)); ok=False
except sqlite3.IntegrityError: ok=True
check("CHECK: blank display_name rejected", ok)
# idempotency: re-running 018 and 021 changes nothing
before = conn.execute("SELECT * FROM parties ORDER BY id").fetchall()
run(conn, 18, 18); run(conn, 21, 21)
check("018+021 re-run is idempotent", conn.execute("SELECT * FROM parties ORDER BY id").fetchall() == before)
# re-running 019 is the tolerated duplicate-column path
try:
    run(conn, 19, 19); ok = True
except Exception as e:
    ok = False
check("019 re-run hits tolerated 'duplicate column name'", ok)
# fresh DB: all 21 apply cleanly with zero rows
c2 = sqlite3.connect(':memory:'); c2.execute('PRAGMA foreign_keys=ON'); run(c2, 21)
check("fresh database: migrations 1-21 apply", c2.execute("SELECT count(*) FROM parties").fetchone()[0] == 0)
check("foreign_key_check clean", conn.execute("PRAGMA foreign_key_check").fetchall() == [])
print(f"\n{sum(r for _, r in results)}/{len(results)} passed")
sys.exit(0 if all(r for _, r in results) else 1)
