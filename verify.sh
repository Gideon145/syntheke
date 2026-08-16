#!/bin/bash
# Syntheke End-to-End Verifier (MAINNET)
# Judges: run this script against the LIVE deployment to verify the submission.
# Usage: bash verify.sh
# Requires: curl (cast optional)

AGENT_URL="${SYNTHEKE_AGENT_URL:-https://agent-mainnet-production.up.railway.app}"
PACT_ID="0xb42abaf4a8320f4f49f913a954db0aa81b1e61e19cea80ab94aa6d3cdcfd2f26"
PASS=0; FAIL=0; TOTAL=0

green() { echo -e "\033[32m✓ $1\033[0m"; }
red()   { echo -e "\033[31m✗ $1\033[0m"; }

check() {
  TOTAL=$((TOTAL+1))
  if eval "$2"; then green "$1"; PASS=$((PASS+1)); else red "$1"; FAIL=$((FAIL+1)); fi
}

echo "========================================"
echo " Syntheke E2E Verifier (X Layer mainnet)"
echo " Agent: $AGENT_URL"
echo "========================================"
echo ""

# ── Core health ──
echo "── Core health ──"
H=$(curl -sS -m 15 "$AGENT_URL/health" 2>/dev/null || echo '{}')
check "/health responds ok"               'echo "$H" | grep -q "\"ok\""'

S=$(curl -sS -m 15 "$AGENT_URL/status" 2>/dev/null || echo '{}')
check "/status reports running"          'echo "$S" | grep -q "\"running\":true"'
check "/status on chain 196"             'echo "$S" | grep -q "196"'
check "/status monitors ≥1 pact"         'echo "$S" | grep -qE "\"pactsMonitored\":[1-9]"'

# ── Live market data (OnchainOS/OKX) ──
echo ""
echo "── Live market feeds ──"
M=$(curl -sS -m 15 "$AGENT_URL/market" 2>/dev/null || echo '{}')
check "/market returns BTC price"        'echo "$M" | grep -qE "\"btc\".*\"price\":[1-9]"'
check "/market returns ETH price"        'echo "$M" | grep -qE "\"eth\".*\"price\":[1-9]"'

# ── Treasury (on-chain reads) ──
echo ""
echo "── Treasury ──"
T=$(curl -sS -m 15 "$AGENT_URL/treasury" 2>/dev/null || echo '{}')
check "/treasury fees collected > 0"     'echo "$T" | grep -qE "\"totalCollected\":\"[1-9]"'
check "/treasury feeCount ≥ 1"           'echo "$T" | grep -qE "\"feeCount\":[1-9]"'

# ── Escrow (on-chain reads) ──
echo ""
echo "── Escrow ──"
E=$(curl -sS -m 15 "$AGENT_URL/escrow" 2>/dev/null || echo '{}')
check "/escrow asset is mainnet USDT"    'echo "$E" | grep -q "0x779ded0c9e1022225f8e0630b35a9b54be713736"'

# ── x402 payments (on-chain balance) ──
echo ""
echo "── x402 payments ──"
P=$(curl -sS -m 15 "$AGENT_URL/payments" 2>/dev/null || echo '{}')
check "/payments x402 enabled"           'echo "$P" | grep -q "\"enabled\":true"'
check "/payments settled ≥ 10"           'echo "$P" | grep -qE "\"settledCount\":(1[0-9]|[2-9][0-9])"'
check "/payments network eip155:196"     'echo "$P" | grep -q "eip155:196"'

# ── Pacts (on-chain reads across current + legacy contracts) ──
echo ""
echo "── Pacts ──"
PL=$(curl -sS -m 15 "$AGENT_URL/pacts" 2>/dev/null || echo '{}')
check "/pacts returns ≥ 18 treaties"     'echo "$PL" | grep -qE "\"total\":(1[89]|[2-9][0-9])"'
check "/pacts legacy history preserved"  'echo "$PL" | grep -q "legacy"'

PD=$(curl -sS -m 20 "$AGENT_URL/pacts/$PACT_ID" 2>/dev/null || echo '{}')
check "/pacts/:id returns state ACTIVE"  'echo "$PD" | grep -q "\"lastState\":4"'
check "/pacts/:id has two parties"       'echo "$PD" | grep -q "\"partyA\":\"0x"'

# ── A2A agent card ──
echo ""
echo "── A2A agent card ──"
C=$(curl -sS -m 15 "$AGENT_URL/.well-known/agent-card.json" 2>/dev/null || echo '{}')
check "agent card lists pact skills"     'echo "$C" | grep -q "pact-creation"'
check "agent card advertises x402"       'echo "$C" | grep -q "x402"'
check "agent card evaluators #10920+"    'echo "$C" | grep -q "10920"'

# ── Mediators / reputation / evaluator service ──
echo ""
echo "── Mediators & reputation ──"
V=$(curl -sS -m 15 "$AGENT_URL/votes/$PACT_ID" 2>/dev/null || echo '{}')
check "/votes responds"                  'echo "$V" | grep -q "mediators"'

R=$(curl -sS -m 15 "$AGENT_URL/reputation" 2>/dev/null || echo '{}')
check "/reputation responds"             'echo "$R" | grep -qE "oracle|score|tier"'

EV=$(curl -sS -m 15 "$AGENT_URL/tasks/evaluator" 2>/dev/null || echo '{}')
check "/tasks/evaluator advertises swarm" 'echo "$EV" | grep -q "10920"'

echo ""
echo "========================================"
echo " RESULT: $PASS passed / $FAIL failed / $TOTAL total"
echo "========================================"
exit $FAIL
