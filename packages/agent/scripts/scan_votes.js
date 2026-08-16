import { ethers } from "ethers";
import fs from "node:fs";

const p = new ethers.JsonRpcProvider("https://rpc.xlayer.tech", 196);
const abi = ["function getVotes(bytes32) view returns ((address mediator, string verdict, uint256 fairnessScore, bytes32 reasonHash, bool revealed)[])"];
const c = new ethers.Contract("0xf0CD343caFDdD4148B3F2240d14E47287b8Fc56c", abi, p);
const ids = JSON.parse(fs.readFileSync(new URL("../_pact_ids.json", import.meta.url), "utf8"));

for (const id of ids) {
  try {
    const votes = await c.getVotes(id);
    if (votes.length > 0) {
      console.log(id.slice(0, 10), votes.map(v => v.verdict + ":" + Number(v.fairnessScore)).join(" | "));
    }
  } catch { /* no votes */ }
}
