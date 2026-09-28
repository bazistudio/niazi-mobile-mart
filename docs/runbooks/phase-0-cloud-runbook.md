# PHASE 0 — CLOUD RUNBOOK (owner / AG AI)

**Project:** `niazi-mobile-mart-508317` · **Region:** `asia-south1` · **Service:** `niazi-server` · **Repo branch:** `feature/database-latest-foundation`

Claude Code has **no gcloud access** in its sessions. Every step below must be run by the owner or AG AI, where `gcloud` is authenticated. Cloud Shell is the simplest place, because it already has `gcloud`, `openssl` and `git`.

**Rules:**
- Run the steps in order.
- Never print or copy a private key.
- Every step lists its verification and rollback.
- Steps marked **OWNER PROMOTION** change live traffic or publish a release. Run them only when the owner explicitly says so.

```bash
export PROJECT=niazi-mobile-mart-508317 REGION=asia-south1 SERVICE=niazi-server
gcloud config set project $PROJECT
```

---

## R0. Record the current state (read-only)

```bash
gcloud run services describe $SERVICE --region $REGION --format=export > /tmp/niazi-server-before.yaml
gcloud run revisions list --service $SERVICE --region $REGION --limit 5
gcloud secrets versions list JWT_PRIVATE_KEY
gcloud secrets versions list JWT_PUBLIC_KEY
gcloud compute networks vpc-access connectors describe niazi-vpc-conn --region $REGION > /tmp/niazi-vpc-conn-before.yaml
```

Keep both YAML files. They are the rollback reference for R2, R3 and R7.

---

## R1. JWT key rotation (HA-0.1 authorized)

### R1.1 Pin the currently serving revision to the current key versions

**Why:** the service reads the secrets with `:latest`. Cloud Run resolves `:latest` when an instance starts, and the service scales to zero. Without pinning, the live revision would switch to the new key on its next cold start, **before** the new desktop build exists, and every current desktop would be locked out of online login.

```bash
# Use the version number currently enabled (from R0; normally 1).
gcloud run services update $SERVICE --region $REGION \
  --update-secrets=JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:1,JWT_PUBLIC_KEY=JWT_PUBLIC_KEY:1
```

- **Verify:** the new revision is serving, and `curl -s https://niazi-server-ghhlf5auoa-el.a.run.app/api/health` returns `"database":"connected"`.
- **Rollback:** `gcloud run services update-traffic $SERVICE --region $REGION --to-revisions=<previous-revision>=100`.

### R1.2 Generate the new key pair and store it (private key never leaves this step)

```bash
set -euo pipefail
umask 077
WORK=$(mktemp -d)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$WORK/private.pem"
openssl pkey -in "$WORK/private.pem" -pubout -out "$WORK/public.pem"
gcloud secrets versions add JWT_PRIVATE_KEY --data-file="$WORK/private.pem"   # prints "Created version [N]"
gcloud secrets versions add JWT_PUBLIC_KEY  --data-file="$WORK/public.pem"    # same N expected
echo "NEW public-key fingerprint:"
openssl pkey -pubin -in "$WORK/public.pem" -outform DER | sha256sum
cp "$WORK/public.pem" ~/jwt_public_key.pem      # PUBLIC key only: needed for the desktop build
shred -u "$WORK/private.pem" 2>/dev/null || rm -f "$WORK/private.pem"
rm -rf "$WORK"
```

Record:
- the new version number `N`
- the **new fingerprint**. It must **not** equal the leaked `7f796ac3eee2a66eda5f5d68d09df97c9e256d9d60b1c29a14467c23b4f46c5a`.

### R1.3 Put the new PUBLIC key into the desktop build

Replace the whole content of `src-tauri/src/services/jwt_public_key.pem` with `~/jwt_public_key.pem`, then commit it on `feature/database-latest-foundation`. The file is public; `.gitignore` explicitly allows this one file.

Claude can make this commit if the owner sends the **public** key file.

Until this file holds a real `-----BEGIN PUBLIC KEY-----` block, desktop builds reject all central tokens (fail closed). **Do not build a desktop release before this step.**

---

## R2. Server image + controlled no-traffic deployment (HA-0.4 = draft)

### R2.1 Build the server image without deploying

Do not run `cloudbuild.yaml` here: its last step deploys with 100% traffic.

```bash
SHA=$(git rev-parse --short HEAD)       # run from the repo checkout of feature/database-latest-foundation
IMAGE=asia-south1-docker.pkg.dev/$PROJECT/niazi-repo/niazi-server:phase0-$SHA
gcloud builds submit --region=$REGION --tag=$IMAGE --timeout=7200s .
```

