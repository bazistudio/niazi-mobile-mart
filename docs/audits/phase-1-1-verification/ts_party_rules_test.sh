#!/bin/bash
# Phase 1.1 — runs the Party domain/service rule tests with Node >= 22 (no npm install needed).
# Usage (repo root): bash docs/audits/phase-1-1-verification/ts_party_rules_test.sh
set -euo pipefail
F=frontend/src/features/parties
T=$(mktemp -d)
cp "$F/domain/party.domain.ts" "$T/party.domain.ts"
sed "s#'../domain/party.domain'#'./party.domain.ts'#; s#'./party.repository'#'./party.repository.ts'#" \
  "$F/services/party.service.ts" > "$T/party.service.ts"
printf 'export {};\n' > "$T/party.repository.ts"
cp docs/audits/phase-1-1-verification/party_rules.test.ts "$T/party.test.ts"
node --experimental-strip-types --no-warnings --test "$T/party.test.ts"
