# Changelog

All notable changes to Niazi Mobile Mart will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.18] - 2026-09-24

### Fixed
- relaxed central credential-snapshots authorization to permit any internal staff to bootstrap their local terminal
- implemented dual-hash storage for snapshot credentials without modifying local SQLite schema
- packed both password and PIN hashes into the existing local `credential_hash` string
- resolved "Invalid credentials" error for non-Admins or staff logging into fresh installations with a PIN
- completely eliminated fresh-install authentication deadlocks for all staff roles


## [1.2.17] - 2026-09-24

### Fixed
- fixed fresh Windows first-login authentication deadlock
- added secure central authentication snapshot bootstrap
- central login can now seed the local auth snapshot on a fresh desktop
- restored native snapshot login/session establishment
- preserved offline-first authentication architecture
- no JWT secret exposed to desktop
- no database migration required

## [1.2.16] - 2026-09-24

### Fixed
- **Native Login Snapshot Synchronization**:
  - Restored registration of the existing native Tauri `auth_login_snapshot` command.
  - Restored successful central-login → native desktop session synchronization.
  - Preserved the existing native authentication/session architecture.
  - No JWT secret exposure.
  - No database schema or migration changes.
  - No unrelated product/business-logic changes.

## [1.2.15] - 2026-09-23

### Fixed
- **Product Capability Service Delegation Repair**:
  - Restored proper delegation from `storage_product_create` and `storage_product_update` capability endpoints to `ProductService::create_product` and `ProductService::update_product`.
  - Ensured initial stock entries and opening stock movement records (`MOVEMENT_OPENING_STOCK`) are created atomically within a single database transaction.
  - Enforced transactional generation of `PRODUCT_CREATED` and `PRODUCT_UPDATED` outbox sync events for reliable cloud synchronization.

- **Native Session Synchronization & Auth Hardening**:
  - Hardened desktop native session synchronization (`AuthState`) to maintain strict separation between native Rust session authentication and central cloud bearer-token (`active_token`) attachment.
  - Verified Cloud Run JWT signing secret (`JWT_SECRET`) remains strictly server-side and is never compiled into or required by desktop client binaries.
  - Enhanced logout handling (`auth_logout`) to purge native session state, `active_token`, frontend local storage, and persisted auth snapshot entries simultaneously.
