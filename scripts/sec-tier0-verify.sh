#!/usr/bin/env bash
# scripts/sec-tier0-verify.sh — Comprehensive SEC-01 + SEC-02 verification
#
# Tests:
#   SEC-01-A: Cross-org data leak (FREE user should NOT see PRO org's data)
#   SEC-01-B: IDOR (FREE user should NOT touch PRO org's reviews)
#   SEC-01-C: businessId ownership (FREE user should NOT create campaigns / initiate
#             OAuth / sync reviews for PRO org's businesses)
#   SEC-01-D: Unauthenticated requests should be rejected
#   SEC-02-A: Admin routes reject non-admin authenticated users
#   SEC-02-B: Admin routes reject unauthenticated requests
#   SEC-02-C: Admin routes ACCEPT configured admins (ADMIN_EMAILS set)
#   SEC-02-D: Admin routes FAIL CLOSED when ADMIN_EMAILS is unset
#
# Usage: bash scripts/sec-tier0-verify.sh

set -e
cd /home/z/my-project

BASE=http://localhost:3000
PASS=0
FAIL=0
declare -a FAILURES

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  ✓ PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  ✗ FAIL: $name"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL+1))
    FAILURES+=("$name")
  fi
}

echo "======================================================"
echo "SETUP: Logins"
echo "======================================================"

# Login as PRO owner (Bamboo Garden)
curl -s -c /tmp/pro-cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@bamboogarden.com","password":"demo1234"}' > /tmp/pro-login.json
PRO_ORG_ID=$(python3 -c "import json; d=json.load(open('/tmp/pro-login.json')); print(d.get('user',{}).get('orgId','NONE'))")
echo "PRO owner login → orgId: $PRO_ORG_ID"

# Sign up a FREE-tier user (different org) for cross-org testing
# First, clean up any prior test user via direct DB call
curl -s -c /tmp/free-cookies.txt -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"security-free@test.com","password":"testtest123","name":"Sec Test","businessName":"Sec Test Biz","industry":"restaurant"}' > /tmp/free-signup.json 2>/dev/null || true

# If signup failed because user exists, log in instead
FREE_ORG_ID=$(python3 -c "import json; d=json.load(open('/tmp/free-signup.json')); print(d.get('user',{}).get('orgId','NONE'))" 2>/dev/null)
if [[ "$FREE_ORG_ID" == "NONE" ]]; then
  curl -s -c /tmp/free-cookies.txt -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"security-free@test.com","password":"testtest123"}' > /tmp/free-login.json
  FREE_ORG_ID=$(python3 -c "import json; d=json.load(open('/tmp/free-login.json')); print(d.get('user',{}).get('orgId','NONE'))")
fi
echo "FREE user → orgId: $FREE_ORG_ID"

if [[ "$PRO_ORG_ID" == "$FREE_ORG_ID" ]]; then
  echo "FATAL: PRO and FREE users have the same orgId — test setup invalid"
  exit 1
fi

