# PHASE 0 — CONTAINMENT + BASELINE VERIFICATION — COMPLETION REPORT

**Branch:** `feature/database-latest-foundation` (created from `0771cf6`)
**Part 1:** 2026-09-27, commit `1dc7e50`
**Part 2 (authorized continuation):** 2026-09-28

## 1. Executive status

```text
PHASE 0 STATUS: BLOCKED (cloud execution)

Code:  COMPLETE for every authorized item.
Cloud: NOT EXECUTED. Claude Code has no gcloud / Cloud SQL access in either of its environments
       (the cloud container and the owner-PC workspace VM both lack gcloud; GitHub and crates.io are
       also blocked there). Every cloud step is written as an exact runbook:
       docs/runbooks/phase-0-cloud-runbook.md (owner / AG AI).
```

- Nothing was deployed, pushed, tagged or published.
- No cloud resource was changed. No database was changed.

**Owner decisions applied (part 2):**

| Decision | Choice |
|---|---|
| HA-0.1 | Rotate the key now |
| HA-0.3 | B: reroute Cash Return / Exchange (buttons stay) |
| HA-0.4 | A: draft / manual promotion |
| Cloud Run max instances | 10 |
| Cloud Build | e2-standard-2 |
| Artifact Registry | keep 5 most recent |
| Logging permission | `roles/logging.logWriter` if missing |
| HA-0.5 (DevTools / storefront) | **PENDING**: not decided, nothing changed |

## 2. Baseline

```text
Starting SHA (phase):         0771cf6262e7108cabfc1ccf14d52444139fe455 (v1.2.34, origin/main)
Part 1 commit:                1dc7e50 (pool limit, .gitignore, report)
Part 2 commit:                see git log (this report is part of it)
Owner PC checkout:            still main @ cabd128. The branch was delivered as a git bundle and patch;
                              it is not applied on the PC.
Deployed (per AG AI):         niazi-server-00057-jrn, image niazi-server:0771cf6…
```

## 3. F-01 — JWT signing key (P0)

| Item | Status |
|---|---|
| Old leaked public-key fingerprint | `7f796ac3eee2a66eda5f5d68d09df97c9e256d9d60b1c29a14467c23b4f46c5a`. AG AI confirmed that production matches it, so production signs with the leaked key. |
| New public-key fingerprint | **NOT YET GENERATED.** Produced by runbook R1.2. |
| Secret Manager updated | **NO** (needs gcloud; runbook R1.1–R1.2) |
| Server configuration updated | Code: **YES**. The server now refuses to start without `JWT_PRIVATE_KEY`. Deployment: **NO** (runbook R2) |
| Desktop private-key fallback removed | **YES** (code). `DEV_PRIVATE_KEY` and `DEV_PUBLIC_KEY` were deleted from `token_service.rs`. |
| Desktop public verification mechanism | `TokenManager::new()` resolution order: (1) `JWT_PUBLIC_KEY` env var (server); (2) public key embedded at build time from `src-tauri/src/services/jwt_public_key.pem`; (3) otherwise **fail closed** ("JWT verification key is not configured in this build"). The file currently holds a NOT-CONFIGURED placeholder; the new public key goes in by runbook R1.3. |
| Desktop can sign tokens | **NO.** The private key comes only from the `JWT_PRIVATE_KEY` env var, which shop PCs don't have. `can_sign()` is false, so a local desktop login no longer mints a token. Before this change, every desktop could mint tokens that production accepted. |
| Old key rejected | **NOT YET VERIFIED.** Only possible after R2.2. The negative test is in R2.3. |

**Files:**
- `src-tauri/src/services/token_service.rs`: keys removed; env/embedded public key; fail closed; `can_sign()`; test-only key generation; 4 new tests.
- `src-tauri/src/services/jwt_public_key.pem`: placeholder, public key only.
- `src-tauri/src/services/auth_service.rs`: local login mints a token only when `can_sign()`.
- `src-tauri/src/bin/server.rs`: `JWT_PRIVATE_KEY` is required at startup.
- `src-tauri/Cargo.toml` / `Cargo.lock`: dev-dependency `rsa 0.9` with `pem`, used **only** to generate throw-away test keys. It is already in the lockfile through sqlx, so no new crate is downloaded.
- `.gitignore`: `!src-tauri/src/services/jwt_public_key.pem`, so only that public file is allowed.

