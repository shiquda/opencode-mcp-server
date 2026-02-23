# AGENT_SETUP

This guide is for agent-oriented MCP clients (OpenClaw and similar tools).

## Goal

Set up `opencode-mcp-server` so the agent can connect to OpenCode over MCP.

## Prerequisites

- Node.js 18+
- OpenCode running in server mode (`opencode serve`)

## Install (one line)

```bash
npx -y opencode-mcp-server
```

Important: this command installs/runs the MCP server only. It does NOT auto-write your MCP client config.
Agent should follow the full config examples below and write the corresponding client config file.

## OpenClaw Setup

OpenClaw's canonical config file is `~/.openclaw/openclaw.json` (JSON5),
but MCP server entries are managed by `mcporter` (separate config), not by `openclaw.json`.

Version note:

- Current stable docs/workflows: use `mcporter` config for MCP servers.
- Native `mcp.servers` inside `openclaw.json` has appeared in an unmerged/experimental upstream PR flow and is not a stable baseline yet.

Use/create `mcporter` config and add this.
For reproducibility, prefer an explicit config path:

- Recommended explicit path: `~/.openclaw/config/mcporter.json`
- Some older setups may still use: `~/.clawdbot/config/mcporter.json`
- If your environment already binds `mcporter` to another config path, keep that existing path.

```bash
mkdir -p ~/.openclaw/config
```

```json
{
  "mcpServers": {
    "opencode-remote": {
      "command": "npx",
      "args": ["-y", "opencode-mcp-server"],
      "env": {
        "OPENCODE_URL": "http://127.0.0.1:4096",
        "OPENCODE_USERNAME": "opencode",
        "OPENCODE_PASSWORD": "your-password",
        "OPENCODE_AUTH_TYPE": "basic"
      }
    }
  }
}
```

Important:

- Do NOT put `mcpServers` under `~/.openclaw/openclaw.json`.
- `openclaw.json` is for OpenClaw runtime/channel/model settings.
- `mcporter.json` is for MCP server definitions (`command` / `args` / `env`).

Only change `OPENCODE_URL` for different environments:

- Local: `http://127.0.0.1:4096`
- Tailscale: `http://100.x.x.x:4096`
- Tunnel (ngrok/frp): `https://<your-domain-or-tunnel>`

## Generic MCP Client Setup (template)

If your client supports command-based MCP servers, use this template:

```json
{
  "mcpServers": {
    "opencode-remote": {
      "command": "npx",
      "args": ["-y", "opencode-mcp-server"],
      "env": {
        "OPENCODE_URL": "http://127.0.0.1:4096",
        "OPENCODE_AUTH_TYPE": "basic",
        "OPENCODE_USERNAME": "opencode",
        "OPENCODE_PASSWORD": "your-password"
      }
    }
  }
}
```

## Auth Modes

### Basic Auth (default for `opencode serve`)

```env
OPENCODE_AUTH_TYPE=basic
OPENCODE_USERNAME=opencode
OPENCODE_PASSWORD=your-password
```

### Bearer Token

```env
OPENCODE_AUTH_TYPE=bearer
OPENCODE_TOKEN=your-token-here
```

### No Auth

```env
OPENCODE_AUTH_TYPE=none
```

## Optional: `.env` Defaults

Use `.env` when you want defaults without repeating `env` in every client config:

```env
OPENCODE_URL=http://127.0.0.1:4096
OPENCODE_AUTH_TYPE=basic
OPENCODE_USERNAME=opencode
OPENCODE_PASSWORD=your-password
PORT=3000
```

## Remote Access Options

### Tailscale (recommended)

```bash
tailscale ip -4
```

Set `OPENCODE_URL=http://100.x.x.x:4096`.

### ngrok

```bash
ngrok http 4096
```

Set `OPENCODE_URL=https://xxxx.ngrok-free.app`.

### frp

Expose OpenCode with your own `frpc` + VPS config, then point `OPENCODE_URL` to that public endpoint.

## Quick Verification

After setup, call `opencode_check_health` from your MCP client.
If health check passes, the connection is ready.

Optional local sanity checks:

```bash
npx -y opencode-mcp-server
```

And in OpenClaw, verify your runtime config remains in:

- `~/.openclaw/openclaw.json`
- MCP entries in `~/.openclaw/config/mcporter.json`