The server image does not depend on `jwt_public_key.pem`, because the server reads `JWT_PUBLIC_KEY` from Secret Manager. The build can therefore run before R1.3.

### R2.2 Deploy as a tagged revision with no traffic

```bash
gcloud run deploy $SERVICE --region=$REGION --image=$IMAGE \
  --no-traffic --tag=phase0 \
  --port=8080 --cpu=1 --memory=1Gi --min-instances=0 --max-instances=10 \
  --vpc-connector=niazi-vpc-conn --vpc-egress=private-ranges-only --allow-unauthenticated \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:N,JWT_PUBLIC_KEY=JWT_PUBLIC_KEY:N
```

Replace `N` with the version from R1.2. The tagged URL is printed as `https://phase0---niazi-server-ghhlf5auoa-el.a.run.app`.

### R2.3 Verify the tagged revision (no production traffic yet)

```bash
TAG_URL=https://phase0---niazi-server-ghhlf5auoa-el.a.run.app
LIVE_URL=https://niazi-server-ghhlf5auoa-el.a.run.app

# Health + database connectivity
curl -s $TAG_URL/api/health                  # expect "status":"ok","database":"connected"

# Pool configuration (expects "max 2 connections")
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.revision_name:$SERVICE AND textPayload:\"connection pool\"" --limit 5 --format='value(textPayload)'

# Login with a real test account -> token signed by the NEW key
TOKEN=$(curl -s -X POST $TAG_URL/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"<test-user>","password":"<password>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" $TAG_URL/api/v1/auth/me    # expect 200

# NEGATIVE TEST: a token signed with the LEAKED key (already public in git history)
FORGED=$(./forge_test_token.sh <path-to-repo>)          # script below; prints only the token
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $FORGED" $TAG_URL/api/v1/auth/me   # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $FORGED" $LIVE_URL/api/v1/auth/me  # 200 before promotion = proof of the exposure
```

`forge_test_token.sh` builds a low-privilege CASHIER test token with a 10-minute expiry and no page access, signed with the leaked key from commit `3199e2d`. The key is written to a temp file and deleted on exit. It was verified to produce a correctly signed RS256 token.

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO="${1:-.}"
KEY=$(mktemp); trap 'rm -f "$KEY"' EXIT
git -C "$REPO" show 3199e2d:private.pem > "$KEY"
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
NOW=$(date +%s); EXP=$((NOW + 600))
HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
PAYLOAD=$(printf '{"sub":"00000000-0000-0000-0000-00000000f07e","username":"rotation-check","role":"CASHIER","access_profile":{"allowed_pages":[],"allowed_actions":[],"limits":{"max_discount_percent":0.0,"can_price_override":false,"can_refund":false,"can_void_sale":false,"can_view_profit":false}},"branch_id":null,"iat":%d,"exp":%d}' "$NOW" "$EXP" | b64url)
SIG=$(printf '%s.%s' "$HEADER" "$PAYLOAD" | openssl dgst -sha256 -sign "$KEY" -binary | b64url)
printf '%s.%s.%s\n' "$HEADER" "$PAYLOAD" "$SIG"
```

**Stop here and report the results to the owner.**

### R2.4 OWNER PROMOTION: switch traffic, together with the desktop release (R4)

```bash
gcloud run services update-traffic $SERVICE --region $REGION --to-tags=phase0=100
```

- **Rollback:** `gcloud run services update-traffic $SERVICE --region $REGION --to-revisions=<R1.1-revision>=100`
- **After promotion:** desktops on v1.2.34 (old public key) cannot complete online login until they install v1.2.35. Offline snapshot login is unaffected.

### R2.5 After promotion is confirmed (about 7 days): disable the leaked key versions

```bash
gcloud secrets versions disable 1 --secret=JWT_PRIVATE_KEY
gcloud secrets versions disable 1 --secret=JWT_PUBLIC_KEY
```

After this, `cloudbuild.yaml`'s `:latest` references resolve to version N.

---

## R3. Cloud Run maximum instances = 10 (F-55)

The R2.2 deploy sets the revision maximum to 10. The AG report also found a **service-level** `maxScale = 20` annotation. With a pool of 2 that allows 40 connections against a limit of 25.

```bash
gcloud run services describe $SERVICE --region $REGION --format=export > /tmp/svc.yaml
grep -n -i "maxscale\|max-instances\|maxInstance" /tmp/svc.yaml
```

- If a service-level value above 10 is present under `metadata.annotations`, set it to `'10'` in `/tmp/svc.yaml`, then run `gcloud run services replace /tmp/svc.yaml --region $REGION`. Alternatively, in the Console: Cloud Run → niazi-server → Edit → Service-level scaling → Maximum instances = 10.
- **Verify:** re-run the `describe` and `grep`. Every max value must be ≤ 10.
- **Rollback:** `gcloud run services replace /tmp/niazi-server-before.yaml --region $REGION`.

`services replace` creates a revision from the exported template. Run R3 **after** R2.4 promotion, so the exported template is the promoted `phase0` revision.

---

## R4. Desktop containment release as a DRAFT (HA-0.4)

`release.yml` now creates **draft** releases (`releaseDraft: true`). The Tauri updater ignores drafts, so no shop PC updates until the owner publishes.

1. R1.3 must be done (the public key file committed).
2. Bump the version to `1.2.35` in `package.json`, `frontend/package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.lock`. Claude can do this on request.
3. Pushing the branch and the tag `v1.2.35` needs explicit owner authorization. The workflow then builds a **draft** release.
4. **OWNER PROMOTION:** publish the draft on GitHub at the same time as R2.4.

---

## R5. Artifact Registry cleanup: keep the 5 most recent images

```bash
# Current state
gcloud artifacts docker images list asia-south1-docker.pkg.dev/$PROJECT/niazi-repo/niazi-server \
  --include-tags --sort-by=~UPDATE_TIME --format='table(version,tags,createTime)' > /tmp/ar-before.txt