**Rollout safety (built into the runbook):**
- The live revision is first pinned to the current key versions (R1.1). Otherwise its next cold start would pick up the new `:latest` key early.
- The new server runs as a no-traffic `phase0` tagged revision.
- Traffic moves only on OWNER PROMOTION, together with publishing the desktop draft.
- After promotion, v1.2.34 desktops cannot complete online login until they update. Offline snapshot login keeps working.

**Remaining risk:** the leaked key stays valid in production until R2.4 promotion. It also remains in git history permanently, which is why it must never be trusted again.

## 4. F-07 — POS Cash Return / Exchange (P0)

**Exact original failure** (traced end to end):
1. `PosActionsDropdown.tsx` calls either:
   - `processCashReturn()`, which sends cart lines with `quantity: -abs(q)`, or
   - Exchange mode, where `completeTransaction()` appends `returnedItems` with `quantity: -abs(q)`.
2. Either way the payload goes to `salesApi.createOrder`.
3. `sales.api.ts:77` `Math.max(1, quantity)` turns every negative quantity into **1**.
4. That reaches `tauriClient.saleComplete`, then `storage_sale_complete`, then `SaleService::complete_sale`. The result:
   - a normal SALE of 1 unit per returned line
   - stock goes **down**
   - cash comes **in** (or the customer ledger is debited)
   - `SALE_CREATED` is enqueued and synced centrally
5. The same happened when an invoice loaded via "Return by Invoice" was checked out: it was sold again.

**Proper path that already exists and is used now:**
- `sales_return_create` → `SalesReturnService::create_sales_return`.
- It requires the `pos:refund` permission and branch access.
- It validates returnable quantities against the original sale lines.
- It computes the refund from the original line economics.
- Stock: IN movements, with stock increased.
- Cash: an OUT movement (requires an OPEN cash session).
- Ledger: credited for `CUSTOMER_CREDIT` refunds.
- `SALES_RETURN_CREATED` is enqueued in the same SQLite transaction.
- Existing Rust tests cover these effects in `sales_return_service.rs` (tests at roughly lines 585–890).

**New behaviour:**

| Action | Before | After |
|---|---|---|
| "Walk-in Cash Return" **with** an invoice loaded ("Return by Invoice") | sale of 1 unit per line | **proper sales return, cash refund** (`createCashReturnForInvoice` → `sales_return_create`, refund_method CASH); cart lines mapped onto the invoice's sale lines |
| "Walk-in Cash Return" **without** an invoice | sale of 1 unit per line | **refused** with a message; nothing recorded |
| Cash Return "pure adjustment" (empty cart + amount) | sale / negative discount | **refused** (needs an invoice + items) |
| Exchange mode with returned items (checkout) | returned items sold as 1-unit sales | **refused** with a message; nothing recorded |
| Checkout while an invoice is loaded for return | invoice items sold again | **refused**; the user is pointed to Cash Return |
| Any sale payload with quantity ≤ 0 or non-integer (any caller) | silently clamped to 1 | **rejected** in `sales.api.ts` (root-cause guard) |

**STOPPED: owner decision required (HA-3.10, new).** Two cases cannot be rerouted without inventing accounting rules. The backend `sales_returns` table requires `sale_id` and `sale_line_id`, so there is no existing proper path for them:

**(a) Returns without an original invoice.** To be defined:
- which price is refunded
- which cost goes back into stock
- how profit is reversed
- the permission required

**(b) Exchange (return + new sale in one step).** A settlement rule is needed. Proposed rule for approval:
- **Registered customer:** the return is recorded as `CUSTOMER_CREDIT`, then the new sale is taken with the tendered amount; the unpaid part becomes credit, which the return has just offset.
- **Walk-in:** the return is recorded as `CASH`, and the new sale is paid with the tendered amount plus the refunded cash.

