# PHASE 0 — CONTAINMENT + BASELINE VERIFICATION — COMPLETION REPORT

**Date:** 2026-09-27
**Branch:** `feature/database-latest-foundation` (created from `0771cf6`)
**Inputs:**
- Phase 0 execution prompt
- Additional Cloud/DB/Billing authorization
- GCP + Cloud SQL baseline report (prepared by AG AI with gcloud, read-only)
- Owner facts: Cloud Run `niazi-server-00057-jrn`, Cloud SQL `niazi-postgres` PG 17.11, `max_connections = 25`, required pool ≤ 2 per instance

## 1. Executive status

```text
PHASE 0 STATUS: BLOCKED (PARTIAL)
```

Two authorized, decision-free containment items were implemented and committed:
- the PostgreSQL pool limit (F-55)
- the `.gitignore` key protection (F-32)

The following are **not** done, because owner decisions or access are missing:
- **HA-0.1** key rotation
- **HA-0.2** live database verification
- **HA-0.3** F-07 containment
- **HA-0.4** deployment
- **HA-0.5** DevTools/storefront
- cloud cost changes

Nothing was deployed, pushed or tagged.

## 2. Baseline

```text
Repository:         bazistudio/niazi-mobile-mart
Starting SHA:       0771cf6262e7108cabfc1ccf14d52444139fe455 (= origin/main = tag v1.2.34)
Branch:             feature/database-latest-foundation (created 2026-09-27T18:39Z)
Version:            1.2.34
Working tree:       clean before changes
Ending SHA:         see git log (Phase 0 commit on this branch)
Deployed image:     niazi-server:0771cf6… (revision niazi-server-00057-jrn), per the GCP report
```

**Environment limits for this session:**
- The owner PC link was disconnected, so the work was done in a fresh cloud clone and is delivered as a git bundle and patch.
- The Claude Code session itself had **no gcloud and no Cloud SQL access**. All cloud facts come from the AG AI report and the owner.

## 3. Findings (Phase 0 scope)

### F-01 — JWT private key exposure — **NOT RESOLVED (disputed)**

- **Severity:** P0.
- **Status:** OPEN. The GCP report marks it "PASS / resolved". The evidence below does **not** support that conclusion.
- **Evidence:**
  1. The RSA key pair `private.pem` / `public.pem` was committed to the **public** repository in `3199e2d` (2026-09-24 16:22 PKT) and deleted one minute later in `81bacba`. It remains in git history.
  2. The Secret Manager secrets `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` were created on **2026-09-24**, the same day.
  3. `token_service.rs:87–89`: when the `JWT_*` env vars are absent (as on every shop PC), `TokenManager::new()` falls back to the embedded `DEV_PRIVATE_KEY` / `DEV_PUBLIC_KEY`.
  4. The embedded `DEV_PUBLIC_KEY` is byte-identical to the committed `public.pem`. Both have SHA-256 fingerprint (DER, SubjectPublicKeyInfo) **`7f796ac3eee2a66eda5f5d68d09df97c9e256d9d60b1c29a14467c23b4f46c5a`**.
  5. The desktop verifies central tokens with that embedded public key and fails closed on mismatch. Desktop online login works in the field. So production almost certainly signs with the private key that is published in git history.
- **Why "keys in Secret Manager" is not enough:** storing a key in Secret Manager protects it only if the key itself was never published. Here the stored pair is very likely the published pair.
- **Owner check (public key only; no secret is printed):**
  ```text
  gcloud secrets versions access latest --secret=JWT_PUBLIC_KEY --project=niazi-mobile-mart-508317 \
    | openssl pkey -pubin -outform DER | sha256sum
  ```
  If the result is `7f796ac3…c5a`, production uses the leaked key and **HA-0.1 rotation is required**.
- **Action taken:** none. Rotating the key and removing the embedded desktop key are gated by HA-0.1, and removing only the desktop key without rotating would break online desktop login.
- **Remaining risk:** anyone can mint an ADMIN token for the production API.
- **Deferred to:** Phase 0 (once HA-0.1 is decided).

### F-55 — Cloud SQL connection exhaustion — **CONTAINED IN CODE (not deployed)**

- **Severity:** P1.
- **Status:** FIXED on the branch; **not deployed**.
- **Evidence:**
  - `db/postgres.rs` used `max_connections(20)` and `min_connections(2)`.
  - Cloud Run max is 10 instances in the revision template but 20 in the service annotation.
  - `db-f1-micro` allows `max_connections = 25`.
  - Worst case: 10 × 20 = 200 (or 400 at scale 20) against 25. Each live instance also held 2 idle connections.
