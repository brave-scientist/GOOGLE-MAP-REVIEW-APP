#!/usr/bin/env bash
# scripts/audit-independent-verify.sh
# Independent runtime verification of SEC-01 + SEC-02 claims.
# Does NOT trust any prior report — only trusts HTTP responses from the live server.

set +e
BASE=http://localhost:3000
PASS=0
FAIL=0
declare -a FAILURES

record() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  PASS: $name (got: $actual)"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL+1))
    FAILURES+=("$name")
  fi
}

echo "=== Setup: two users in different orgs ==="

# Login as PRO owner (Bamboo Garden)
PRO_LOGIN=$(curl -s -c /tmp/audit-pro.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@bamboogarden.com","password":"demo1234"}')
PRO_ORG=$(echo "$PRO_LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('user',{}).get('orgId','NONE'))")
PRO_PLAN=$(echo "$PRO_LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('user',{}).get('orgPlan','NONE'))")
echo "PRO owner: orgId=$PRO_ORG plan=$PRO_PLAN"

# Sign up a FREE-tier user in a different org
curl -s -c /tmp/audit-free.txt -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"audit-free@test.com","password":"testtest123","name":"Audit","businessName":"Audit Biz","industry":"restaurant"}' > /tmp/audit-free-signup.json
FREE_ORG=$(python3 -c "import json; d=json.load(open('/tmp/audit-free-signup.json')); print(d.get('user',{}).get('orgId','NONE'))")
# If user already exists, login instead
if [[ "$FREE_ORG" == "NONE" ]]; then
  curl -s -c /tmp/audit-free.txt -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"audit-free@test.com","password":"testtest123"}' > /tmp/audit-free-login.json
  FREE_ORG=$(python3 -c "import json; d=json.load(open('/tmp/audit-free-login.json')); print(d.get('user',{}).get('orgId','NONE'))")
fi
echo "FREE user: orgId=$FREE_ORG"

if [[ "$PRO_ORG" == "$FREE_ORG" ]]; then
  echo "FATAL: same org — test invalid"; exit 1
fi

