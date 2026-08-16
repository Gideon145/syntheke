"""Complete the flagship DEX treaty (0xe9b88bff… DRAFT on V3) manually:
join party B → propose terms (live DEX conditions bits 11/12) → finalize →
both parties deposit escrow → ACTIVE. Uses the deterministic party wallets."""
import json, time, urllib.request
from web3 import Web3
from eth_account import Account

RPC = "https://rpc.xlayer.tech"
V3 = "0x91ddd53ea56519e6f33231e76112a3643fd24f0b"
AGENT = "0x37beD0c25eCcc8C6B731cDec51e98DbB1266f4Ee"
DESC = "DEX liquidity guardian: Provider A maintains Client B's ETH-USDT liquidity depth on the OKX DEX within 2 percent of target and alerts within 60 seconds of any deviation, verified against live OKX market data every 15 seconds"

w3 = Web3(Web3.HTTPProvider(RPC))
agent_key = open(r"c:\Users\vergio\Dev\syntheke\packages\agent\.env.mainnet", encoding="utf-8").read().splitlines()[0].strip()
agent = Account.from_key(agent_key)

# deterministic party keys (mirror create-pact.ts)
desc_hash = "0x" + w3.keccak(text=DESC).hex()
seedA = f"{agent_key}:pact:{desc_hash}:A"
seedB = f"{agent_key}:pact:{desc_hash}:B"
A = Account.from_key("0x" + w3.keccak(text=seedA).hex())
B = Account.from_key("0x" + w3.keccak(text=seedB).hex())
print("partyA:", A.address, "| partyB:", B.address)

# find the flagship draft (state 0, created today) on V3
abi = json.load(open(r"c:\Users\vergio\Dev\syntheke\packages\agent\src\abis\SynthekeContract.json", encoding="utf-8-sig"))
c = w3.eth.contract(address=Web3.to_checksum_address(V3), abi=abi)
ids = c.functions.getPactIds().call()
pact_id = None
for pid in ids:
    st = c.functions.getPactState(pid).call()
    if st[0] == 0 and st[1].lower() == A.address.lower():
        pact_id = pid
        break
assert pact_id, "flagship draft not found"
print("pactId:", "0x" + pact_id.hex())

def send(acct, fn, gas=500000, value=0):
    nonce = w3.eth.get_transaction_count(acct.address, "pending")
    tx = fn.build_transaction({"from": acct.address, "gas": gas, "gasPrice": w3.eth.gas_price, "nonce": nonce, "chainId": 196, "value": value})
    s = acct.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(s.raw_transaction)
    return w3.eth.wait_for_transaction_receipt(h, timeout=180)

# fund both parties from agent (gas only)
for target in (A.address, B.address):
    nonce = w3.eth.get_transaction_count(agent.address, "pending")
    tx = {"from": agent.address, "to": target, "value": w3.to_wei(0.0006, "ether"), "gas": 21000, "gasPrice": w3.eth.gas_price, "nonce": nonce, "chainId": 196}
    s = agent.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(s.raw_transaction)
    w3.eth.wait_for_transaction_receipt(h, timeout=120)
print("parties funded")

# terms with live DEX conditions (bits 11/12) + baseline conditions
terms = (100000000000000, "0x0000000000000000000000000000000000000000", 40320, 15000, 12000, 800, 500, 100, 720, 3, 0x1BFF)

print("joinDraft (B):", send(B, c.functions.joinDraft(pact_id)).status)
print("proposeTerms (A):", send(A, c.functions.proposeTerms(pact_id, terms)).status)
print("finalizeNegotiation (B):", send(B, c.functions.finalizeNegotiation(pact_id)).status)
print("depositEscrow (A):", send(A, c.functions.depositEscrow(pact_id)).status)
print("depositEscrow (B):", send(B, c.functions.depositEscrow(pact_id)).status)

st = c.functions.getPactState(pact_id).call()
print("final state:", st[0], "(4 = ACTIVE) | monitoredConditions:", hex(st[2][10]))
