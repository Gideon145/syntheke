// Verify Syntheke TreasuryVault stats directly on-chain (independent of agent API)
import { ethers } from "ethers";

const RPC = "https://rpc.xlayer.tech";
const CHAIN = 196;
const TREASURY = "0x8fFCC37900133e173b91ac7f1425152F646e6F8D";
const ABI = [
  "function feeAmount() view returns (uint256)",
  "function totalFeesCollected() view returns (uint256)",
  "function feeCount() view returns (uint256)",
  "function balance() view returns (uint256)",
  "function owner() view returns (address)",
];

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN);
  const t = new ethers.Contract(TREASURY, ABI, provider);
  const [feeAmount, totalCollected, feeCount, balance, owner] = await Promise.all([
    t.feeAmount(), t.totalFeesCollected(), t.feeCount(), t.balance(), t.owner(),
  ]);
  console.log(JSON.stringify({
    address: TREASURY,
    owner,
    feeAmount: feeAmount.toString(),
    feeAmountFormatted: ethers.formatEther(feeAmount),
    totalCollected: totalCollected.toString(),
    totalCollectedFormatted: ethers.formatEther(totalCollected),
    feeCount: Number(feeCount),
    balance: balance.toString(),
    balanceFormatted: ethers.formatEther(balance),
    mathCheck: totalCollected.toString() === (feeAmount * feeCount).toString()
      ? "OK: total = fee x count"
      : `MISMATCH: total=${totalCollected} vs fee*count=${feeAmount * feeCount}`,
  }, null, 1));
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