# Fetch a PRO review ID + business ID for IDOR tests
PRO_REVIEW=$(curl -s -b /tmp/audit-pro.txt "$BASE/api/inbox" | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d.get('reviews',[])
print(r[0]['id'] if r else 'NONE')")
PRO_BIZ=$(curl -s -b /tmp/audit-pro.txt "$BASE/api/dashboard" | python3 -c "
import json,sys
d=json.load(sys.stdin)
b=d.get('businesses',[])
print(b[0]['id'] if b else 'NONE')")
echo "PRO review=$PRO_REVIEW  business=$PRO_BIZ"
echo ""

echo "=== SEC-01: Cross-org data leak tests (FREE user must NOT see PRO data) ==="

DASH=$(curl -s -b /tmp/audit-free.txt "$BASE/api/dashboard")
record "dashboard excludes PRO biz" \
  "PASS" \
  "$(python3 -c "
import json
d=json.loads('''$DASH''')
n=[b['name'] for b in d.get('businesses',[])]
print('PASS' if 'Bamboo Garden Restaurant' not in n else 'LEAK:'+str(n))")"

INBOX=$(curl -s -b /tmp/audit-free.txt "$BASE/api/inbox")
record "inbox excludes PRO reviews" \
  "PASS" \
  "$(python3 -c "
import json
d=json.loads('''$INBOX''')
r=d.get('reviews',[])
n=set(x.get('business',{}).get('name','') for x in r)
print('PASS' if 'Bamboo Garden Restaurant' not in n else 'LEAK')")"

EXPORT=$(curl -s -b /tmp/audit-free.txt "$BASE/api/export?type=reviews")
CNT=$(echo "$EXPORT" | grep -c "Bamboo Garden" || true)
record "export excludes PRO reviews" "0" "$CNT"

echo ""
echo "=== SEC-01: IDOR — FREE user manipulating PRO review ID ==="

DRAFT=$(curl -s -b /tmp/audit-free.txt -X POST "$BASE/api/reviews/$PRO_REVIEW/draft" \
  -H "Content-Type: application/json" -d '{}')
record "draft on PRO review rejected" \
  "Review not found" \
  "$(python3 -c "import json; d=json.loads('''$DRAFT'''); print(d.get('error','NO_ERR'))")"

APPROVE=$(curl -s -b /tmp/audit-free.txt -X POST "$BASE/api/reviews/$PRO_REVIEW/approve" \
  -H "Content-Type: application/json" -d '{"action":"approve"}')
record "approve on PRO review rejected" \
  "Review not found" \
  "$(python3 -c "import json; d=json.loads('''$APPROVE'''); print(d.get('error','NO_ERR'))")"

echo ""
echo "=== SEC-01: businessId ownership — FREE user with PRO businessId ==="

CAMP=$(curl -s -b /tmp/audit-free.txt -X POST "$BASE/api/campaigns/create" \
  -H "Content-Type: application/json" \
  -d "{\"businessId\":\"$PRO_BIZ\",\"name\":\"pwn\",\"channelMix\":\"sms\",\"recipients\":[{\"name\":\"x\",\"contact\":\"+15555555\"}]}")
record "campaigns/create with PRO biz rejected" \
  "BUSINESS_NOT_OWNED" \
  "$(python3 -c "import json; d=json.loads('''$CAMP'''); print(d.get('code',d.get('error','NO_ERR')))")"

SYNC=$(curl -s -b /tmp/audit-free.txt -X POST "$BASE/api/businesses/$PRO_BIZ/sync-reviews")
record "sync-reviews on PRO biz rejected" \
  "BUSINESS_NOT_OWNED" \
  "$(python3 -c "import json; d=json.loads('''$SYNC'''); print(d.get('code',d.get('error','NO_ERR')))")"

OAUTH=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/audit-free.txt "$BASE/api/oauth/google?businessId=$PRO_BIZ")
record "oauth/google with PRO biz returns 4xx" "40" "$OAUTH"

INTEG=$(curl -s -b /tmp/audit-free.txt -X POST "$BASE/api/integrations" \
  -H "Content-Type: application/json" \
  -d "{\"provider\":\"google\",\"action\":\"connect\",\"businessId\":\"$PRO_BIZ\"}")
record "integrations POST with PRO biz rejected" \
  "BUSINESS_NOT_OWNED" \
  "$(python3 -c "import json; d=json.loads('''$INTEG'''); print(d.get('code',d.get('error','NO_ERR')))")"

echo ""
echo "=== SEC-01: Unauthenticated requests → 401 ==="

for r in /api/dashboard /api/inbox /api/campaigns /api/agency /api/brand-voice /api/export?type=reviews; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$r")
  record "unauth $r → 401" "401" "$CODE"
done

echo ""
echo "=== SEC-02: Admin routes reject non-admin (FREE user) ==="

for r in /api/admin "/api/admin/extend-trial?q=test"; do
  RESP=$(curl -s -b /tmp/audit-free.txt "$BASE$r")
  CODE=$(python3 -c "import json; d=json.loads('''$RESP'''); print(d.get('code',d.get('error','NO_ERR')))")
  record "FREE → $r rejected" "NOT_ADMIN" "$CODE"
done

BCAST=$(curl -s -b /tmp/audit-free.txt -X POST "$BASE/api/admin/broadcast" \
  -H "Content-Type: application/json" -d '{"subject":"x","message":"x"}')
record "FREE → broadcast POST rejected" \
  "NOT_ADMIN" \
  "$(python3 -c "import json; d=json.loads('''$BCAST'''); print(d.get('code',d.get('error','NO_ERR')))")"

echo ""
echo "=== SEC-02: Admin routes reject unauthenticated ==="

for r in /api/admin "/api/admin/extend-trial?q=test"; do
  RESP=$(curl -s "$BASE$r")
  CODE=$(python3 -c "import json; d=json.loads('''$RESP'''); print(d.get('code',d.get('error','NO_ERR')))")
  record "unauth $r rejected" "UNAUTHORIZED" "$CODE"
done

echo ""
echo "=== SEC-02: Admin routes ACCEPT configured admin (PRO owner is in ADMIN_EMAILS) ==="

ADMIN=$(curl -s -b /tmp/audit-pro.txt "$BASE/api/admin")
record "PRO owner → /api/admin returns overview" \
  "YES" \
  "$(python3 -c "import json; d=json.loads('''$ADMIN'''); print('YES' if 'overview' in d else 'NO:'+d.get('error','?')[:80])")"

echo ""
echo "=== SEC-02-D: FAIL CLOSED when ADMIN_EMAILS unset ==="
echo "Restarting server with ADMIN_EMAILS removed from .env..."

cp .env /tmp/audit-env.bak
sed -i '/^ADMIN_EMAILS=/d' .env
pkill -f "next dev" 2>/dev/null
sleep 3
bash .zscripts/dev.sh > /tmp/audit-dev.log 2>&1 &
sleep 18
curl -s -o /dev/null -w "Server after restart: HTTP %{http_code}\n" "$BASE/"

# Re-login PRO owner (new session)
curl -s -c /tmp/audit-pro2.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@bamboogarden.com","password":"demo1234"}' > /dev/null

ADMIN=$(curl -s -b /tmp/audit-pro2.txt "$BASE/api/admin")
record "PRO owner → /api/admin when ADMIN_EMAILS unset" \
  "ADMINS_NOT_CONFIGURED" \
  "$(python3 -c "import json; d=json.loads('''$ADMIN'''); print(d.get('code',d.get('error','NO_ERR')))")"

EXTEND=$(curl -s -b /tmp/audit-pro2.txt -X POST "$BASE/api/admin/extend-trial" \
  -H "Content-Type: application/json" -d '{"orgId":"x","days":14}')
record "PRO owner → extend-trial when ADMIN_EMAILS unset" \
  "ADMINS_NOT_CONFIGURED" \
  "$(python3 -c "import json; d=json.loads('''$EXTEND'''); print(d.get('code',d.get('error','NO_ERR')))")"

BCAST=$(curl -s -b /tmp/audit-pro2.txt -X POST "$BASE/api/admin/broadcast" \
  -H "Content-Type: application/json" -d '{"subject":"x","message":"x"}')
record "PRO owner → broadcast when ADMIN_EMAILS unset" \
  "ADMINS_NOT_CONFIGURED" \
  "$(python3 -c "import json; d=json.loads('''$BCAST'''); print(d.get('code',d.get('error','NO_ERR')))")"

# Restore .env and restart
cp /tmp/audit-env.bak .env
pkill -f "next dev" 2>/dev/null
sleep 3
bash .zscripts/dev.sh > /tmp/audit-dev.log 2>&1 &
sleep 15

echo ""
echo "=================================="
echo "FINAL: $PASS passed, $FAIL failed"
echo "=================================="
if [[ $FAIL -gt 0 ]]; then
  echo "FAILURES:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
fi
