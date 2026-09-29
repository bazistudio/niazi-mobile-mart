#!/usr/bin/env python3
"""Phase 1.1 targeted fixes — PostgreSQL verification against a SCRATCH database (never production).

Usage (repo root):
    PSQL_CONN="-h HOST -p PORT -U USER" python3 docs/audits/phase-1-1-verification/pg_supplier_ledger_and_sum_types_test.py

1. Creates scratch DB `p11fix`, applies migrations 001-007 exactly like PostgresAdapter::run_migrations.
2. Every `COALESCE(SUM(...), 0)::BIGINT` statement in src-tauri/src/repositories/postgres_*.rs must
   describe as bigint (Rust decodes them as i64; SUM(bigint) alone is numeric).
3. Supplier ledger scenario using the repository SQL verbatim:
     desktop purchase synced (debit 1000) -> central purchase 500 -> supplier payment 300
     -> purchase return 200 (supplier credit)
   Expected payable 1000 from every read path (outstanding, supplier list, dashboard, party summary),
   matching the desktop (SQLite) rule payable = SUM(debit) - SUM(credit).
"""
import os
import re
import subprocess
import sys

REPO = "src-tauri/src/repositories"
PSQL = ["psql"] + os.environ.get("PSQL_CONN", "-h localhost -U postgres").split() + ["-v", "ON_ERROR_STOP=1", "-q", "-At", "-F", "|"]
DB = "p11fix"
failures = []


def psql(db, sql):
    r = subprocess.run(PSQL + ["-d", db], input=sql, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"psql failed:\n{r.stderr}")
    return r.stdout


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" ({detail})" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def literals(path):
    s = open(path).read()
    return [(s[: m.start()].count("\n") + 1, m.group(1)) for m in re.finditer(r'"((?:[^"\\]|\\.)*)"', s, re.S)]


def lit(path, needle):
    for _, q in literals(path):
        if needle in q:
            return q
    raise SystemExit(f"statement containing {needle!r} not found in {path}")


# 1. Scratch database with 001-007
psql("postgres", f"DROP DATABASE IF EXISTS {DB};\nCREATE DATABASE {DB};\n")
mig = "src-tauri/migrations/postgres"
files = sorted(f for f in os.listdir(mig) if f.endswith(".sql"))
psql(DB, "BEGIN;\n" + "\n".join(open(os.path.join(mig, f)).read() for f in files) + "\nCOMMIT;\n")
check("migrations 001-007 apply", True)

# 2. SUM statements describe as bigint
placeholders = {"{sale_where}": "WHERE 1=1", "{sret_where}": "WHERE 1=1", "{exp_where}": "WHERE 1=1", "{pur_where}": "WHERE 1=1"}
group_by = {"SELECT c.id, c.customer_code": " GROUP BY c.id ORDER BY c.name ASC", "SELECT s.id, s.supplier_code": " GROUP BY s.id ORDER BY s.name ASC"}
count = 0
for f in sorted(os.listdir(REPO)):
    if not f.startswith("postgres_"):
        continue
    for line, q in literals(os.path.join(REPO, f)):
        if "SUM(" not in q or "::BIGINT" not in q:
            continue
        for k, v in placeholders.items():
            q = q.replace(k, v)
        for k, v in group_by.items():
            if q.lstrip().startswith(k):
                q += v
        q = re.sub(r"\$\d+", "'00000000-0000-4000-8000-000000000000'", q)
        desc = psql(DB, q.strip().rstrip(";") + " \\gdesc\n")
        sum_cols = [l for l in desc.splitlines() if l.split("|")[0] in ("coalesce", "balance", "customer_receivable", "supplier_payable")]
        ok = bool(sum_cols) and all(l.endswith("|bigint") for l in sum_cols)
        check(f"{f}:{line} SUM decodes as bigint", ok, desc.strip())
        count += 1
check("found the 25 cast SUM statements (24 fixed + party summary)", count == 25, str(count))
unguarded = [
    (f, line)
    for f in sorted(os.listdir(REPO))
    if f.startswith("postgres_")
    for line, q in literals(os.path.join(REPO, f))
    if re.search(r"COALESCE\(SUM\(", q) and "::BIGINT" not in q
]
check("no uncast COALESCE(SUM(...)) left in PostgreSQL repositories", not unguarded, str(unguarded))

