#!/usr/bin/env bash
# scripts/review-us-page-verify.sh — Verification for Review Us Page relocation + bulk-send

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
    echo "    actual:   ${actual:0:120}"
    FAIL=$((FAIL+1))
    FAILURES+=("$name")
  fi
}

echo "=== Setup: login as PRO owner ==="
curl -s -c /tmp/rup-pro.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@bamboogarden.com","password":"demo1234"}' > /dev/null

PRO_BIZ=$(curl -s -b /tmp/rup-pro.txt "$BASE/api/dashboard" | python3 -c "
import json,sys; d=json.load(sys.stdin); b=d.get('businesses',[]); print(b[0]['id'] if b else 'NONE')
" 2>/dev/null)
echo "  PRO business: $PRO_BIZ"

echo ""
echo "=== Part 0: Relocation ==="

echo "--- Test 1: Sidebar has Review Us Page nav item ---"
HAS_NAV=$(grep -c "'/review-us-page'" /home/z/my-project/src/components/app/sidebar.tsx)
record "sidebar has /review-us-page nav item" "1" "$HAS_NAV"

# Check it's between Campaigns and Analytics
NAV_ORDER=$(grep -n "href:" /home/z/my-project/src/components/app/sidebar.tsx | grep -E "campaigns|review-us-page|analytics" | head -3)
ORDER_OK=$(echo "$NAV_ORDER" | python3 -c "
import sys
lines = sys.stdin.readlines()
positions = {}
for l in lines:
    parts = l.strip().split(':')
    if len(parts) >= 2:
        line_num = int(parts[0])
        if 'campaigns' in l: positions['campaigns'] = line_num
        if 'review-us-page' in l: positions['review-us-page'] = line_num
        if 'analytics' in l: positions['analytics'] = line_num
if 'campaigns' in positions and 'review-us-page' in positions and 'analytics' in positions:
    if positions['campaigns'] < positions['review-us-page'] < positions['analytics']:
        print('ORDER_OK')
    else:
        print(f'ORDER_WRONG: {positions}')
else:
    print(f'MISSING: {positions}')
" 2>/dev/null)
record "nav item is between Campaigns and Analytics" "ORDER_OK" "$ORDER_OK"

echo ""
echo "--- Test 2: Settings page has NO Review Us tab ---"
SETTINGS_REVIEW_US=$(grep -c "review-us\|ReviewUsTab" /home/z/my-project/src/app/settings/page.tsx)
record "Settings page has 0 Review Us references" "0" "$SETTINGS_REVIEW_US"

echo ""
echo "--- Test 3: New /review-us-page route loads (authenticated) ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/rup-pro.txt "$BASE/review-us-page")
record "GET /review-us-page returns 200 (auth)" "200" "$STATUS"

echo ""
echo "--- Test 4: /review-us-page redirects unauth to login ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/review-us-page")
record "unauth → redirect (307)" "307" "$STATUS"

echo ""
echo "--- Test 5: Page contains bulk-send section ---"
HTML=$(curl -s -b /tmp/rup-pro.txt "$BASE/review-us-page")
HAS_SEND=$(echo "$HTML" | grep -c "Send to customers" || true)
[[ $HAS_SEND -ge 1 ]] && PASS=$((PASS+1)) && echo "  PASS: page contains 'Send to customers' section" || { FAIL=$((FAIL+1)); FAILURES+=("send section"); echo "  FAIL: send section"; }

HAS_CSV=$(echo "$HTML" | grep -c "Import CSV" || true)
[[ $HAS_CSV -ge 1 ]] && PASS=$((PASS+1)) && echo "  PASS: page has CSV import button" || { FAIL=$((FAIL+1)); FAILURES+=("csv"); echo "  FAIL: csv"; }

echo ""
echo "=== Part 1: Bulk-send feature ==="

echo ""
echo "--- Test 6: Send API — unauth rejected ---"
RESP=$(curl -s -X POST "$BASE/api/review-us-page/send" \
  -H "Content-Type: application/json" \
  -d '{"businessId":"test","channel":"sms","recipients":[]}')
CODE=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('code','NO'))" 2>/dev/null)
record "unauth → send API rejected" "UNAUTHORIZED" "$CODE"