Both cases need an invoice-linked return, so an exchange also requires "Return by Invoice" first.

**Buttons remain visible and enabled, as the owner required.** The unsupported cases show a clear message instead of recording a false sale.

**Files:**
- `frontend/src/features/pos/services/posReturn.service.ts` (new)
- `frontend/src/features/pos/store/usePosStore.ts`
- `frontend/src/services/sales.api.ts`

**Remaining risks:**
- The cash refund amount is the backend's proportional original line total. Any extra discount typed into the cart during the return is ignored, which is correct.
- A cash refund on an invoice that was sold on credit pays cash out; this is the backend's existing behaviour.
- `processInvoiceReturn` (unused by any UI) now fails safely at the `sales.api.ts` guard.

## 5. F-55 — Cloud SQL connections

- **Application:** per-instance pool = `PG_POOL_MAX_CONNECTIONS` (default 2, clamp 1–10), with 0 idle connections held (part 1). AG AI independently ran `cargo test --lib db::postgres`: **PASS**.
- **Cloud Run:** the target maximum is 10 instances (owner decision), so 10 × 2 = 20 of 25 connections.
  - The R2.2 deploy command sets `--max-instances=10`; `cloudbuild.yaml` already sets it.
  - The service-level `maxScale = 20` drift is fixed by runbook R3.
- **Actual effective configuration:** **NOT VERIFIED** (no gcloud). R3 includes the verification command.

## 6. Cloud cost

| Item | Change | Status |
|---|---|---|
| Cloud Build machine | `cloudbuild.yaml`: removed `machineType: E2_HIGHCPU_8`, so the default **e2-standard-2** is used. Added `timeout: '7200s'`, because builds on 2 vCPUs are about 3–4× slower. Confirm the trigger does not override the timeout. | Code done; YAML parsed and validated |
| Artifact Registry `niazi-repo` (12.02 GB) | Cleanup policy: keep the 5 most recent, plus the deployed tag `0771cf6…`, `phase0-*` and `v1.2.34`; delete everything else older than 7 days. **Dry run first** (R5). | Not executed (needs gcloud) |
| `roles/logging.logWriter` | Conditional: add only if the SA lacks editor/owner/logWriter (R6) | Not executed |
| VPC connector `niazi-vpc-conn` (about $10–14/month) | Direct VPC egress plan (R7) | **STOPPED**: the subnet and free-IP range must be confirmed by the owner. The connector is untouched. |
| Unused APIs, legacy `JWT_SECRET` | none (low priority, no measurable cost) | Documented for later |
| Remaining fixed cost | Cloud SQL `db-f1-micro` + SSD + PITR (expected); VPC connector until R7 | — |

**Release workflow:** `.github/workflows/release.yml` now sets `releaseDraft: true` (HA-0.4 A). Tagged builds become drafts that the owner publishes manually. The Tauri updater ignores drafts.

## 7. Live database

```text
LIVE DATABASE VERIFICATION: PENDING
```

The AG AI / owner run of `audits/NIAZI_LIVE_PG_READONLY_CHECK.sql` has not been received.

Note: the repository's runner does **not** use sqlx's `_sqlx_migrations` table (it runs 001–006 by hand; `schema_migrations` is never written). If `_sqlx_migrations` does not exist in production, that is expected and is not an error.

No migration state was repaired, marked or changed.

## 8. Tests

