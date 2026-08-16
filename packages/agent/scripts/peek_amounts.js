// Peek at pact terms.amount scale for existing mainnet treaties
import { ethers } from "ethers";
import abi from "../src/abis/SynthekeContract.json" with { type: "json" };

const RPC = "https://rpc.xlayer.tech";
const SYNTHEKE = "0x2693Bab68Fa76b9DF585416672c1363FA5b0fE7A";

const IDS = [
  "0x202b3345", "0xe528da1e", "0x43f211af", "0x8ad7b402",
  "0xd4bb2677", "0x1deb6bb7", "0x326d8c6c", "0x1316f905",
].map(h => h + "0".repeat(64 - (h.length - 2)));

const provider = new ethers.JsonRpcProvider(RPC, 196);
const c = new ethers.Contract(SYNTHEKE, abi.default ?? abi, provider);

for (const id of IDS) {
  try {
    const st = await c.getPactState(id);
    console.log(id.slice(0, 10), "amount(eth):", ethers.formatEther(st.terms.amount), "asset:", st.terms.settlementAsset.slice(0, 10), "state:", st.state.toString());
  } catch (e) {
    console.log(id.slice(0, 10), "ERR", e.message.slice(0, 80));
  }
}