echo ""
echo "--- Test 7: Send API — missing recipients ---"
RESP=$(curl -s -b /tmp/rup-pro.txt -X POST "$BASE/api/review-us-page/send" \
  -H "Content-Type: application/json" \
  -d "{\"businessId\":\"$PRO_BIZ\",\"channel\":\"sms\",\"recipients\":[]}")
ERR=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','NO'))" 2>/dev/null)
record "empty recipients → 400" "At least one recipient" "$ERR"

echo ""
echo "--- Test 8: Send API — invalid channel ---"
RESP=$(curl -s -b /tmp/rup-pro.txt -X POST "$BASE/api/review-us-page/send" \
  -H "Content-Type: application/json" \
  -d "{\"businessId\":\"$PRO_BIZ\",\"channel\":\"whatsapp\",\"recipients\":[{\"name\":\"Test\",\"contact\":\"555-0100\"}]}")
ERR=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','NO'))" 2>/dev/null)
record "invalid channel → 400" "channel must be" "$ERR"

echo ""
echo "--- Test 9: Send API — businessId not owned ---"
RESP=$(curl -s -b /tmp/rup-pro.txt -X POST "$BASE/api/review-us-page/send" \
  -H "Content-Type: application/json" \
  -d '{"businessId":"not_owned_id","channel":"sms","recipients":[{"name":"Test","contact":"555-0100"}]}')
CODE=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('code','NO'))" 2>/dev/null)
record "businessId not owned → 403" "BUSINESS_NOT_OWNED" "$CODE"

echo ""
echo "--- Test 10: Send API — real send (SMS, not configured → graceful) ---"
# First ensure the business has a slug set
curl -s -b /tmp/rup-pro.txt -X POST "$BASE/api/review-links" \
  -H "Content-Type: application/json" \
  -d "{\"businessId\": \"$PRO_BIZ\", \"slug\": \"bamboo-garden-test\", \"links\": []}" > /dev/null

RESP=$(curl -s -b /tmp/rup-pro.txt -X POST "$BASE/api/review-us-page/send" \
  -H "Content-Type: application/json" \
  -d "{
    \"businessId\": \"$PRO_BIZ\",
    \"channel\": \"sms\",
    \"messageTemplate\": \"Test message for Review Us Page\",
    \"recipients\": [
      {\"name\": \"Test Customer 1\", \"contact\": \"+15555550100\"},
      {\"name\": \"Test Customer 2\", \"contact\": \"+15555550101\"}
    ]
  }")
echo "  response: $(echo "$RESP" | head -c 150)"
HAS_SEND_ID=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print('YES' if d.get('sendId') else 'NO')" 2>/dev/null)
record "send returns sendId" "YES" "$HAS_SEND_ID"

REVIEW_URL=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('reviewUsUrl','NONE'))" 2>/dev/null)
record "response includes reviewUsUrl" "/review-us/bamboo-garden-test" "$REVIEW_URL"

# Since Twilio is not configured, should get success=false but still create records
SUCCESS=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('success','UNKNOWN'))" 2>/dev/null)
record "send with unconfigured Twilio returns success=false (graceful)" "False" "$SUCCESS"

RECIPIENT_COUNT=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('recipientCount',0))" 2>/dev/null)
record "recipientCount = 2" "2" "$RECIPIENT_COUNT"

echo ""
echo "--- Test 11: GET sends API — list past sends ---"
RESP=$(curl -s -b /tmp/rup-pro.txt "$BASE/api/review-us-page/sends?businessId=$PRO_BIZ")
SEND_COUNT=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('sends',[])))" 2>/dev/null)
record "past sends list has at least 1 send" "1" "$SEND_COUNT"  # >= 1

echo ""
echo "--- Test 12: CSV import works ---"
# Create a test CSV and verify it parses correctly
echo 'John Doe,+15555550200
Jane Smith,+15555550201' > /tmp/test-recipients.csv

# We can't easily test file upload via curl, but we can verify the parsing logic
# by checking the send API with multiple recipients
RESP=$(curl -s -b /tmp/rup-pro.txt -X POST "$BASE/api/review-us-page/send" \
  -H "Content-Type: application/json" \
  -d "{
    \"businessId\": \"$PRO_BIZ\",
    \"channel\": \"email\",
    \"recipients\": [
      {\"name\": \"CSV Test 1\", \"contact\": \"csv1@test.com\"},
      {\"name\": \"CSV Test 2\", \"contact\": \"csv2@test.com\"}
    ]
  }")
RECIPIENT_COUNT=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('recipientCount',0))" 2>/dev/null)
record "email send with 2 recipients" "2" "$RECIPIENT_COUNT"