- **Problem / root cause / change / effect / risk / rollback:**
  - **Problem:** the pool can open far more connections than Cloud SQL allows, which gives `FATAL: sorry, too many clients` under scale.
  - **Root cause:** a hard-coded pool of 20 per instance.
  - **Change:** the pool size is now `PG_POOL_MAX_CONNECTIONS` (default **2**, clamped 1–10, invalid → 2), and `min_connections` is 0 so no idle connections are held. Log messages show the real value.
  - **Expected effect:** at most 10 × 2 = 20 connections from Cloud Run at max-instances 10, leaving about 5 for admin, migration and Cloud SQL internals.
  - **Risk:** under bursts, requests wait up to the existing 10 s `acquire_timeout` instead of opening new connections. That is acceptable at current traffic.
  - **Rollback:** revert the commit, or set `PG_POOL_MAX_CONNECTIONS` on the service.
- **Remaining risk:** the service-level `maxScale=20` annotation drift gives 20 × 2 = 40 > 25. See EXTERNAL ACTION E-4.

### F-32 — `.gitignore` key patterns ineffective — **FIXED**

- **Evidence:**
  - The last two lines of `.gitignore` were UTF-16 encoded (`p\0r\0i\0v\0…`), which made git treat the file as binary.
  - `git check-ignore private.pem` → not ignored.
- **Change:**
  - Replaced the corrupted bytes with UTF-8 `private.pem`, `public.pem` and `*.pem`, keeping CRLF to match the file.
  - `git ls-files '*.pem'` = 0 tracked files, so `*.pem` hides no legitimate source.
- **Verification:** `git check-ignore -v private.pem public.pem jwt_private.pem` → all ignored (`.gitignore:48:*.pem`).
- **Remaining risk:** the keys remain in history (`3199e2d`). `.gitignore` does not make them safe; only rotation (F-01) does.

### F-07 — POS Cash Return / Exchange recorded as sales — **NOT CONTAINED (HA-0.3 pending)**

- **Affected path:**
  1. `PosActionsDropdown.tsx` ("Cash Return", "Exchange Mode")
  2. `usePosStore.ts` (`processCashReturn` / `completeTransaction` map quantities to `-abs(q)`)
  3. `services/sales.api.ts:77` `Math.max(1, quantity)`
  4. `storage_sale_complete` → `SaleService::complete_sale`
- **Effect:** a normal sale of 1 unit per line. Stock goes down, cash goes in, the customer ledger may be debited, and a `SALE_CREATED` outbox event is written and synced.
- **Action:** none, because HA-0.3 (A hide / B reroute / C leave) has not been answered.

### F-30 / N-19 — DevTools in release / public mock storefront — **NOT CHANGED (HA-0.5 pending)**

Facts unchanged from the audits:
- `tauri` feature `devtools` is enabled, and `csp: null`.
- In web mode, the storefront routes render `MOCK_PRODUCTS` on the public Cloud Run URL. Ingress = all, unauthenticated.

### F-17 / F-47 / live database — **NOT VERIFIED (HA-0.2 pending)**

- **F-47:** PostgreSQL 17.11 is confirmed by the owner and AG AI. `UNIQUE NULLS NOT DISTINCT` (005) is supported. **Closed.**
- **F-17:** the live `schema_migrations` state, migration drift and data quality are still unknown. `audits/NIAZI_LIVE_PG_READONLY_CHECK.sql` has not been run.
- **Correction to the GCP report §R:** it lists PostgreSQL migrations 001–005. That is the owner PC's stale checkout (`cabd128`). v1.2.34, which is deployed, contains **006** (`sale_payments` payment-method CHECK). Whether 006 was ever applied to production is unknown. The runner is manual and no ledger is written.
- **DBA review of live queries** (EXPLAIN, pg_stat_statements, idle connections): **BLOCKED**, because there was no database access in this session.

### N-23 — Owner checkout behind / stale local branch — **UNCHANGED**

The owner PC was not reachable in this session.

## 4. Cloud cost findings

