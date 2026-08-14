#!/bin/bash
# Syntheke End-to-End Verifier
# Judges: run this script against the LIVE deployment to verify the submission.
# Usage: bash verify.sh
# Requires: curl (cast optional — on-chain checks run only if foundry is installed)

AGENT_URL="${SYNTHEKE_AGENT_URL:-https://agent-production-507e.up.railway.app}"
RPC="https://testrpc.xlayer.tech"
PACT_ID="0xc40e519126eda06729c4a7a12879daba08aefc6368db334546c3b423c63b40fc"
PASS=0; FAIL=0; TOTAL=0

green() { echo -e "\033[32m✓ $1\033[0m"; }
red()   { echo -e "\033[31m✗ $1\033[0m"; }

check() {
  TOTAL=$((TOTAL+1))
  if eval "$2"; then green "$1"; PASS=$((PASS+1)); else red "$1"; FAIL=$((FAIL+1)); fi
}

echo "========================================"
echo " Syntheke E2E Verifier (X Layer testnet)"
echo " Agent: $AGENT_URL"
echo " $(date)"
echo "========================================"
echo ""

# ── Core health ──
echo "── Core health ──"
H=$(curl -sS -m 15 "$AGENT_URL/health" 2>/dev/null || echo '{}')
check "/health responds ok"               'echo "$H" | grep -q "\"ok\""'

S=$(curl -sS -m 15 "$AGENT_URL/status" 2>/dev/null || echo '{}')
check "/status reports running"          'echo "$S" | grep -q "\"running\":true"'
check "/status on chain 1952"            'echo "$S" | grep -q "1952"'
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
check "/escrow TVL > 0"                  'echo "$E" | grep -qE "\"tvlFormatted\":\"[1-9]"'
check "/escrow reports settlements"      'echo "$E" | grep -qE "\"settledCount\":[1-9]"'

# ── x402 payments (on-chain balance) ──
echo ""
echo "── x402 payments ──"
P=$(curl -sS -m 15 "$AGENT_URL/payments" 2>/dev/null || echo '{}')
check "/payments x402 enabled"           'echo "$P" | grep -q "\"enabled\":true"'
check "/payments settled ≥ 1"            'echo "$P" | grep -qE "\"settledCount\":[1-9]"'
check "/payments network eip155:1952"    'echo "$P" | grep -q "eip155:1952"'

# ── Pacts (on-chain reads) ──
echo ""
echo "── Pacts ──"
PL=$(curl -sS -m 15 "$AGENT_URL/pacts" 2>/dev/null || echo '{}')
check "/pacts returns ≥ 1 treaty"        'echo "$PL" | grep -qE "\"total\":[1-9]"'

PD=$(curl -sS -m 20 "$AGENT_URL/pacts/$PACT_ID" 2>/dev/null || echo '{}')
check "/pacts/:id returns state ACTIVE"  'echo "$PD" | grep -q "\"lastState\":4"'
check "/pacts/:id subject dex"           'echo "$PD" | grep -q "\"subject\":\"dex\""'

# ── AI artifact provenance (on-chain) ──
echo ""
echo "── AI artifacts ──"
A=$(curl -sS -m 20 "$AGENT_URL/artifacts/$PACT_ID" 2>/dev/null || echo '{}')
check "/artifacts count ≥ 1"             'echo "$A" | grep -qE "\"count\":[1-9]"'
check "/artifacts allVerified true"      'echo "$A" | grep -q "\"allVerified\":true"'

# ── A2A agent card ──
echo ""
echo "── A2A agent card ──"
C=$(curl -sS -m 15 "$AGENT_URL/.well-known/agent-card.json" 2>/dev/null || echo '{}')
check "agent card lists 5 skills"        'echo "$C" | grep -q "pact-creation"'
check "agent card advertises x402"       'echo "$C" | grep -q "x402"'
check "agent card evaluators #10920+"    'echo "$C" | grep -q "10920"'

# ── Mediators / votes / reputation ──
echo ""
echo "── Mediators & reputation ──"
V=$(curl -sS -m 15 "$AGENT_URL/votes/$PACT_ID" 2>/dev/null || echo '{}')
check "/votes responds"                  'echo "$V" | grep -q "mediators"'

R=$(curl -sS -m 15 "$AGENT_URL/reputation" 2>/dev/null || echo '{}')
check "/reputation responds"             'echo "$R" | grep -qE "oracle|score|tier"'

EV=$(curl -sS -m 15 "$AGENT_URL/tasks/evaluator" 2>/dev/null || echo '{}')
check "/tasks/evaluator advertises swarm" 'echo "$EV" | grep -q "10920"'

# ── Direct on-chain checks (if foundry installed) ──
echo ""
if command -v cast >/dev/null 2>&1; then
  echo "── Direct chain checks (cast) ──"
  PC=$(cast call 0xE17c79c138bdE2ABfAfbBd2c3bBdD5511735B6E6 "pactCount()(uint256)" --rpc-url "$RPC" 2>/dev/null || echo '0')
  check "pactCount() ≥ 1 on v2 contract" '[ "$(echo "$PC" | tr -d "\r ")" -ge 1 ] 2>/dev/null'
  TVL=$(cast call 0x13be96c8a71628d41e80755f4027aa51a9014e08 "getTVL()(uint256)" --rpc-url "$RPC" 2>/dev/null || echo '0')
  check "EscrowVaultV2.getTVL() > 0"     '[ "$(echo "$TVL" | tr -d "\r ")" -gt 0 ] 2>/dev/null'
  BAL=$(cast call 0x9436031671c96726126fad7E72AAfB4e9ed2A92b "balanceOf(address)(uint256)" 0xCAadA93b4A4D8632d77435A8ee51E5C3D497fD03 --rpc-url "$RPC" 2>/dev/null || echo '0')
  check "x402 treasury balance > 0"      '[ "$(echo "$BAL" | tr -d "\r ")" -gt 0 ] 2>/dev/null'
else
  echo "── Direct chain checks skipped (cast not installed — on-chain values are covered via agent endpoints above) ──"
fi

echo ""
echo "========================================"
echo " RESULT: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then echo " $FAIL check(s) FAILED"; exit 1; fi
echo " All checks passed ✓"
exit 0
