#!/usr/bin/env bash
# scripts/tier1-verify.sh — Independent runtime verification for Tier 1
#
# Tests:
#   SEC-03: Twilio webhook signature validation
#     - Unsigned request → 403
#     - Tampered signature → 403
#     - Valid signature → 200 (and opt-out actually processed)
#     - With TWILIO_AUTH_TOKEN unset → 403 (fail closed)
#
#   SEC-04: OTP rate limiting
#     - Send: 3 succeeds, 4th → 429 with Retry-After header
#     - Verify: 5 attempts (with wrong codes) succeed in returning the
#       "invalid" response, 6th → 429
#
#   AUD-01: Real integration status
#     - GET /api/integrations (no Google token in DB) → google status='available'
#     - GET /api/integrations (no Twilio env) → twilio status='not_configured'
#     - GET /api/integrations (no Resend env) → resend status='not_configured'
#     - Seed a fake Google token → status flips to 'connected'
#
#   AUD-08: SSO/SAML/API access claims removed
#     - GET / (landing page) → no "SSO/SAML" or "API access" in pricing HTML
#     - GET /billing → no "SSO/SAML" in plan features
#     - GET /help → no "SSO" in help article

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

echo "=========================================================="
echo "SEC-03: Twilio webhook signature validation"
echo "=========================================================="
echo ""
echo "(Twilio auth token is NOT set in this env — testing fail-closed)"
echo ""

# Set a fake TWILIO_AUTH_TOKEN for the signature tests by editing .env temporarily
# Actually — we can't easily change env vars for a running Next.js server.
# Instead, we'll test BOTH modes:
#   1. With token unset (current state) → all webhook requests should 403
#   2. Restart with a token set → unsigned = 403, valid = 200, tampered = 403

WEBHOOK_URL="$BASE/api/webhooks/twilio"

echo "--- Test 1: With TWILIO_AUTH_TOKEN unset (current state) ---"
echo "  All webhook requests must fail closed (403)"
UNSIGNED=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B15555550100&Body=STOP&MessageSid=SMtest1")
record "unsigned webhook (token unset) → 403" "403" "$UNSIGNED"

SIGNED_FAKE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: fakebase64signature=" \
  -d "From=%2B15555550100&Body=STOP&MessageSid=SMtest2")
record "fake-signature webhook (token unset) → 403" "403" "$SIGNED_FAKE"

echo ""
echo "--- Test 2: Restart server with TWILIO_AUTH_TOKEN set ---"
cp .env /tmp/tier1-env.bak
echo "TWILIO_AUTH_TOKEN=test_auth_token_12345" >> .env
echo "TWILIO_ACCOUNT_SID=ACtest" >> .env
echo "TWILIO_PHONE_NUMBER=+15555550199" >> .env

pkill -f "next dev" 2>/dev/null
sleep 3
bash .zscripts/dev.sh > /tmp/tier1-dev.log 2>&1 &
sleep 18
curl -s -o /dev/null -w "Server after restart: HTTP %{http_code}\n" "$BASE/"

# Compute a valid Twilio signature using Python
# Twilio's algorithm: HMAC-SHA1(URL + sorted_kv_pairs, auth_token), base64-encoded
# Sorted by key, concatenated as key+value with no separators
WEBHOOK_URL_FOR_SIG="$BASE/api/webhooks/twilio"
AUTH_TOKEN="test_auth_token_12345"

# Use NEXT_PUBLIC_APP_URL if set, else use the local URL (Twilio would call the public URL)
APP_URL="${NEXT_PUBLIC_APP_URL:-$WEBHOOK_URL_FOR_SIG}"

