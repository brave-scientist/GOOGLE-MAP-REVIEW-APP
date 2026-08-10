#!/usr/bin/env bash
# scripts/facebook-verify.sh — Runtime verification for Facebook integration

set +e
BASE=http://localhost:3000
PASS=0
FAIL=0
declare -a FAILURES

record() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name"
    echo "    expected: $expected"
    echo "    actual:   ${actual:0:150}"
    FAIL=$((FAIL+1))
    FAILURES+=("$name")
  fi
}

echo "=== Setup: login as PRO owner ==="
curl -s -c /tmp/fb-pro.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@bamboogarden.com","password":"demo1234"}' > /dev/null
echo "  logged in"

echo ""
echo "=== Test 1: OAuth start route — unauth ==="
RESP=$(curl -s "$BASE/api/oauth/facebook?businessId=test")
CODE=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('code','NO'))" 2>/dev/null)
record "unauth → /api/oauth/facebook rejected" "UNAUTHORIZED" "$CODE"

echo ""
echo "=== Test 2: OAuth start route — auth, no FACEBOOK env vars ==="
# Use the real PRO business ID so we pass the ownership check first
PRO_BIZ_FOR_TEST2=$(curl -s -b /tmp/fb-pro.txt "$BASE/api/dashboard" | python3 -c "
import json,sys
d=json.load(sys.stdin)
b=d.get('businesses',[])
print(b[0]['id'] if b else 'NONE')
" 2>/dev/null)
RESP=$(curl -s -b /tmp/fb-pro.txt "$BASE/api/oauth/facebook?businessId=$PRO_BIZ_FOR_TEST2")
echo "  response: $(echo "$RESP" | head -c 120)"
record "auth without FB env → 503 with setup instructions" "Facebook OAuth not configured" "$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','NO'))" 2>/dev/null)"

echo ""
echo "=== Test 3: OAuth start route — missing businessId ==="
RESP=$(curl -s -b /tmp/fb-pro.txt "$BASE/api/oauth/facebook")
record "missing businessId → 400" "businessId query parameter is required" "$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','NO'))" 2>/dev/null)"

echo ""
echo "=== Test 4: OAuth start route — businessId not owned ==="
RESP=$(curl -s -b /tmp/fb-pro.txt "$BASE/api/oauth/facebook?businessId=not_owned_id")
CODE=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('code','NO'))" 2>/dev/null)
record "businessId not owned → 403 BUSINESS_NOT_OWNED" "BUSINESS_NOT_OWNED" "$CODE"

echo ""
echo "=== Test 5: OAuth callback — authenticated, missing code ==="
# Need auth for the callback route (middleware protects it)
RESP=$(curl -s -b /tmp/fb-pro.txt -o /dev/null -w "%{http_code} %{redirect_url}" "$BASE/api/oauth/facebook/callback")
echo "  redirect: $RESP"
record "callback without code → redirect to /settings?error=facebook_oauth_failed" "facebook_oauth_failed" "$RESP"

echo ""
echo "=== Test 6: select-page route — unauth ==="
RESP=$(curl -s -X POST "$BASE/api/oauth/facebook/select-page" \
  -H "Content-Type: application/json" \
  -d '{"businessId":"test","pageId":"test"}')
CODE=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('code','NO'))" 2>/dev/null)
record "unauth → select-page rejected" "UNAUTHORIZED" "$CODE"

echo ""
echo "=== Test 7: select-page route — missing params ==="
RESP=$(curl -s -b /tmp/fb-pro.txt -X POST "$BASE/api/oauth/facebook/select-page" \
  -H "Content-Type: application/json" \
  -d '{}')
record "missing params → 400" "businessId and pageId are required" "$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','NO'))" 2>/dev/null)"

echo ""
echo "=== Test 8: sync-facebook-reviews — unauth ==="
RESP=$(curl -s -X POST "$BASE/api/businesses/test/sync-facebook-reviews")
CODE=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('code','NO'))" 2>/dev/null)
record "unauth → sync rejected" "UNAUTHORIZED" "$CODE"

echo ""
echo "=== Test 9: sync-facebook-reviews — no Facebook token connected ==="
# Get PRO business ID
PRO_BIZ=$(curl -s -b /tmp/fb-pro.txt "$BASE/api/dashboard" | python3 -c "
import json,sys
d=json.load(sys.stdin)
b=d.get('businesses',[])
print(b[0]['id'] if b else 'NONE')
" 2>/dev/null)
echo "  PRO business: $PRO_BIZ"

if [[ "$PRO_BIZ" != "NONE" ]]; then
  RESP=$(curl -s -b /tmp/fb-pro.txt -X POST "$BASE/api/businesses/$PRO_BIZ/sync-facebook-reviews")
  echo "  response: $(echo "$RESP" | head -c 120)"
  # When Facebook env vars are not set, sync returns 503 "not configured"
  # (the env check fires before the token check — correct order)
  record "sync without FB env → 503 'not configured'" "not configured" "$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','NO'))" 2>/dev/null)"
