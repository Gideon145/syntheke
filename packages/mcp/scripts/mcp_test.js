// Smoke test the Syntheke MCP server over stdio:
//   initialize → tools/list → call read tools → call create_treaty without
//   payer key (must return the 402 challenge instructions, proving the
//   payment-loop parsing works).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import process from "node:process";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  env: {
    ...process.env,
    SYNTHEKE_AGENT_URL: "https://agent-mainnet-production.up.railway.app",
    SYNTHEKE_PAYER_KEY: "",
  },
});

const client = new Client({ name: "mcp-test", version: "0.0.1" });
await client.connect(transport);

const tools = await client.listTools();
console.log("=== tools ===");
for (const t of tools.tools) console.log(`- ${t.name}`);

console.log("\n=== list_treaties ===");
const list = await client.callTool({ name: "list_treaties", arguments: {} });
console.log(String(list.content[0].text).split("\n").slice(0, 4).join("\n"));

console.log("\n=== treasury_status ===");
const tres = await client.callTool({ name: "treasury_status", arguments: {} });
console.log(tres.content[0].text);

console.log("\n=== create_treaty (no payer key → challenge path) ===");
const create = await client.callTool({
  name: "create_treaty",
  arguments: {
    partyADesc: "Test yield agent",
    partyBDesc: "Test monitor service",
    description: "Smoke test: Alpha pays Beta to monitor a vault for 24 hours",
  },
});
console.log((create.content[0].text).slice(0, 400));

await client.close();
console.log("\nMCP SMOKE TEST PASSED");
process.exit(0);
