"""Create a fresh ACTIVE treaty on V4 (corrected condition convention) with
live DEX market conditions — the flagship for self-heal & cure demos."""
import json, time
from web3 import Web3
from eth_account import Account

RPC = "https://rpc.xlayer.tech"
V4 = "0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d"
DESC = "Market-data SLA treaty: Provider A streams real-time OKX price and liquidity alerts to Client B every 15 seconds with sub-second latency, with penalties for stale feeds"

w3 = Web3(Web3.HTTPProvider(RPC))
agent_key = open(r"c:\Users\vergio\Dev\syntheke\packages\agent\.env.mainnet", encoding="utf-8").read().splitlines()[0].strip()
agent = Account.from_key(agent_key)

desc_hash = "0x" + w3.keccak(text=DESC).hex()
A = Account.from_key("0x" + w3.keccak(text=f"{agent_key}:pact:{desc_hash}:A").hex())
B = Account.from_key("0x" + w3.keccak(text=f"{agent_key}:pact:{desc_hash}:B").hex())
print("partyA:", A.address, "| partyB:", B.address)

abi = json.load(open(r"c:\Users\vergio\Dev\syntheke\packages\agent\src\abis\SynthekeContract.json", encoding="utf-8-sig"))
c = w3.eth.contract(address=Web3.to_checksum_address(V4), abi=abi)

def send(acct, fn, gas=500000, value=0):
    nonce = w3.eth.get_transaction_count(acct.address, "pending")
    tx = fn.build_transaction({"from": acct.address, "gas": gas, "gasPrice": w3.eth.gas_price, "nonce": nonce, "chainId": 196, "value": value})
    s = acct.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(s.raw_transaction)
    return w3.eth.wait_for_transaction_receipt(h, timeout=180)

# fund parties (gas) from agent
for target in (A.address, B.address):
    nonce = w3.eth.get_transaction_count(agent.address, "pending")
    tx = {"from": agent.address, "to": target, "value": w3.to_wei(0.0004, "ether"), "gas": 21000, "gasPrice": w3.eth.gas_price, "nonce": nonce, "chainId": 196}
    s = agent.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(s.raw_transaction)
    w3.eth.wait_for_transaction_receipt(h, timeout=120)
print("parties funded")

# draft → join → propose (live DEX bits 11/12) → finalize → deposit both
tx1 = c.functions.createDraft().build_transaction({"from": A.address, "gas": 300000, "gasPrice": w3.eth.gas_price, "nonce": w3.eth.get_transaction_count(A.address, "pending"), "chainId": 196})
s = A.sign_transaction(tx1); h = w3.eth.send_raw_transaction(s.raw_transaction)
r = w3.eth.wait_for_transaction_receipt(h, timeout=180)
pact_id = "0x" + r["logs"][0]["topics"][1].hex()
print("pactId:", pact_id)

terms = (100000000000000, "0x0000000000000000000000000000000000000000", 40320, 15000, 12000, 800, 500, 100, 720, 3, 0x1BFF)
print("joinDraft:", send(B, c.functions.joinDraft(bytes.fromhex(pact_id[2:]))).status)
print("proposeTerms:", send(A, c.functions.proposeTerms(bytes.fromhex(pact_id[2:]), terms)).status)
print("finalizeNegotiation:", send(B, c.functions.finalizeNegotiation(bytes.fromhex(pact_id[2:]))).status)
print("depositEscrow A:", send(A, c.functions.depositEscrow(bytes.fromhex(pact_id[2:]))).status)
print("depositEscrow B:", send(B, c.functions.depositEscrow(bytes.fromhex(pact_id[2:]))).status)

st = c.functions.getPactState(bytes.fromhex(pact_id[2:])).call()
print("final state:", st[0], "(4 = ACTIVE)")

# register keys with the agent
import urllib.request, base64
req = urllib.request.Request("https://agent-mainnet-production.up.railway.app/internal/pact-keys",
    data=json.dumps({"pactId": pact_id, "partyAKey": "0x" + w3.keccak(text=f"{agent_key}:pact:{desc_hash}:A").hex(),
                     "partyBKey": "0x" + w3.keccak(text=f"{agent_key}:pact:{desc_hash}:B").hex()}).encode(),
    method="POST", headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=30) as r2:
        print("keys registered:", json.loads(r2.read().decode()))
except Exception as e:
    print("key registration:", str(e)[:120])