fi

echo ""
echo "=== Test 10: integrations API reflects Facebook status ==="
RESP=$(curl -s -b /tmp/fb-pro.txt "$BASE/api/integrations")
FB_STATUS=$(echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for i in d.get('integrations',[]):
  if i['provider']=='facebook':
    print(f\"status={i['status']} desc={i['desc'][:60]}\")
" 2>/dev/null)
echo "  Facebook in integrations API: $FB_STATUS"
record "Facebook listed in integrations API" "status=" "$FB_STATUS"
record "Facebook desc mentions not configured (since no env)" "not configured" "$FB_STATUS"

echo ""
echo "=== Test 11: Seed a fake Facebook token, verify status flips to connected ==="
if [[ "$PRO_BIZ" != "NONE" ]]; then
  cd /home/z/my-project && node -e "
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    async function main() {
      const enc = (s) => Buffer.from(s).toString('base64')
      await prisma.oAuthToken.upsert({
        where: { businessId_provider: { businessId: '$PRO_BIZ', provider: 'facebook' } },
        create: {
          businessId: '$PRO_BIZ',
          provider: 'facebook',
          accessTokenEnc: enc('fake-page-access-token'),
          refreshTokenEnc: '',
          expiresAt: null,
          scopes: 'pages_read_engagement',
        },
        update: {
          accessTokenEnc: enc('fake-page-access-token'),
        },
      })
      // Also set facebookPageId on the business
      await prisma.business.update({
        where: { id: '$PRO_BIZ' },
        data: { facebookPageId: 'fake_page_123' },
      })
      console.log('seeded')
      await prisma.\$disconnect()
    }
    main().catch(e => { console.error(e); process.exit(1) })
  "
  
  RESP=$(curl -s -b /tmp/fb-pro.txt "$BASE/api/integrations?businessId=$PRO_BIZ")
  FB_STATUS2=$(echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for i in d.get('integrations',[]):
  if i['provider']=='facebook':
    print(f\"status={i['status']}\")
" 2>/dev/null)
  echo "  Facebook after seeding: $FB_STATUS2"
  record "Facebook status flips to connected when token exists" "status=connected" "$FB_STATUS2"
  
  # Cleanup
  node -e "
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    async function main() {
      await prisma.oAuthToken.deleteMany({ where: { businessId: '$PRO_BIZ', provider: 'facebook' } })
      await prisma.business.update({ where: { id: '$PRO_BIZ' }, data: { facebookPageId: null } })
      console.log('cleaned')
      await prisma.\$disconnect()
    }
    main().catch(e => { console.error(e); process.exit(1) })
  "
fi

echo ""
echo "=== Test 12: Static check — all Facebook files exist ==="
for f in \
  src/lib/integrations/facebook-graph.ts \
  src/app/api/oauth/facebook/route.ts \
  src/app/api/oauth/facebook/callback/route.ts \
  src/app/api/oauth/facebook/select-page/route.ts \
  src/app/api/businesses/[id]/sync-facebook-reviews/route.ts; do
  if [[ -f "/home/z/my-project/$f" ]]; then
    echo "  ✓ $f"
    PASS=$((PASS+1))
  else
    echo "  ✗ $f MISSING"
    FAIL=$((FAIL+1))
    FAILURES+=("$f missing")
  fi
done

echo ""
echo "=== Test 13: Integrations API imports isFacebookConfigured ==="
HAS_IMPORT=$(grep -c "isFacebookConfigured" /home/z/my-project/src/app/api/integrations/route.ts)
record "integrations route imports isFacebookConfigured" "2" "$HAS_IMPORT"

echo ""
echo "=== Test 14: Settings page wires Facebook Connect button ==="
HAS_FB_HANDLER=$(grep -c "provider === 'facebook'" /home/z/my-project/src/app/settings/page.tsx)
record "settings page has Facebook OAuth handler" "1" "$HAS_FB_HANDLER"

echo ""
echo "=================================="
echo "FINAL: $PASS passed, $FAIL failed"
echo "=================================="
if [[ $FAIL -gt 0 ]]; then
  echo "FAILURES:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
fi