| Driver | Classification | Evidence | App-side cause? |
|---|---|---|---|
| Serverless VPC connector `niazi-vpc-conn`, 2 × e2-micro running 24/7 | **CONFIRMED** (AG AI report) | min=2 always on | No: infrastructure |
| Cloud SQL `db-f1-micro` + SSD + PITR | **CONFIRMED** (expected fixed cost) | always-on instance | No |
| Cloud Build `E2_HIGHCPU_8`, about 25 min per build | **CONFIRMED** | `cloudbuild.yaml options.machineType` | No: uncached Rust build of the whole Tauri lib (F-54) |
| Artifact Registry 12.02 GB, no cleanup policy | **CONFIRMED** (small, about $1.2/month) | 50+ images | No |
| Application polling or retry storms | **NOT A DRIVER** (code-verified) | Desktop push skips HTTP when the outbox is empty (`sync_worker.rs:174`); pull runs every 15 min; UI 1–2 s timers call **local** IPC only (`SyncStatusBadge`, `AuditPanel`); no Cloud Scheduler or Pub/Sub triggers | — |
| Cloud Run compute | NOT A DRIVER | min instances 0 | — |
| Unused APIs (BigQuery family, Dataplex, Dataform, Datastore, Analytics Hub) | NOT A COST DRIVER | enabled, unused | — |
| Legacy secret `JWT_SECRET` | NOT A DRIVER (tiny) | no code reference to `JWT_SECRET` or `TOKEN_SECRET` in `*.rs`/`*.ts`/`*.yaml`/`*.toml` | — |

Conclusion: the bill is almost entirely **fixed infrastructure configuration**, not application behaviour.

## 5. EXTERNAL ACTION REQUIRED

**E-1 — Verify and rotate the JWT key (HA-0.1)**
- **Task:** compare the Secret Manager public key fingerprint with `7f796ac3…c5a`. If it matches, rotate.
- **Why required:** F-01.
- **Exact action:**
  1. Run the fingerprint command in §3.
  2. If it matches, generate a new RSA-2048 pair and add both as new versions of `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`.
  3. Redeploy Cloud Run.
  4. Ship a desktop build that loads the public key from config and embeds no private key. This is Claude work, after HA-0.1 and HA-0.4.
  5. Disable the old secret versions after 7 days.
- **Who:** owner (Secret Manager), plus Claude (desktop code).
- **Risk:** every user must log in online once. Sync pauses until they do; the outbox is kept.
- **Verification:** a token signed with the old key → 401; new login → 200; sync push → 200.

**E-2 — Run the live read-only database check (HA-0.2)**
- **Task:** run `audits/NIAZI_LIVE_PG_READONLY_CHECK.sql` plus `SHOW max_connections;` plus `SELECT count(*), state FROM pg_stat_activity GROUP BY 2;`.
- **Why required:** F-17 baseline; Phase 1 cannot baseline migrations without it.
- **Exact action:** Cloud SQL Studio → `niazi_mobile_mart` → paste the script → export the output. The instance has a private IP only, so Studio or a VPC-attached proxy is required.
- **Who:** owner or AG AI.
- **Risk:** none. The script is a read-only transaction ending in ROLLBACK.
- **Verification:** output file stored under `audits/`.

**E-3 — Replace the VPC connector with Direct VPC egress (cost)**
- **Resource:** `niazi-vpc-conn`.
- **Purpose:** gives Cloud Run a path to the Cloud SQL private IP.
- **Why it appears unnecessary:** Cloud Run **Direct VPC egress** reaches private IPs without connector VMs. Connectors cannot go below 2 instances, so "min 0" (as suggested in the GCP report) is not possible.
- **Current usage:** every database request.
- **Estimated impact:** removes about $10–14/month of fixed cost.
- **What happens if changed:** Cloud Run is redeployed with `--network=default --subnet=<subnet> --vpc-egress=private-ranges-only` instead of `--vpc-connector`; `cloudbuild.yaml` step 3 must change the same way. Only after the new revision passes `/api/health` with `"database":"connected"` is the connector deleted.
- **Rollback:** redeploy with `--vpc-connector=niazi-vpc-conn`. Keep the connector until the new revision is verified.
- **Required owner decision:** approve E-3 (this is the "VPC connector" item of your pending Phase 0 approval).

**E-4 — Align Cloud Run max instances**
- **Resource:** `niazi-server` service scaling.
- **Why:** revision template max = 10, but the service annotation `maxScale = 20`. With the new pool of 2: 20 × 2 = 40 > 25.
- **Exact action:** set service-level and revision max instances to **10** (or lower, e.g. 5, while in development: 5 × 2 = 10 connections).
- **Rollback:** set the previous value.
- **Required owner decision:** the value, 10 or 5.