| Test | Command / method | Result |
|---|---|---|
| Frontend type-check, before vs after (the real branch tree against the owner PC's `node_modules`, in a throw-away copy) | `tsc --noEmit -p tsconfig.json` | **PASS (no new errors)**: 34 pre-existing errors before, the same 34 after, 0 in the changed files |
| POS return allocation + routing (6 cases: split across sale lines, negative UI quantities, over-return, product not on invoice, empty, and the call goes to `createSalesReturn` with CASH, never to sale completion) | `node --experimental-strip-types test.ts` (harness with the real module) | **PASS 6/6** |
| Forged-token script produces a valid RS256 signature with the leaked key | `openssl dgst -verify` against the leaked public key | **PASS** |
| `cloudbuild.yaml` and `release.yml` valid | `yaml.safe_load` + key checks | **PASS** |
| Only the public key file is un-ignored | `git check-ignore -v` | **PASS** |
| Rust changes parse | `rustfmt --check` (parse) | **PASS** (parse). Formatting differences are pre-existing. |
| Rust unit tests (`token_service` ×4 new, `auth_service`, `admin_service`, `sales_return_service`, `db::postgres`) | `cargo test --lib services::token_service services::auth_service services::admin_service services::sales_return_service db::postgres` | **BLOCKED here** (no crates.io / WebKit). **AG AI must run.** |
| Server build | `cargo build --release --bin niazi-server` | **BLOCKED here. AG AI must run** (changed artifact). |
| Health, auth, DB, pool, old-key rejection on a deployed revision | runbook R2.3 | **NOT RUN** (no deployment) |

## 9. Git

```text
Branch:          feature/database-latest-foundation (local, not pushed)
Part 2 files:    .github/workflows/release.yml
                 .gitignore
                 cloudbuild.yaml
                 frontend/src/features/pos/services/posReturn.service.ts (new)
                 frontend/src/features/pos/store/usePosStore.ts
                 frontend/src/services/sales.api.ts
                 src-tauri/Cargo.toml, src-tauri/Cargo.lock
                 src-tauri/src/bin/server.rs
                 src-tauri/src/services/auth_service.rs
                 src-tauri/src/services/token_service.rs
                 src-tauri/src/services/jwt_public_key.pem (new, placeholder)
                 docs/audits/phase-0-containment-baseline.md (this report)
                 docs/runbooks/phase-0-cloud-runbook.md (new)
Untouched:       all PostgreSQL 001–006 and SQLite 001–017 migrations, Dockerfile, tauri.conf.json
                 (HA-0.5), storefront, sync, database schema
Cloud resources changed:     none
Database resources changed:  none
Side note:       a throw-away copy used for the type-check was written to the owner PC at
                 frontend/node_modules/.cache/claude-typecheck/ (inside node_modules, which is
                 ignored by git; about 0.4 MB; safe to delete).
```

## 10. EXTERNAL ACTION REQUIRED

Every step below is in `docs/runbooks/phase-0-cloud-runbook.md`. **Owner / AG AI:**

| # | Step | Required before |
|---|---|---|
| 1 | Run the Rust tests + server build (commands in §8) on the branch | anything else |
| 2 | R0 record state → R1.1 pin current key versions → R1.2 generate the new key into Secret Manager (prints the new fingerprint) | — |
| 3 | R1.3 send the new **public** key; it is committed to `jwt_public_key.pem` | desktop build |
| 4 | R2 build the image, deploy a no-traffic `phase0` revision, run the R2.3 verification (health, DB, pool log, login, **old-key 401**) | promotion |
| 5 | R4 authorize the version bump to 1.2.35 + branch/tag push; release.yml creates a **draft** | promotion |
| 6 | **OWNER PROMOTION:** R2.4 switch traffic **and** publish the desktop draft together | — |
| 7 | R3 service-level max instances = 10 | after promotion |
| 8 | R5 Artifact Registry dry run, then apply | independent |
| 9 | R6 logging permission (conditional) | independent |
| 10 | R2.5 disable the leaked key versions after about 7 days | after promotion |
| 11 | Live SQL read-only audit output | Phase 1 |
| 12 | Decisions: HA-0.5; HA-3.10 (unlinked returns + exchange settlement); R7 subnet for Direct VPC egress | — |

## 11. Rollback

- **Code:** `git revert <part-2 commit>` (and `1dc7e50` for part 1).
- **Cloud:** each runbook step lists its own rollback. The R0 exports are the reference.

---

**PHASE 0 — AUTHORIZED CONTINUATION COMPLETE (code). Cloud steps pending external execution.**
**No Phase 1 implementation has been started.**
