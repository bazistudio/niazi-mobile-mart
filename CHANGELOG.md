# Changelog

All notable changes to Niazi Mobile Mart will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