# 3. Supplier ledger scenario (repository SQL verbatim)
pr, rr, sr, br, pp = (os.path.join(REPO, x) for x in (
    "postgres_purchase_repo.rs", "postgres_purchase_return_repo.rs", "postgres_supplier_repo.rs",
    "postgres_branch_repo.rs", "postgres_party_repo.rs"))
S = "'77777777-7777-4777-8777-777777777777'"
bal = lit(pr, "FROM supplier_ledger_entries WHERE supplier_id = $1").replace("$1", S)
ret_bal = lit(rr, "FROM supplier_ledger_entries WHERE supplier_id = $1").replace("$1", S)
party = re.search(r'const SUMMARY_SELECT: &str = "(.*?)";', open(pp).read(), re.S).group(1)
dashboard = [q for _, q in literals(br) if "FROM supplier_ledger_entries" in q][0]
out = psql(DB, f"""
BEGIN;
INSERT INTO suppliers (id, supplier_code, name, phone, credit_limit, is_active, created_at, updated_at)
  VALUES ({S}, 'SUP-LEDGER', 'Ledger Test', '0', 0, 1, 't0', 't0');
INSERT INTO parties (id, display_name, phone, is_active, created_at, updated_at) VALUES ({S}, 'Ledger Test', '0', 1, 't0', 't0');
UPDATE suppliers SET party_id = {S} WHERE id = {S};
INSERT INTO supplier_ledger_entries (id, supplier_id, entry_type, debit, credit, balance_after, description, created_at)
  VALUES ('a0000000-0000-4000-8000-000000000001', {S}, 'PURCHASE', 1000, 0, 1000, 'desktop purchase (synced verbatim)', 't1');
PREPARE pins(text,text,text,text,bigint,bigint,text,text,text) AS {lit(pr, "'PURCHASE'")};
PREPARE payins(text,text,text,text,bigint,bigint,bigint,text,text,text) AS {lit(pr, "'PAYMENT'")};
PREPARE rins(text,text,text,text,bigint,bigint,text,text,text) AS {lit(rr, "'ADJUSTMENT'")};
SELECT ({bal}) AS cur \\gset
EXECUTE pins('a0000000-0000-4000-8000-000000000002', {S}, NULL, 'PUR-2', 500, :cur + 500, 'central purchase', NULL, 't2');
SELECT ({bal}) AS cur \\gset
EXECUTE payins('a0000000-0000-4000-8000-000000000003', {S}, NULL, 'PAY-1', 0, 300, :cur - 300, 'payment', NULL, 't3');
SELECT ({ret_bal}) AS cur \\gset
EXECUTE rins('a0000000-0000-4000-8000-000000000004', {S}, NULL, 'PRET-1', 200, GREATEST(:cur - 200, 0), 'return', NULL, 't4');
SELECT 'entries', string_agg(entry_type || ':' || debit || '/' || credit || '=' || balance_after, ',' ORDER BY created_at) FROM supplier_ledger_entries WHERE supplier_id = {S};
SELECT 'outstanding', ({lit(sr, 'SELECT COALESCE(SUM').replace('$1', S)});
SELECT 'list', balance FROM ({lit(sr, 'SELECT s.id, s.supplier_code')} GROUP BY s.id) q(id, code, name, phone, cl, balance, act, ca) WHERE id = {S};
SELECT 'dashboard', ({dashboard});
SELECT 'party', supplier_payable FROM ({party} WHERE p.id = {S}) q;
ROLLBACK;
""")
vals = dict(l.split("|", 1) for l in out.splitlines() if "|" in l)
check("ledger entries: purchase debit, payment credit, return credit; running balance never negative",
      vals.get("entries") == "PURCHASE:1000/0=1000,PURCHASE:500/0=1500,PAYMENT:0/300=1200,ADJUSTMENT:0/200=1000", vals.get("entries"))
for k in ("outstanding", "list", "dashboard", "party"):
    check(f"payable via {k} = 1000 (desktop SQLite rule gives 1000)", vals.get(k) == "1000", vals.get(k))

psql("postgres", f"DROP DATABASE IF EXISTS {DB};\n")
print(f"\n{'ALL PASS' if not failures else str(len(failures)) + ' FAILED'}")
sys.exit(1 if failures else 0)
