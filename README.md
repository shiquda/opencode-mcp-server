# OpenCode MCP Server

A Model Context Protocol (MCP) server that enables remote interaction with [OpenCode](https://opencode.ai) via HTTP API. This allows MCP clients like OpenClaw, Claude Desktop, or any MCP-compatible tool to control OpenCode agents remotely.

## 🚀 Features

- **🔧 Flexible Configuration**: Environment variable defaults with per-request overrides
- **🔐 Multiple Authentication**: Bearer Token, Basic Auth (username/password), or no auth
- **🌐 Custom URL Support**: Each tool call can target different OpenCode servers
- **📡 Dual Mode**: Stdio (local) / SSE (remote) transports
- **🏥 Health Check**: Built-in connectivity testing

## 📋 Prerequisites

- Node.js 18+
- OpenCode running in server mode (`opencode serve`)

## 🛠️ Installation

### Quick Start (One-line setup)

```bash
npx -y opencode-mcp-server
```

### OpenClaw Configuration

Add to `~/.openclaw/config/mcporter.json`:

**Local OpenCode:**
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

**Remote via Tailscale:**
```json
{
  "mcpServers": {
    "opencode-remote": {
      "command": "npx",
      "args": ["-y", "opencode-mcp-server"],
      "env": {
        "OPENCODE_URL": "http://100.x.x.x:4096",
        "OPENCODE_USERNAME": "opencode",
        "OPENCODE_PASSWORD": "your-password",
        "OPENCODE_AUTH_TYPE": "basic"
      }
    }
  }
}
```

### Global Installation (Optional)

```bash
npm install -g opencode-mcp-server
opencode-mcp-server
```

### Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/opencode-mcp-server.git
cd opencode-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## ⚙️ Configuration

Create a `.env` file:

```env
# OpenCode server URL (default: local)
OPENCODE_URL=http://127.0.0.1:4096

# Authentication type: basic | bearer | none
OPENCODE_AUTH_TYPE=basic

# For Basic Auth (default for opencode serve)
OPENCODE_USERNAME=opencode
OPENCODE_PASSWORD=your-password

# For Bearer Token Auth (if configured)
# OPENCODE_AUTH_TYPE=bearer
# OPENCODE_TOKEN=your-token-here

# MCP Server port (for SSE mode)
PORT=3000
```

## 🌐 Remote Access Setup

To access your OpenCode server remotely, you can use one of these methods:

### Method 1: Tailscale (Recommended)

[Tailscale](https://tailscale.com) creates a secure mesh network between your devices.

```bash
# Install Tailscale on both machines
curl -fsSL https://tailscale.com/install.sh | sh

# Start Tailscale
sudo tailscale up

# Get your Tailscale IP
tailscale ip -4
# Example: 100.x.x.x
```

Then configure with Tailscale IP:
```env
OPENCODE_URL=http://100.x.x.x:4096
```

### Method 2: ngrok

[ngrok](https://ngrok.com) exposes local servers to the internet.

```bash
# Install ngrok
# https://ngrok.com/download

# Expose your OpenCode server
ngrok http 4096

# Use the provided https URL
OPENCODE_URL=https://xxxx.ngrok-free.app
```

### Method 3: frp

[frp](https://github.com/fatedier/frp) is a fast reverse proxy for NAT traversal.

```bash
# Run frpc on your local machine (where OpenCode runs)
./frpc -c frpc.ini

# Use your VPS IP in configuration
OPENCODE_URL=http://your-vps-ip:4096
```

## 🏃 Usage

### Stdio Mode (for Claude Desktop, local clients)

```bash
npm start
# or
node dist/index.js stdio
```

### SSE Mode (for OpenClaw, remote clients)

```bash
node dist/index.js sse
```

Server will start at `http://localhost:3000`.

## 🔌 MCP Configuration

### OpenClaw

OpenClaw uses `~/.openclaw/config/mcporter.json` for MCP server configuration.

**Configuration format:**
```json
{
  "mcpServers": {
    "opencode-remote": {
      "command": "node",
      "args": ["/home/USERNAME/.openclaw/mcp-servers/opencode-mcp-server/dist/index.js", "stdio"],
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

**Security Best Practices:**
- Use absolute paths in `args` (avoid `$HOME` or `~`)
- Store sensitive credentials in environment variables
- Use `127.0.0.1` for local servers, Tailscale IP for remote
- Never commit passwords to version control

### Remote Server Example (using Tailscale)

```json
{
  "mcpServers": {
    "opencode-remote": {
      "command": "node",
      "args": ["/home/USERNAME/.openclaw/mcp-servers/opencode-mcp-server/dist/index.js", "stdio"],
      "env": {
        "OPENCODE_URL": "http://100.72.207.100:4096",
        "OPENCODE_USERNAME": "opencode",
        "OPENCODE_PASSWORD": "your-password",
        "OPENCODE_AUTH_TYPE": "basic"
      }
    }
  }
}
```
```

## 🛠️ Available Tools

### 1. `opencode_chat`

Send a programming task to OpenCode Agent. Automatically creates a new session if no `session_id` is provided.

**Parameters:**
- `message` (required): Task description
- `session_id` (optional): Session ID for context continuity
- `directory` (optional): Working directory
- `url`, `username`, `password`, `auth_type` (optional): Override default connection settings

**Example:**
```json
{
  "name": "opencode_chat",
  "arguments": {
    "message": "Write a Python script to scrape web page titles"
  }
}
```

### 2. `opencode_create_session`

Create a new OpenCode session.

**Parameters:**
- `title` (optional): Session title
- `directory` (optional): Working directory
- `url`, `username`, `password`, `auth_type` (optional): Connection settings

### 3. `opencode_list_sessions`

List all OpenCode sessions.

**Parameters:**
- `directory` (optional): Filter by directory
- `limit` (optional): Maximum results
- Connection settings (optional)

### 4. `opencode_get_session`

Get detailed information about a specific session.

**Parameters:**
- `session_id` (required): Session ID
- Connection settings (optional)

### 5. `opencode_get_messages`

Get message list from a session.

**Parameters:**
- `session_id` (required): Session ID
- `limit` (optional): Maximum messages
- Connection settings (optional)

### 6. `opencode_check_health`

Check OpenCode server connectivity.

**Parameters:**
- `url` (optional): Server URL to check
- Other auth parameters (optional)

## 💡 Usage Examples

### Example 1: Local Development (127.0.0.1)

For local development with OpenCode running on the same machine:

```json
{
  "name": "opencode_chat",
  "arguments": {
    "message": "Help me create a login function",
    "url": "http://127.0.0.1:4096"
  }
}
```

### Example 2: Connect via Tailscale

When your OpenCode server is on another machine in your Tailscale network:

```json
{
  "name": "opencode_chat",
  "arguments": {
    "message": "Write me a web scraper",
    "url": "http://100.72.207.100:4096"
  }
}
```

### Example 3: Using Username/Password Authentication

```json
{
  "auth_type": "basic",
  "username": "opencode",
  "password": "your-password"
}
```

### Example 4: Multi-Server Management

Manage multiple OpenCode instances across different machines:

```json
{
  "name": "opencode_list_sessions",
  "arguments": {
    "url": "http://100.72.207.100:4096"
  }
}
```

## 🔐 Authentication Details

### Bearer Token (Recommended for token-based auth)

```env
OPENCODE_AUTH_TYPE=bearer
OPENCODE_TOKEN=your-token-here
```

Request header:
```
Authorization: Bearer your-token-here
```

### Basic Auth (Default for `opencode serve`)

```env
OPENCODE_AUTH_TYPE=basic
OPENCODE_USERNAME=opencode
OPENCODE_PASSWORD=secret123
```

Request header:
```
Authorization: Basic b3BlbmNvZGU6c2VjcmV0MTIz
```

### No Authentication

```env
OPENCODE_AUTH_TYPE=none
```

No auth header sent.

## 🏥 Health Check

After starting the MCP Server, you can check:

```bash
curl http://127.0.0.1:3000/health
```

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "defaultEndpoint": "http://127.0.0.1:4096",
  "authType": "basic"
}
```

## 🔧 Advanced Configuration

### Command Line Arguments

```bash
# Stdio mode (default)
node dist/index.js

# SSE mode
node dist/index.js sse

# View help
node dist/index.js --help
```

### Environment Variable Priority

1. Tool call parameters (highest priority)
2. Environment variables (`.env` file)
3. Built-in defaults (lowest priority)

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🔗 Links

- [OpenCode](https://opencode.ai)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)
- [Tailscale](https://tailscale.com) - Secure networking
- [ngrok](https://ngrok.com) - Tunneling
- [frp](https://github.com/fatedier/frp) - Fast reverse proxy

## 🙏 Acknowledgments

- Built with [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Inspired by the need to bridge OpenClaw and OpenCode workflows