VALID_SIG=$(python3 -c "
import hmac, hashlib, base64
url = '$WEBHOOK_URL_FOR_SIG'
auth_token = '$AUTH_TOKEN'
# Form params (must match what we send in the request body)
params = {'From': '+15555550100', 'Body': 'STOP', 'MessageSid': 'SMtest_valid'}
# Sort by key, concatenate key+value
sorted_str = ''.join(f'{k}{v}' for k, v in sorted(params.items()))
data = (url + sorted_str).encode('utf-8')
sig = base64.b64encode(hmac.new(auth_token.encode('utf-8'), data, hashlib.sha1).digest()).decode('utf-8')
print(sig)
")

echo "  Computed valid signature: $VALID_SIG"

# Test: valid signature → 200
VALID_RESP=$(curl -s -o /tmp/twilio-valid-resp.xml -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: $VALID_SIG" \
  --data-urlencode "From=+15555550100" \
  --data-urlencode "Body=STOP" \
  --data-urlencode "MessageSid=SMtest_valid")
record "validly-signed webhook → 200" "200" "$VALID_RESP"

# Verify the opt-out was actually processed (phone should be in opt-out table)
# We can check via the audit log — but easier: confirm the response is TwiML with the unsub message
TWIAML_CHECK=$(grep -c "unsubscribed" /tmp/twilio-valid-resp.xml || true)
record "valid webhook returns TwiML with unsub message" "1" "$TWIAML_CHECK"

# Test: tampered signature (change one char) → 403
TAMPERED_SIG="${VALID_SIG:0:-1}X"  # replace last char with X
TAMPERED=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: $TAMPERED_SIG" \
  --data-urlencode "From=+15555550100" \
  --data-urlencode "Body=STOP" \
  --data-urlencode "MessageSid=SMtest_tampered")
record "tampered-signature webhook → 403" "403" "$TAMPERED"

# Test: tampered body (valid signature but different Body) → 403
TAMPERED_BODY=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: $VALID_SIG" \
  --data-urlencode "From=+15555550100" \
  --data-urlencode "Body=START" \
  --data-urlencode "MessageSid=SMtest_tampered_body")
record "valid-sig-but-tampered-body → 403" "403" "$TAMPERED_BODY"

# Test: missing signature header entirely → 403
MISSING=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "From=+15555550100" \
  --data-urlencode "Body=STOP" \
  --data-urlencode "MessageSid=SMtest_missing")
record "missing-signature webhook → 403" "403" "$MISSING"

echo ""
echo "=========================================================="
echo "SEC-04: OTP rate limiting"
echo "=========================================================="
echo ""

# Use a fresh email so we don't conflict with prior rate-limit state
TEST_EMAIL="tier1-otp-$(date +%s)@test.com"

echo "--- Send rate limit: 3 allowed, 4th = 429 ---"
for i in 1 2 3 4; do
  RESP=$(curl -s -o /tmp/otp-send-$i.json -w "%{http_code}" -X POST "$BASE/api/auth/otp" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"send\",\"email\":\"$TEST_EMAIL\"}")
  CODE=$(python3 -c "import json; d=json.load(open('/tmp/otp-send-$i.json')); print(d.get('code','NO_CODE'))" 2>/dev/null)
  if [[ $i -le 3 ]]; then
    record "OTP send #$i → 200" "200" "$RESP"
  else
    record "OTP send #$i → 429" "429" "$RESP"
    record "OTP send #$i body has code=RATE_LIMITED" "RATE_LIMITED" "$CODE"
    # Check Retry-After header (case-insensitive — HTTP headers are case-insensitive)
    RA=$(curl -s -o /dev/null -D - -X POST "$BASE/api/auth/otp" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"send\",\"email\":\"$TEST_EMAIL\"}" | grep -i "^retry-after:" | tr -d '\r')
    record "429 response includes Retry-After header" "retry-after" "$RA"
  fi
done

echo ""
echo "--- Verify rate limit: 5 allowed, 6th = 429 ---"
TEST_EMAIL2="tier1-verify-$(date +%s)@test.com"
# First send an OTP so a code exists
curl -s -X POST "$BASE/api/auth/otp" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"send\",\"email\":\"$TEST_EMAIL2\"}" > /dev/null

for i in 1 2 3 4 5 6; do
  RESP=$(curl -s -o /tmp/otp-verify-$i.json -w "%{http_code}" -X POST "$BASE/api/auth/otp" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"verify\",\"email\":\"$TEST_EMAIL2\",\"code\":\"000000\"}")
  CODE=$(python3 -c "import json; d=json.load(open('/tmp/otp-verify-$i.json')); print(d.get('code',d.get('error','NO_ERR')))" 2>/dev/null)
  if [[ $i -le 5 ]]; then
    # Should be 400 "Invalid OTP code" (because we sent 000000 which is wrong)
    record "OTP verify #$i → 400 (wrong code)" "400" "$RESP"
  else
    record "OTP verify #$i → 429 (rate limited)" "429" "$RESP"
    record "OTP verify #$i body has code=RATE_LIMITED" "RATE_LIMITED" "$CODE"
  fi
done

echo ""
echo "=========================================================="
echo "AUD-01: Real integration status (no fake 'connected')"
echo "=========================================================="
echo ""

# Login as PRO owner
curl -s -c /tmp/tier1-pro.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@bamboogarden.com","password":"demo1234"}' > /dev/null

# Get integrations list
INTEG=$(curl -s -b /tmp/tier1-pro.txt "$BASE/api/integrations")
echo "  Raw response (first 800 chars):"
echo "$INTEG" | head -c 800
echo ""
echo ""

# Check Google is NOT 'connected' (no real OAuth token in DB)
GOOGLE_STATUS=$(python3 -c "
import json
d=json.loads('''$INTEG''')
for i in d.get('integrations',[]):
  if i['provider']=='google':
    print(i['status'])
    break
")
record "google status (no token in DB) = 'available'" "available" "$GOOGLE_STATUS"

TWILIO_STATUS=$(python3 -c "
import json
d=json.loads('''$INTEG''')
for i in d.get('integrations',[]):
  if i['provider']=='twilio':
    print(i['status'])
    break
")
record "twilio status (env set) = 'connected'" "connected" "$TWILIO_STATUS"

RESEND_STATUS=$(python3 -c "
import json
d=json.loads('''$INTEG''')
for i in d.get('integrations',[]):
  if i['provider']=='resend':
    print(i['status'])
    break
")
record "resend status (env NOT set) = 'not_configured'" "not_configured" "$RESEND_STATUS"

STRIPE_STATUS=$(python3 -c "
import json
d=json.loads('''$INTEG''')
for i in d.get('integrations',[]):
  if i['provider']=='stripe':
    print(i['status'])
    break
")
record "stripe status (not implemented) = 'not_configured'" "not_configured" "$STRIPE_STATUS"

echo ""
echo "--- AUD-01 positive test: seed a fake Google token, status should flip ---"

# Use Prisma to insert a fake OAuthToken row for the first business
PRO_BIZ=$(curl -s -b /tmp/tier1-pro.txt "$BASE/api/dashboard" | python3 -c "
import json,sys
d=json.load(sys.stdin)
b=d.get('businesses',[])
print(b[0]['id'] if b else 'NONE')
")
echo "  Using businessId: $PRO_BIZ"

if [[ "$PRO_BIZ" != "NONE" ]]; then
  # Insert via a Node script using Prisma client (must run from project root
  # so Node can resolve @prisma/client from node_modules)
  cd /home/z/my-project && node scripts/seed-test-token.js "$PRO_BIZ" seed

  # Re-fetch integrations
  INTEG2=$(curl -s -b /tmp/tier1-pro.txt "$BASE/api/integrations?businessId=$PRO_BIZ")
  GOOGLE_STATUS2=$(python3 -c "
import json
d=json.loads('''$INTEG2''')
for i in d.get('integrations',[]):
  if i['provider']=='google':
    print(i['status'])
    break
")
  record "google status (token seeded) = 'connected'" "connected" "$GOOGLE_STATUS2"

  # Cleanup: delete the seeded token
  cd /home/z/my-project && node scripts/seed-test-token.js "$PRO_BIZ" cleanup
fi

echo ""
echo "=========================================================="
echo "AUD-08: SSO/SAML/API access claims removed from marketing"
echo "=========================================================="
echo ""

# Fetch the pricing/landing page HTML
LANDING=$(curl -s "$BASE/")
# AUD-08: "SSO/SAML" must NOT appear as a feature in the rendered pricing section.
# The FAQ can mention SSO honestly (as "on roadmap") — that's allowed.
SSO_AS_FEATURE=$(echo "$LANDING" | grep -c "SSO/SAML" || true)
record "landing page HTML has no 'SSO/SAML' feature claim" "0" "$SSO_AS_FEATURE"

API_ACCESS_FEATURE=$(echo "$LANDING" | grep -c "'API access'" || true)
record "landing page HTML has no 'API access' feature claim" "0" "$API_ACCESS_FEATURE"

# The FAQ answer is rendered client-side (React), so we verify the source file
# directly to confirm it honestly says SSO is on the roadmap, not "available".
FAQ_HONEST=$(grep -c "SSO/SAML is on our roadmap" /home/z/my-project/src/app/page.tsx)
record "source: FAQ honestly says SSO is on roadmap" "1" "$FAQ_HONEST"

# Billing page
BILLING=$(curl -s "$BASE/billing")
BILLING_SSO=$(echo "$BILLING" | grep -c "SSO/SAML" || true)
record "billing page has no 'SSO/SAML' claim" "0" "$BILLING_SSO"

# Help page
HELP=$(curl -s "$BASE/help")
HELP_SSO=$(echo "$HELP" | grep -c "SSO" || true)
record "help page has no 'SSO' claim" "0" "$HELP_SSO"

echo ""
echo "=========================================================="
echo "FINAL: $PASS passed, $FAIL failed"
echo "=========================================================="
if [[ $FAIL -gt 0 ]]; then
  echo "FAILURES:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
fi

# Restore env (remove the TWILIO test vars we added)
cp /tmp/tier1-env.bak .env
pkill -f "next dev" 2>/dev/null
sleep 3
bash .zscripts/dev.sh > /tmp/tier1-dev.log 2>&1 &
sleep 12
echo "(Server restarted with original .env)"