**E-5 — Cloud Build cost**
- **Resource:** `cloudbuild.yaml` `machineType: E2_HIGHCPU_8`.
- **Why:** about 25 min × 8 vCPU per build.
- **Options:**
  - (a) Use the default `e2-standard-2` machine. Cloud Build's free monthly build-minute allowance applies to the default machine type (confirm current terms on the Cloud Build pricing page). Builds get slower.
  - (b) Keep the 8-vCPU machine, but add dependency caching (for example `cargo-chef` layers plus `--cache-from`) to cut build time.
  - (c) Both.
- **Rollback:** revert `cloudbuild.yaml`.
- **Required owner decision:** a, b or c. This is the "build optimization" item of your pending approval, and the change touches caution-listed files (`cloudbuild.yaml`, `Dockerfile`).

**E-6 — Artifact Registry cleanup policy**
- **Resource:** `niazi-repo`.
- **Action:** a cleanup policy "keep most recent 5 versions", plus keep any tag currently deployed (`0771cf6…`). Run it as a **dry run first**.
- **Impact:** about $1/month.
- **Rollback:** none for deleted images. Old images can be rebuilt from git tags.
- **Required owner decision:** approve (deletion).

**E-7 — Cloud Build logging permission**
- **Action:** grant `roles/logging.logWriter` to `860232188829-compute@developer.gserviceaccount.com`. With `logging: CLOUD_LOGGING_ONLY`, build logs are otherwise lost.
- **Who:** owner.
- **Risk:** low.

**E-8 — Optional cleanup (no cost impact)**
- Disable unused BigQuery, Dataplex, Dataform, Datastore and Analytics Hub APIs.
- Disable the legacy `JWT_SECRET` secret version.
- **Required owner decision:** optional. The purpose was not verified, so nothing was touched.

**E-9 — Deploy the pool fix (HA-0.4)**
- The F-55 fix takes effect only after a server deploy of this branch. Not authorized yet.

## 6. Tests

| Test | Command | Result |
|---|---|---|
| Pool-size parsing logic (the real function and test, extracted verbatim) | `rustc --edition 2021 --test poolparse.rs && ./poolparse` | **PASS** (1/1) |
| `postgres.rs` parses as valid Rust | `rustfmt --edition 2021 --check src-tauri/src/db/postgres.rs` | **PASS (parse)**. Only pre-existing formatting differences were reported; the file was not rustfmt-clean before. |
| Crate compile + `cargo test` (incl. the new `test_pool_max_connections_parsing`) | `cargo test --lib db::postgres` | **BLOCKED**: `index.crates.io` is not in this sandbox's network allowlist, and the Tauri lib needs `libwebkit2gtk-4.1-dev` (apt mirrors return 403) |
| Live pool behaviour (≤ 2 concurrent sessions) against PostgreSQL | standalone sqlx harness | **BLOCKED** (same crates.io restriction) |
| Key files ignored | `git check-ignore -v private.pem public.pem jwt_private.pem` | **PASS** |
| No tracked `.pem` files | `git ls-files '*.pem'` | **PASS** (0) |

**Required independent verification (AG AI / owner PC):**
1. `cd src-tauri && cargo test --lib db::postgres`
2. `cargo build --release --bin niazi-server`

## 7. Git

```text
Branch:                feature/database-latest-foundation (local only, NOT pushed)
Files changed:         .gitignore
                       src-tauri/src/db/postgres.rs
                       docs/audits/phase-0-containment-baseline.md (this report; force-added because docs/ is ignored, like the existing tracked docs)
Files intentionally untouched:
                       token_service.rs (HA-0.1)
                       usePosStore.ts / PosActionsDropdown.tsx / sales.api.ts (HA-0.3)
                       tauri.conf.json (HA-0.5)
                       cloudbuild.yaml, Dockerfile (E-3/E-5 pending)
                       all PostgreSQL 001–006 and SQLite 001–017 migrations
```

## 8. Remaining risks

- F-01: active until rotation (P0).
- F-07: active (P0 business integrity).
- F-55: fixed in code, not deployed. E-4 drift.
- Live schema and data unverified (F-17).
- F-30 / N-19 unchanged.
- All Phase 1–7 findings unchanged (see the master roadmap).

## 9. Rollback

```text
git revert <phase-0 commit>
```

This restores the pool of 20 and the old `.gitignore`. No database, cloud or deployed state was changed.

---

**PHASE 0 PARTIAL — STOPPING. No Phase 1 implementation has been started.**