echo ""
echo "--- Test 13: Opt-out filtering ---"
# Add a contact to the opt-out list, then send to it
curl -s -X POST "$BASE/api/unsubscribe" \
  -H "Content-Type: application/json" \
  -d '{"email":"optout-test@test.com"}' > /dev/null

RESP=$(curl -s -b /tmp/rup-pro.txt -X POST "$BASE/api/review-us-page/send" \
  -H "Content-Type: application/json" \
  -d "{
    \"businessId\": \"$PRO_BIZ\",
    \"channel\": \"email\",
    \"recipients\": [
      {\"name\": \"Opted Out User\", \"contact\": \"optout-test@test.com\"},
      {\"name\": \"Sendable User\", \"contact\": \"sendable@test.com\"}
    ]
  }")
SKIPPED=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('skippedOptOut',0))" 2>/dev/null)
record "opted-out recipient skipped" "1" "$SKIPPED"

echo ""
echo "=== Regression: campaigns still work ==="

echo ""
echo "--- Test 14: Campaigns API still responds ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/rup-pro.txt "$BASE/api/campaigns")
record "GET /api/campaigns still works" "200" "$STATUS"

echo ""
echo "--- Test 15: Campaigns page loads ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/rup-pro.txt "$BASE/campaigns")
record "GET /campaigns page loads" "200" "$STATUS"

echo ""
echo "--- Test 16: /r/[token] redirect still works (no 500) ---"
# /r/[token] expects a campaign or review-request ID — check it doesn't crash
# In dev mode, notFound() returns 200 (known Next.js dev behavior)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/r/test-token-nonexistent")
if [[ "$STATUS" == "200" || "$STATUS" == "404" ]]; then
  record "/r/[token] doesn't 500" "PASS" "PASS ($STATUS)"
else
  record "/r/[token] doesn't 500" "PASS" "FAIL ($STATUS)"
fi

echo ""
echo "--- Test 17: Review Us Page (public) still works ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/review-us/bamboo-garden-test")
record "public /review-us/[slug] still loads" "200" "$STATUS"

echo ""
echo "--- Test 18: Settings page still loads (no broken tabs) ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/rup-pro.txt "$BASE/settings")
record "GET /settings still loads" "200" "$STATUS"

echo ""
echo "=== Static checks ==="

echo ""
echo "--- Test 19: All new files exist ---"
for f in \
  src/app/review-us-page/page.tsx \
  src/app/api/review-us-page/send/route.ts \
  src/app/api/review-us-page/sends/route.ts; do
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
echo "--- Test 20: Schema has new tables ---"
HAS_SEND_TABLE=$(grep -c "model ReviewUsSend " /home/z/my-project/prisma/schema.prisma)
record "schema has ReviewUsSend model" "1" "$HAS_SEND_TABLE"
HAS_RECIPIENT_TABLE=$(grep -c "model ReviewUsSendRecipient " /home/z/my-project/prisma/schema.prisma)
record "schema has ReviewUsSendRecipient model" "1" "$HAS_RECIPIENT_TABLE"

echo ""
echo "--- Test 21: Send API does NOT touch Campaign table ---"
# Static check — the send route should import db but not Campaign
CAMPAIGN_IN_SEND=$(grep -c "db.campaign\|Campaign\." /home/z/my-project/src/app/api/review-us-page/send/route.ts || true)
record "send route does not touch Campaign table" "0" "$CAMPAIGN_IN_SEND"

# Cleanup
echo ""
echo "=== Cleanup ==="
node -e "
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  await prisma.reviewUsSendRecipient.deleteMany({})
  await prisma.reviewUsSend.deleteMany({})
  await prisma.optOut.delete({ where: { contact: 'optout-test@test.com' } }).catch(() => {})
  console.log('cleaned')
  await prisma.\$disconnect()
}
main().catch(console.error)
"

echo ""
echo "=================================="
echo "FINAL: $PASS passed, $FAIL failed"
echo "=================================="
if [[ $FAIL -gt 0 ]]; then
  echo "FAILURES:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
fi
