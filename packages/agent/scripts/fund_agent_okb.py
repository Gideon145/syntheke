"""One-off: fund the agent (funder) wallet with OKB from master so treaties can pay fees."""
from web3 import Web3
from eth_account import Account
import time

RPC = "https://rpc.xlayer.tech"
MASTER_KEY = "0xb4c77bb32ee66a8bdb4d31b7d74d286ce34f651047d69f185dd541f99211a0c8"
AGENT = "0x37beD0c25eCcc8C6B731cDec51e98DbB1266f4Ee"
AMOUNT_ETH = 0.095

w3 = Web3(Web3.HTTPProvider(RPC))
master = Account.from_key(MASTER_KEY)
assert w3.eth.chain_id == 196, "wrong chain"
bal = w3.eth.get_balance(master.address)
print("master OKB before:", w3.from_wei(bal, "ether"), "agent:", w3.from_wei(w3.eth.get_balance(AGENT), "ether"))

nonce = w3.eth.get_transaction_count(master.address, "pending")
tx = {
    "from": master.address,
    "to": Web3.to_checksum_address(AGENT),
    "value": w3.to_wei(AMOUNT_ETH, "ether"),
    "gas": 21000,
    "gasPrice": w3.eth.gas_price,
    "nonce": nonce,
    "chainId": 196,
}
signed = master.sign_transaction(tx)
h = w3.eth.send_raw_transaction(signed.raw_transaction)
print("tx:", h.hex())
r = w3.eth.wait_for_transaction_receipt(h, timeout=120)
print("status:", r.status)
print("master after:", w3.from_wei(w3.eth.get_balance(master.address), "ether"), "agent:", w3.from_wei(w3.eth.get_balance(AGENT), "ether"))
