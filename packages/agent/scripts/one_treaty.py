"""Create ONE mainnet treaty, paid via x402 by a fresh payer wallet."""
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

usdt = w3.eth.contract(address=Web3.to_checksum_address(USDT), abi=[
    {"inputs": [{"name": "to", "type": "address"}, {"name": "value", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [], "name": "DOMAIN_SEPARATOR", "outputs": [{"name": "", "type": "bytes32"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "TRANSFER_WITH_AUTHORIZATION_TYPEHASH", "outputs": [{"name": "", "type": "bytes32"}], "stateMutability": "view", "type": "function"},
])
DOMAIN = usdt.functions.DOMAIN_SEPARATOR().call()
TYPEHASH = usdt.functions.TRANSFER_WITH_AUTHORIZATION_TYPEHASH().call()

def fund_usdt(to, amount=100000):
    nonce = w3.eth.get_transaction_count(agent.address, "pending")
    tx = usdt.functions.transfer(Web3.to_checksum_address(to), amount).build_transaction(
        {"from": agent.address, "gas": 80000, "gasPrice": w3.eth.gas_price, "nonce": nonce, "chainId": 196})
    s = agent.sign_transaction(tx)
    return w3.eth.send_raw_transaction(s.raw_transaction)

def sign_payment(payer, amount=100000):
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

payer = Account.create()
h = fund_usdt(payer.address, 100000)
print("funded", payer.address, h.hex()[:18], flush=True)
time.sleep(5)

body = json.dumps({
    "partyADesc": "Signal service agent",
    "partyBDesc": "Trading desk client",
    "description": "Provider A streams liquidation-risk alerts to Client B within 30 seconds of detection, with a maximum of 1 missed alert per week",
}).encode()
req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
    "Content-Type": "application/json", "PAYMENT-SIGNATURE": sign_payment(payer)})
try:
    with urllib.request.urlopen(req, timeout=480) as r:
        d = json.loads(r.read().decode())
        print(json.dumps({"payer": payer.address,
                          **{k: d.get(k) for k in ("result", "pactId", "state", "treasuryFee", "error")}}, indent=1))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:400])
except Exception as e:
    print("ERR", str(e)[:300])
