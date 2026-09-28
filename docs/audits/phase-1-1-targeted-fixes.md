# Phase 1.1 — Targeted Findings Fixes

**Branch:** `feature/phase-1-1-targeted-fixes` · **Base:** `4d7a7556c1315b3c791e2ab1d80f4e6a8756d9c5`

**Scope:** the three findings from the Phase 1.1 report. No other module changed.

## F1 (P1) — Supplier ledger sign (PostgreSQL)

### Established semantics

These come from the working desktop application, not a new rule.

| Item | Meaning |
|---|---|
| Supplier payable | Amount owed to the supplier = `SUM(debit) - SUM(credit)` |
| Purchase (credit portion) | **debit**: payable increases |
| Supplier payment | **credit**: payable decreases |
| Purchase return, supplier-credit settlement (`ADJUSTMENT`) | **credit**: payable decreases |
| Adjustment | Only produced by purchase returns today (credit) |

### Evidence

- `domain/supplier.rs` `SupplierLedgerEntry`: "debit: Payable increased (e.g. credit purchase)" and "credit: Payable decreased (e.g. payment made to supplier)".
- SQLite postings:
  - `purchase_service.rs:431` PURCHASE is a debit.
  - `purchase_service.rs:600` PAYMENT is a credit.
  - `purchase_return_service.rs:306` ADJUSTMENT is a credit.
- SQLite balance: `supplier_repository.rs:185-189` computes debit − credit.
- `change_applier.rs` says: "debit increases balance, credit decreases balance for suppliers".
- Desktop tests expect a purchase to give payable 65,000, a payment to bring it to 15,000, and an overpayment to be rejected.
- PostgreSQL agrees in some places:
  - The sync path copies desktop entries verbatim (`sync_purchase_tx`, `sync_purchase_return_tx`).
  - The dashboard `postgres_branch_repo.rs:117` already computes debit − credit.

### Root cause

Five PostgreSQL code paths used the inverted sign:

| Location | Before |
|---|---|
| `postgres_purchase_repo.rs:428` (central purchase) | balance credit − debit; PURCHASE posted as **credit** |
| `postgres_purchase_repo.rs:584` (**synced supplier payment**) | balance credit − debit |
| `postgres_purchase_return_repo.rs:431/446` (central return) | balance credit − debit; ADJUSTMENT posted as **debit** |
| `postgres_supplier_repo.rs:235, 315` (supplier list / outstanding) | credit − debit |
| `postgres_party_repo.rs` (Phase 1.1 party payable) | credit − debit |

### Impact, reproduced on PostgreSQL 16 with the old code

After one synced desktop purchase:

- **Every synced supplier payment fails.** `balance_after = (0 − 1000) − 300 = −1300` violates `CHECK(balance_after >= 0)`. The server returns an error, and the desktop keeps retrying the event.
- A central purchase is rejected by the same constraint.
- Supplier list and outstanding show −1200 while the dashboard shows +1200.

### Fix

All five paths now use debit − credit. PURCHASE is posted as a debit and ADJUSTMENT as a credit. SQLite and customer/receivable code are unchanged.

### Result

In the same scenario (desktop purchase 1000 → central purchase 500 → payment 300 → return 200), PostgreSQL gives payable **1000** from outstanding, list, dashboard and party. The SQLite desktop rule also gives **1000**.

### Existing central data (read-only check, run before deploying)

```sql
-- Rows written by the old inverted central code paths (expected 0 | 0).
SELECT (SELECT count(*) FROM supplier_ledger_entries WHERE entry_type = 'PURCHASE'   AND credit > 0) AS purchase_rows_as_credit,
       (SELECT count(*) FROM supplier_ledger_entries WHERE entry_type = 'ADJUSTMENT' AND debit  > 0) AS adjustment_rows_as_debit;
```

If either count is above 0, correcting those rows is a separate, owner-approved data migration. No data is changed by this fix.

## F2 (P2) — PostgreSQL `SUM(bigint)` returns `numeric`

### Root cause

PostgreSQL returns `numeric` for `SUM` over these `bigint` money/quantity columns. This was confirmed on PostgreSQL 16 for all affected columns: debit/credit, amount, total_amount, quantity, and `cost * quantity`.

All 24 statements decode the result as `i64`. sqlx's `i64` decoding accepts only `INT8`, so:
- `query_as::<(i64,)>` fails at runtime;
- the customer/supplier list `row.try_get(5).unwrap_or(0)` silently shows balance **0**.

### Affected statements (24)

| File | Lines |
|---|---|
| `postgres_branch_repo.rs` | 110, 117 |
| `postgres_cash_repo.rs` | 94, 102, 277, 285 |
| `postgres_customer_repo.rs` | 195, 225, 306 |
| `postgres_profit_repo.rs` | 49, 57, 69, 79, 94 |
| `postgres_purchase_repo.rs` | 428, 584 |
| `postgres_purchase_return_repo.rs` | 225, 431 |
| `postgres_sale_repo.rs` | 262 |
| `postgres_sales_return_repo.rs` | 284, 492 |
| `postgres_supplier_repo.rs` | 204, 234, 315 |

### Fix

`COALESCE(SUM(...), 0)::BIGINT`.

- This matches the project rule: money is whole-PKR integers stored as `BIGINT`.
- A sum of integers has no fraction, so nothing is rounded.
- An out-of-range sum raises `bigint out of range` instead of truncating.
- The Rust types are unchanged.

The only remaining uncast `SUM` (the low-stock subquery at `postgres_branch_repo.rs:85`) is compared inside SQL and never decoded.

## F3 (P2) — `deactivate_customer` did not sync or update the party

### Root cause

The desktop `CustomerService::deactivate_customer` called a repository-level `UPDATE` directly. It enqueued nothing and never touched the party.

The established pattern is `SupplierService::deactivate_supplier`, which updates through `update_supplier_in_tx(is_active = false)` and enqueues `SUPPLIER_UPDATED`.

### Fix

The desktop (SQLite) path now reuses `update_customer` with `is_active = false`:

- one transaction;
- `CUSTOMER_UPDATED` is enqueued;
- a single-role party mirrors the flag and `PARTY_UPSERTED` is enqueued;
- the existing `NotFound` contract is kept.

No new sync mechanism was added. The server path (PostgreSQL) is unchanged.

### Note

The server still drops `CUSTOMER_UPDATED` (F-02). For a single-role customer, the inactive flag reaches other terminals and the server through `PARTY_UPSERTED`, which is copied down to the role. For a BOTH party, deactivating only the customer role leaves the party active, which is the Phase 1.1 rule.

## Verification

| Test | Result |
|---|---|
| `docs/audits/phase-1-1-verification/pg_supplier_ledger_and_sum_types_test.py` on scratch PostgreSQL 16.13: 25 SUM statements describe as bigint, none left uncast, ledger scenario = 1000 on all 4 read paths | **PASS** (33 checks) |
| Same script against the old `4d7a755` repositories (negative control) | **FAILS as expected**: 24 uncast statements, and a check-constraint violation on the central purchase |
| SQLite desktop rule, same postings | payable 1000 (**equal**) |
| New Rust test `services::party_service::tests::legacy_customer_deactivate_syncs_and_mirrors_party` | Written; **not run** here |
| `cargo test --lib`, `cargo check --bin niazi-server` | **BLOCKED**: crates.io returns 403 from this workspace; the owner-PC workspace has no Rust toolchain |
| `npm run build` | **BLOCKED** here: the PC's `node_modules` has only win32 esbuild/rollup. No frontend files changed in this fix. |
