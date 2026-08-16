"""Bootstrap the flagship pact's derived party keys into the running agent
(demo tooling) so party-side actions (self-heal, confirmCure) work live."""
import json, urllib.request
from web3 import Web3
from eth_account import Account

DESC = "DEX liquidity guardian: Provider A maintains Client B's ETH-USDT liquidity depth on the OKX DEX within 2 percent of target and alerts within 60 seconds of any deviation, verified against live OKX market data every 15 seconds"
PACT_ID = "0xe9b88bff30f32c442f9112a84270b8d725f185fb73a72c75c74c33c4b5fe9e26"
ENDPOINT = "https://agent-mainnet-production.up.railway.app/internal/pact-keys"

w3 = Web3(Web3.HTTPProvider("https://rpc.xlayer.tech"))
agent_key = open(r"c:\Users\vergio\Dev\syntheke\packages\agent\.env.mainnet", encoding="utf-8").read().splitlines()[0].strip()

desc_hash = "0x" + w3.keccak(text=DESC).hex()
keyA = "0x" + w3.keccak(text=f"{agent_key}:pact:{desc_hash}:A").hex()
keyB = "0x" + w3.keccak(text=f"{agent_key}:pact:{desc_hash}:B").hex()

req = urllib.request.Request(ENDPOINT, data=json.dumps({
    "pactId": PACT_ID, "partyAKey": keyA, "partyBKey": keyB,
}).encode(), method="POST", headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("registered:", json.loads(r.read().decode()))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:200])
except Exception as e:
    print("ERR", str(e)[:200])