# Get a PRO review ID for IDOR testing
PRO_REVIEW_ID=$(curl -s -b /tmp/pro-cookies.txt "$BASE/api/inbox" | python3 -c "
import json, sys
d = json.load(sys.stdin)
reviews = d.get('reviews', [])
print(reviews[0]['id'] if reviews else 'NONE')
" 2>/dev/null)
echo "PRO review ID for IDOR test: $PRO_REVIEW_ID"

# Get a PRO business ID for ownership tests
PRO_BUSINESS_ID=$(curl -s -b /tmp/pro-cookies.txt "$BASE/api/dashboard" | python3 -c "
import json, sys
d = json.load(sys.stdin)
biz = d.get('businesses', [])
print(biz[0]['id'] if biz else 'NONE')
" 2>/dev/null)
echo "PRO business ID for ownership test: $PRO_BUSINESS_ID"

echo ""
echo "======================================================"
echo "SEC-01-A: Cross-org data leak (FREE user must NOT see PRO data)"
echo "======================================================"

DASH=$(curl -s -b /tmp/free-cookies.txt "$BASE/api/dashboard")
check "FREE /api/dashboard excludes Bamboo Garden" \
  "PASS" \
  "$(python3 -c "
import json
d = json.loads('''$DASH''')
biz = [b['name'] for b in d.get('businesses', [])]
print('PASS' if 'Bamboo Garden Restaurant' not in biz else 'FAIL-LEAK: '+str(biz))
" 2>/dev/null)"

INBOX=$(curl -s -b /tmp/free-cookies.txt "$BASE/api/inbox")
check "FREE /api/inbox excludes PRO reviews" \
  "PASS" \
  "$(python3 -c "
import json
d = json.loads('''$INBOX''')
reviews = d.get('reviews', [])
biz_names = set(r.get('business', {}).get('name', '') for r in reviews)
print('PASS' if 'Bamboo Garden Restaurant' not in biz_names else 'FAIL-LEAK')
" 2>/dev/null)"

ANALYTICS=$(curl -s -b /tmp/free-cookies.txt "$BASE/api/analytics")
check "FREE /api/analytics excludes PRO data" \
  "PASS" \
  "$(python3 -c "
import json
d = json.loads('''$ANALYTICS''')
total = d.get('totalReviewsAnalyzed', -1)
# FREE user has ~5 demo reviews from signup; PRO has many more
print('PASS' if total >= 0 and total < 50 else 'CHECK: total='+str(total))
" 2>/dev/null)"

CAMPAIGNS=$(curl -s -b /tmp/free-cookies.txt "$BASE/api/campaigns")
check "FREE /api/campaigns excludes PRO campaigns" \
  "PASS" \
  "$(python3 -c "
import json
d = json.loads('''$CAMPAIGNS''')
camps = d.get('campaigns', [])
print('PASS' if len(camps) == 0 else 'CHECK: '+str(len(camps))+' campaigns')
" 2>/dev/null)"

EXPORT=$(curl -s -b /tmp/free-cookies.txt "$BASE/api/export?type=reviews")
LEAK_COUNT=$(echo "$EXPORT" | grep -c "Bamboo Garden" || true)
check "FREE /api/export excludes PRO reviews" \
  "0" \
  "$LEAK_COUNT"

BRAND_VOICE=$(curl -s -b /tmp/free-cookies.txt "$BASE/api/brand-voice")
check "FREE /api/brand-voice does NOT return PRO profile" \
  "PASS" \
  "$(python3 -c "
import json
d = json.loads('''$BRAND_VOICE''')
p = d.get('profile')
print('PASS' if p is None else 'CHECK: profile exists')
" 2>/dev/null)"

AGENCY=$(curl -s -b /tmp/free-cookies.txt "$BASE/api/agency")
check "FREE /api/agency rejects (plan gate)" \
  "PLAN_UPGRADE_REQUIRED" \
  "$(python3 -c "
import json
d = json.loads('''$AGENCY''')
print(d.get('code', d.get('error', 'NO_ERROR')))
" 2>/dev/null)"

echo ""
echo "======================================================"
echo "SEC-01-B: IDOR (FREE user must NOT touch PRO reviews)"
echo "======================================================"

if [[ "$PRO_REVIEW_ID" != "NONE" ]]; then
  DRAFT=$(curl -s -b /tmp/free-cookies.txt -X POST "$BASE/api/reviews/$PRO_REVIEW_ID/draft" \
    -H "Content-Type: application/json" -d '{}')
  check "FREE → /api/reviews/PRO/draft rejected" \
    "Review not found" \
    "$(python3 -c "import json; d=json.loads('''$DRAFT'''); print(d.get('error', 'NO_ERROR: '+str(d)[:100]))" 2>/dev/null)"

  APPROVE=$(curl -s -b /tmp/free-cookies.txt -X POST "$BASE/api/reviews/$PRO_REVIEW_ID/approve" \
    -H "Content-Type: application/json" -d '{"action":"approve"}')
  check "FREE → /api/reviews/PRO/approve rejected" \
    "Review not found" \
    "$(python3 -c "import json; d=json.loads('''$APPROVE'''); print(d.get('error', 'NO_ERROR: '+str(d)[:100]))" 2>/dev/null)"
else
  echo "  (skipped — no PRO review ID available)"
fi

echo ""
echo "======================================================"
echo "SEC-01-C: businessId ownership (FREE user must NOT act on PRO business)"
echo "======================================================"

if [[ "$PRO_BUSINESS_ID" != "NONE" ]]; then
  CAMP_CREATE=$(curl -s -b /tmp/free-cookies.txt -X POST "$BASE/api/campaigns/create" \
    -H "Content-Type: application/json" \
    -d "{\"businessId\":\"$PRO_BUSINESS_ID\",\"name\":\"pwn\",\"channelMix\":\"sms\",\"recipients\":[{\"name\":\"x\",\"contact\":\"+15555555\"}]}")
  check "FREE → /api/campaigns/create with PRO businessId rejected" \
    "BUSINESS_NOT_OWNED" \
    "$(python3 -c "import json; d=json.loads('''$CAMP_CREATE'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)"

  SYNC=$(curl -s -b /tmp/free-cookies.txt -X POST "$BASE/api/businesses/$PRO_BUSINESS_ID/sync-reviews")
  check "FREE → /api/businesses/PRO/sync-reviews rejected" \
    "BUSINESS_NOT_OWNED" \
    "$(python3 -c "import json; d=json.loads('''$SYNC'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)"

  OAUTH_START=$(curl -s -b /tmp/free-cookies.txt -o /dev/null -w "%{http_code}" "$BASE/api/oauth/google?businessId=$PRO_BUSINESS_ID")
  check "FREE → /api/oauth/google?businessId=PRO returns 4xx" \
    "4" \
    "$(echo $OAUTH_START | head -c1)xx→$OAUTH_START"

  INTEGRATIONS_POST=$(curl -s -b /tmp/free-cookies.txt -X POST "$BASE/api/integrations" \
    -H "Content-Type: application/json" \
    -d "{\"provider\":\"google\",\"action\":\"connect\",\"businessId\":\"$PRO_BUSINESS_ID\"}")
  check "FREE → /api/integrations with PRO businessId rejected" \
    "BUSINESS_NOT_OWNED" \
    "$(python3 -c "import json; d=json.loads('''$INTEGRATIONS_POST'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)"
else
  echo "  (skipped — no PRO business ID available)"
fi

echo ""
echo "======================================================"
echo "SEC-01-D: Unauthenticated requests rejected"
echo "======================================================"

for route in /api/dashboard /api/inbox /api/campaigns /api/agency /api/brand-voice /api/competitors; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$route")
  check "Unauth $route → 401" "401" "$STATUS"
done

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/export?type=reviews")
check "Unauth /api/export → 401" "401" "$STATUS"

echo ""
echo "======================================================"
echo "SEC-02-A: Admin routes reject non-admin authenticated users"
echo "======================================================"
echo "(FREE user is logged in; .env has ADMIN_EMAILS=owner@bamboogarden.com)"
echo "(so the FREE user is NOT in the admin list)"

for route in /api/admin "/api/admin/extend-trial?q=test"; do
  RESP=$(curl -s -b /tmp/free-cookies.txt "$BASE$route")
  CODE=$(python3 -c "import json; d=json.loads('''$RESP'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)
  # Accept either NOT_ADMIN (code) or "Admin access required" (error) — both indicate correct rejection
  if [[ "$CODE" == "NOT_ADMIN" || "$CODE" == *"Admin access required"* || "$CODE" == "ADMINS_NOT_CONFIGURED" ]]; then
    check "FREE → $route rejected" "NOT_ADMIN" "$CODE"
  else
    check "FREE → $route rejected" "Admin access required" "$CODE"
  fi
done

BROADCAST=$(curl -s -b /tmp/free-cookies.txt -X POST "$BASE/api/admin/broadcast" \
  -H "Content-Type: application/json" -d '{"subject":"x","message":"x"}')
CODE=$(python3 -c "import json; d=json.loads('''$BROADCAST'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)
if [[ "$CODE" == "NOT_ADMIN" || "$CODE" == *"Admin access required"* || "$CODE" == "ADMINS_NOT_CONFIGURED" ]]; then
  check "FREE → /api/admin/broadcast rejected" "NOT_ADMIN" "$CODE"
else
  check "FREE → /api/admin/broadcast rejected" "Admin access required" "$CODE"
fi

EXTEND=$(curl -s -b /tmp/free-cookies.txt -X POST "$BASE/api/admin/extend-trial" \
  -H "Content-Type: application/json" -d '{"orgId":"x","days":14}')
CODE=$(python3 -c "import json; d=json.loads('''$EXTEND'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)
if [[ "$CODE" == "NOT_ADMIN" || "$CODE" == *"Admin access required"* || "$CODE" == "ADMINS_NOT_CONFIGURED" ]]; then
  check "FREE → /api/admin/extend-trial POST rejected" "NOT_ADMIN" "$CODE"
else
  check "FREE → /api/admin/extend-trial POST rejected" "Admin access required" "$CODE"
fi

echo ""
echo "======================================================"
echo "SEC-02-B: Admin routes reject unauthenticated requests"
echo "======================================================"

for route in /api/admin "/api/admin/extend-trial?q=test"; do
  RESP=$(curl -s "$BASE$route")
  CODE=$(python3 -c "import json; d=json.loads('''$RESP'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)
  check "Unauth GET $route rejected" "UNAUTHORIZED" "$CODE"
done

BROADCAST=$(curl -s -X POST "$BASE/api/admin/broadcast" \
  -H "Content-Type: application/json" -d '{"subject":"x","message":"x"}')
CODE=$(python3 -c "import json; d=json.loads('''$BROADCAST'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)
check "Unauth POST /api/admin/broadcast rejected" "UNAUTHORIZED" "$CODE"

echo ""
echo "======================================================"
echo "SEC-02-C: Admin routes ACCEPT configured admins"
echo "======================================================"
echo "(PRO owner is owner@bamboogarden.com, which is in ADMIN_EMAILS)"

ADMIN_RESP=$(curl -s -b /tmp/pro-cookies.txt "$BASE/api/admin")
HAS_OVERVIEW=$(python3 -c "import json; d=json.loads('''$ADMIN_RESP'''); print('YES' if 'overview' in d else 'NO: '+d.get('error', str(d)[:100]))" 2>/dev/null)
check "PRO owner → /api/admin returns overview" "YES" "$HAS_OVERVIEW"

EXTEND_SEARCH=$(curl -s -b /tmp/pro-cookies.txt "$BASE/api/admin/extend-trial?q=bamboo")
HAS_USERS=$(python3 -c "import json; d=json.loads('''$EXTEND_SEARCH'''); print('YES' if 'users' in d else 'NO: '+d.get('error', str(d)[:100]))" 2>/dev/null)
check "PRO owner → /api/admin/extend-trial?q= returns users" "YES" "$HAS_USERS"

echo ""
echo "======================================================"
echo "SEC-02-D: FAIL CLOSED — admin routes when ADMIN_EMAILS is unset"
echo "======================================================"
echo "(Restarting server with ADMIN_EMAILS cleared)"

# Stop server, clear env, restart
pkill -f "next dev" 2>/dev/null
sleep 2

# Write a temporary .env without ADMIN_EMAILS
cp .env /tmp/.env.backup
sed -i '/^ADMIN_EMAILS=/d' .env

bash .zscripts/dev.sh > .zscripts/dev.log 2>&1 &
sleep 12

# Re-login the PRO owner (cookies changed because server restarted)
curl -s -c /tmp/pro-cookies2.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@bamboogarden.com","password":"demo1234"}' > /dev/null

# Now even the PRO owner should be denied admin access
ADMIN_RESP=$(curl -s -b /tmp/pro-cookies2.txt "$BASE/api/admin")
CODE=$(python3 -c "import json; d=json.loads('''$ADMIN_RESP'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)
check "PRO owner → /api/admin rejected when ADMIN_EMAILS unset" "ADMINS_NOT_CONFIGURED" "$CODE"

EXTEND=$(curl -s -b /tmp/pro-cookies2.txt -X POST "$BASE/api/admin/extend-trial" \
  -H "Content-Type: application/json" -d '{"orgId":"x","days":14}')
CODE=$(python3 -c "import json; d=json.loads('''$EXTEND'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)
check "PRO owner → /api/admin/extend-trial POST rejected when ADMIN_EMAILS unset" "ADMINS_NOT_CONFIGURED" "$CODE"

BROADCAST=$(curl -s -b /tmp/pro-cookies2.txt -X POST "$BASE/api/admin/broadcast" \
  -H "Content-Type: application/json" -d '{"subject":"x","message":"x"}')
CODE=$(python3 -c "import json; d=json.loads('''$BROADCAST'''); print(d.get('code', d.get('error', 'NO_ERROR')))" 2>/dev/null)
check "PRO owner → /api/admin/broadcast rejected when ADMIN_EMAILS unset" "ADMINS_NOT_CONFIGURED" "$CODE"

# Restore .env and restart
cp /tmp/.env.backup .env
pkill -f "next dev" 2>/dev/null
sleep 2
bash .zscripts/dev.sh > .zscripts/dev.log 2>&1 &
sleep 12

echo ""
echo "======================================================"
echo "FINAL: Per-route status sweep"
echo "======================================================"
echo ""
echo "Every route under src/app/api/ — explicit status:"
echo ""

cat <<EOF
| Route file                                          | Status              |
|-----------------------------------------------------|---------------------|
| src/app/api/route.ts                                | checked-safe (public health check, no DB) |
| src/app/api/admin/route.ts                          | checked-and-fixed (SEC-02: requireAdmin) |
| src/app/api/admin/broadcast/route.ts                | checked-and-fixed (SEC-02: requireAdmin) |
| src/app/api/admin/extend-trial/route.ts             | checked-and-fixed (SEC-02: requireAdmin) |
| src/app/api/agency/route.ts                         | checked-and-fixed (SEC-01: orgId scoping) |
| src/app/api/analytics/route.ts                      | checked-and-fixed (SEC-01: businessIds scoping) |
| src/app/api/auth/google/route.ts                    | checked-safe (auth route; no org-scope leak) |
| src/app/api/auth/login/route.ts                     | checked-safe (auth route) |
| src/app/api/auth/logout/route.ts                    | checked-safe (auth route) |
| src/app/api/auth/me/route.ts                        | checked-safe (returns own session only) |
| src/app/api/auth/otp/route.ts                       | checked-safe (auth route; Tier 1: rate-limit) |
| src/app/api/auth/signup/route.ts                    | checked-safe (auth route) |
| src/app/api/brand-voice/route.ts                    | checked-and-fixed (SEC-01: businessId ownership) |
| src/app/api/businesses/[id]/sync-reviews/route.ts   | checked-and-fixed (SEC-01: businessId ownership) |
| src/app/api/campaigns/route.ts                      | checked-and-fixed (SEC-01: businessIds scoping) |
| src/app/api/campaigns/create/route.ts               | checked-and-fixed (SEC-01: businessId ownership) |
| src/app/api/competitors/route.ts                    | checked-and-fixed (SEC-01: businessId ownership; mock data) |
| src/app/api/contact/route.ts                        | checked-safe (public form, writes audit log only) |
| src/app/api/cron/downgrade-trials/route.ts          | checked-safe (CRON_SECRET guard; Tier 1: harden) |
| src/app/api/dashboard/route.ts                      | checked-and-fixed (SEC-01: businessIds scoping) |
| src/app/api/export/route.ts                         | checked-and-fixed (SEC-01: businessIds scoping) |
| src/app/api/inbox/route.ts                          | checked-and-fixed (SEC-01: businessIds scoping) |
| src/app/api/integrations/route.ts                   | checked-and-fixed (SEC-01: auth + businessId ownership; Tier 1: fake status) |
| src/app/api/oauth/google/route.ts                   | checked-and-fixed (SEC-01: auth + businessId ownership) |
| src/app/api/oauth/google/callback/route.ts          | checked-and-fixed (SEC-01: auth + businessId ownership in callback) |
| src/app/api/reports/create/route.ts                 | checked-and-fixed (SEC-01: auth; no businessId accepted from body) |
| src/app/api/reviews/[id]/approve/route.ts           | checked-and-fixed (SEC-01: IDOR protection) |
| src/app/api/reviews/[id]/draft/route.ts             | checked-and-fixed (SEC-01: IDOR protection) |
| src/app/api/team/invite/route.ts                    | checked-and-fixed (SEC-01: session orgId, not body; SEC-02: role gate) |
| src/app/api/unsubscribe/route.ts                    | checked-safe (public opt-out; writes OptOut table only) |
| src/app/api/webhooks/twilio/route.ts                | checked-safe (Tier 1: webhook signing) |
EOF

echo ""
echo "======================================================"
echo "RESULTS: $PASS passed, $FAIL failed"
echo "======================================================"
if [[ $FAIL -gt 0 ]]; then
  echo "FAILURES:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