wc -l /tmp/ar-before.txt
gcloud run services describe $SERVICE --region $REGION --format='value(spec.template.spec.containers[0].image)'   # deployed image
```

`/tmp/ar-policy.json`:

```json
[
  {"name": "keep-5-most-recent", "action": {"type": "Keep"},
   "mostRecentVersions": {"packageNamePrefixes": ["niazi-server"], "keepCount": 5}},
  {"name": "keep-deployed-and-rollback", "action": {"type": "Keep"},
   "condition": {"tagState": "tagged", "tagPrefixes": ["0771cf6262e7108cabfc1ccf14d52444139fe455", "phase0-", "v1.2.34"]}},
  {"name": "delete-older-than-7d", "action": {"type": "Delete"},
   "condition": {"tagState": "any", "olderThan": "7d"}}
]
```

```bash
# DRY RUN first (nothing is deleted)
gcloud artifacts repositories set-cleanup-policies niazi-repo --location=$REGION --policy=/tmp/ar-policy.json --dry-run
# Review in Cloud Logging which versions WOULD be deleted, then apply:
gcloud artifacts repositories set-cleanup-policies niazi-repo --location=$REGION --policy=/tmp/ar-policy.json --no-dry-run
```

- **Why these rules:** Keep rules always win over Delete rules. The deployed image (`0771cf6…`), the new `phase0-*` image and `v1.2.34` are protected in addition to the 5 newest.
- **Rollback:** delete the policy with `gcloud artifacts repositories delete-cleanup-policies niazi-repo --location=$REGION --policynames=delete-older-than-7d`. Images that were already deleted cannot be restored, but can be rebuilt from their git tags.
- The `cloud-run-source-deploy` repository (237 MB) is left alone: its purpose was not verified.

---

## R6. Cloud Build logging permission (only if missing)

```bash
SA=860232188829-compute@developer.gserviceaccount.com
gcloud projects get-iam-policy $PROJECT --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$SA" --format="value(bindings.role)"
```

- If the output contains `roles/editor`, `roles/owner` or `roles/logging.logWriter`: **do nothing** (log writing is already covered).
- Otherwise:
  ```bash
  gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/logging.logWriter --condition=None
  ```
- **Verify:** the next build's logs appear in Cloud Logging, and the warning is gone.
- **Rollback:** `gcloud projects remove-iam-policy-binding … --role=roles/logging.logWriter`.

---

## R7. Direct VPC egress instead of the connector: STOPPED (needs a decision)

Not executed, because it needs networking information that has not been verified:
- which subnet in the `default` VPC in `asia-south1` to use
- whether it has a free range (Cloud Run Direct VPC egress needs a subnet with enough free IPs; a `/26` or larger is recommended)
- firewall rules that allow egress to `10.8.192.3:5432`

**Plan, once the owner confirms the subnet:**
1. Deploy a no-traffic revision with `--network=default --subnet=<SUBNET> --vpc-egress=private-ranges-only` and **without** `--vpc-connector`.
2. Verify `/api/health` shows `"database":"connected"` on its tag URL.
3. Promote.
4. Update `cloudbuild.yaml` step 3 the same way.
5. Delete `niazi-vpc-conn` only after about 7 days of stable operation.

**Rollback:** redeploy with `--vpc-connector=niazi-vpc-conn` (config saved in R0). The connector is **never deleted first**.
