# OpenCode MCP Server

[![npm version](https://img.shields.io/npm/v/opencode-mcp-server?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/opencode-mcp-server)
[![node >=18](https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![license MIT](https://img.shields.io/badge/license-MIT-0f766e?style=for-the-badge)](./LICENSE)
[![OpenCode](https://img.shields.io/badge/OpenCode-Compatible-111111?style=for-the-badge)](https://opencode.ai)

MCP bridge for connecting OpenCode to MCP-compatible clients.

## Quick Start

```bash
npx -y opencode-mcp-server
```

## For Human Readers

- Basic usage and architecture are intentionally kept minimal in this README.
- Agent-specific setup (OpenClaw and similar MCP clients) lives in `AGENT_SETUP.md`.

## Core Differentiators

### 1) Architecture: Local CLI Wrapper vs HTTP API Bridge

- Common approach: `MCP -> local CLI -> local OpenCode`
- This project: `MCP -> HTTP API -> OpenCode anywhere` (local / remote / Tailscale / ngrok)

### 2) Real Remote Workflow Support

Scenario: OpenClaw on a VPS, OpenCode on a laptop.

| Approach | Implementation | Complexity |
| --- | --- | --- |
| Traditional local CLI binding | Usually cannot call a machine-local CLI across hosts directly | High / not practical |
| This project | `npx opencode-mcp-server` + remote `OPENCODE_URL` (for example, a Tailscale IP) | Simple |

### 3) Flexible Configuration with Per-Call Overrides

- Defaults come from environment variables, but each tool call can override `url` / `auth_type` / credentials.
- This allows one MCP client to switch between different OpenCode servers per request:

```json
{"url": "http://server-a:4096"}
{"url": "http://server-b:4096"}
```

### 4) Extra Capabilities (Beyond Plain Proxying)

- Health check: `opencode_check_health`
- Message history: `opencode_get_messages`
- Session filtering: `include_subagents` in `opencode_list_sessions`
- Multiple auth modes: `basic` / `bearer` / `none`

## Let Agent Do The Setup

```text
I want to setup a connection to opencode via mcp.
Check https://raw.githubusercontent.com/shiquda/opencode-mcp-server/main/AGENT_SETUP.md for full guide.
```

## Links

- OpenCode: https://opencode.ai
- MCP: https://modelcontextprotocol.io
