"""Create 8 mainnet treaties, each paid by a distinct wallet via x402.

- Treasury (agent wallet) funds each payer with exactly 0.1 USDT.
- Each payer signs an EIP-3009 authorization and replays POST /pacts/create
  with the PAYMENT-SIGNATURE header (real x402 settlement).
- Two waves of 4 (treasury USDT round-trips: fund -> pay back to treasury).
"""
import json, time, base64, urllib.request, urllib.error
from web3 import Web3
from eth_account import Account

RPC = "https://rpc.xlayer.tech"
ENDPOINT = "https://agent-mainnet-production.up.railway.app/pacts/create"
USDT = "0x779ded0c9e1022225f8e0630b35a9b54be713736"
AGENT_ADDR = "0x37beD0c25eCcc8C6B731cDec51e98DbB1266f4Ee"

w3 = Web3(Web3.HTTPProvider(RPC))
agent_key = open(r"c:\Users\vergio\Dev\syntheke\packages\agent\.env.mainnet", encoding="utf-8").read().splitlines()[0].strip()
agent = Account.from_key(agent_key)

usdt_abi = [
    {"inputs": [{"name": "to", "type": "address"}, {"name": "value", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "DOMAIN_SEPARATOR", "outputs": [{"name": "", "type": "bytes32"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "TRANSFER_WITH_AUTHORIZATION_TYPEHASH", "outputs": [{"name": "", "type": "bytes32"}], "stateMutability": "view", "type": "function"},
]
usdt = w3.eth.contract(address=Web3.to_checksum_address(USDT), abi=usdt_abi)
DOMAIN = usdt.functions.DOMAIN_SEPARATOR().call()
TYPEHASH = usdt.functions.TRANSFER_WITH_AUTHORIZATION_TYPEHASH().call()

def send_with_nonce_retry(tx_fn, attempts=6):
    last = None
    for i in range(attempts):
        try:
            return tx_fn(w3.eth.get_transaction_count(agent.address, "pending"))
        except Exception as e:
            last = e
            if "nonce" in str(e).lower():
                time.sleep(2)
                continue
            raise
    raise last

def fund_usdt(to, amount=100000):
    def run(nonce):
        tx = usdt.functions.transfer(Web3.to_checksum_address(to), amount).build_transaction(
            {"from": agent.address, "gas": 80000, "gasPrice": w3.eth.gas_price, "nonce": nonce, "chainId": 196})
        s = agent.sign_transaction(tx)
        return w3.eth.send_raw_transaction(s.raw_transaction)
    return send_with_nonce_retry(run)

def sign_payment(payer: Account, amount=100000):
    valid_before = int(time.time()) + 280
    nonce = w3.keccak(text=f"pact-pay-{payer.address}-{time.time_ns()}")
    struct_hash = w3.keccak(w3.codec.encode(
        ["bytes32", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
        [TYPEHASH, payer.address, Web3.to_checksum_address(AGENT_ADDR), amount, 0, valid_before, nonce]))
    digest = w3.keccak(b"\x19\x01" + DOMAIN + struct_hash)
    sig = Account._keys.PrivateKey(payer.key).sign_msg_hash(digest)
    v = sig.v if sig.v >= 27 else sig.v + 27
    return base64.b64encode(json.dumps({
        "from": payer.address, "value": str(amount), "validAfter": "0",
        "validBefore": str(valid_before), "nonce": nonce.hex(), "v": v,
        "r": "0x" + sig.r.to_bytes(32, "big").hex(),
        "s": "0x" + sig.s.to_bytes(32, "big").hex(),
    }).encode()).decode()

def create_pact(payer: Account, party_a: str, party_b: str, desc: str):
    hdr = sign_payment(payer)
    body = json.dumps({"partyADesc": party_a, "partyBDesc": party_b, "description": desc}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "Content-Type": "application/json", "PAYMENT-SIGNATURE": hdr})
    try:
        with urllib.request.urlopen(req, timeout=480) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return {"http": e.code, "body": raw[:500]}
    except Exception as e:
        return {"error": str(e)[:300]}

PACT_PLANS = [
    ("Uptime guardian agent", "API operator", "Provider A guarantees 99.95 percent uptime for Client B's API gateway, with penalties for every consecutive hour of downtime"),
    ("Market data agent", "Fund client", "Provider A sends Client B daily market summaries within 10 minutes of every market close"),
    ("Vault watcher agent", "Collateral manager", "Provider A keeps Client B's vault collateral above 150 percent at all times and alerts within 5 minutes"),
    ("Settlement agent", "Payment operator", "Provider A settles Client B's payment batch every 4 hours with 99.9 percent accuracy"),
    ("Portfolio mirror agent", "Allocator client", "Provider A mirrors Client B's portfolio with a tracking error under 0.5 percent, checked hourly"),
]

results = []
# Sequential: fund one payer 0.1, let them pay 0.1 back, repeat.
for plan in PACT_PLANS:
    payer = Account.create()
    txh = fund_usdt(payer.address, 100000)
    print("funded", payer.address, txh.hex()[:18], flush=True)
    time.sleep(4)
    a, b, d = plan
    r = create_pact(payer, a, b, d)
    results.append({"payer": payer.address, **{k: r.get(k) for k in ("result", "pactId", "state", "treasuryFee", "error", "http", "body")}})
    print(json.dumps(results[-1]), flush=True)
    time.sleep(5)

print("=== FINAL ===")
for r in results:
    print(json.dumps(r))
