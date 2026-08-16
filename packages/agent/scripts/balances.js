// Live balance snapshot for Syntheke wallets (X Layer mainnet, chain 196)
import { ethers } from "ethers";

const RPC = "https://rpc.xlayer.tech";
const USDT = "0x779ded0c9e1022225f8e0630b35a9b54be713736"; // mainnet USDT (6dp)
const TREASURY_VAULT = "0x8fFCC37900133e173b91ac7f1425152F646e6F8D";
const WALLETS = {
  "master (0xE95489…)": "0xE95489Ba57561F9EaC2B64E5EFf2935F964440De",
  "agent (0x37beD0…)": "0x37beD0c25eCcc8C6B731cDec51e98DbB1266f4Ee",
  "CLI/TEE (0x8aeb…)": "0x8aeb89e6435fb92ba208683ab340bc3558edf1cb",
  "TreasuryVault contract": TREASURY_VAULT,
};

const erc20 = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC, 196);
  const out = [];
  for (const [name, addr] of Object.entries(WALLETS)) {
    try {
      const [okb, usdt] = await Promise.all([
        provider.getBalance(addr),
        new ethers.Contract(USDT, erc20, provider).balanceOf(addr),
      ]);
      out.push({
        wallet: name,
        address: addr,
        OKB: ethers.formatEther(okb),
        USDT: ethers.formatUnits(usdt, 6),
      });
    } catch (e) {
      out.push({ wallet: name, error: e.message });
    }
  }
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
