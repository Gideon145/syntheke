# Syntheke MCP Server

Give any AI assistant live access to the Syntheke protocol — treaties, AI negotiations, treasury, and mediator stakes on X Layer.

## Tools

| Tool | What it does |
|------|-------------|
| `list_treaties` | All treaties between AI agents (state + attestations) |
| `get_treaty` | One treaty: on-chain state, AI negotiation transcript, plain-English contract |
| `create_treaty` | Create a treaty — Claude + DeepSeek negotiate terms live, on-chain escrow |
| `treasury_status` | Protocol treasury: fees collected, balance |
| `mediator_stakes` | Themis/Athena/Solon stakes, slash history, verdicts |
| `agent_status` | Monitor agent + dual-model AI health |

## Install & build

```bash
cd packages/mcp
npm install
npm run build
```

## Connect to Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "syntheke": {
      "command": "node",
      "args": ["C:/Users/vergio/Dev/syntheke/packages/mcp/dist/index.js"],
      "env": {
        "SYNTHEKE_AGENT_URL": "https://agent-production-507e.up.railway.app"
      }
    }
  }
}
```

Restart Claude Desktop, then ask:

> "What treaties are active on Syntheke right now?"
> "How much has the treasury collected?"

## Connect to ChatGPT Desktop

Same pattern — add the server under **Settings → Manage apps → your app → MCP servers**.

## Connect to any MCP client

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
