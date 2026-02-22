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
- Notion API key (optional, for project management features)

## 🛠️ Installation

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
# OpenCode server URL
OPENCODE_URL=http://localhost:8848

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

Edit `~/.openclaw/mcp.json`:

```json
{
  "mcpServers": {
    "opencode-remote": {
      "command": "node",
      "args": ["/path/to/opencode-mcp-server/dist/index.js", "stdio"],
      "env": {
        "OPENCODE_URL": "http://100.72.207.100:8848",
        "OPENCODE_USERNAME": "opencode",
        "OPENCODE_PASSWORD": "your-password",
        "OPENCODE_AUTH_TYPE": "basic"
      }
    }
  }
}
```

### Claude Desktop

Edit Claude Desktop configuration:

```json
{
  "mcpServers": {
    "opencode-remote": {
      "command": "node",
      "args": ["/path/to/opencode-mcp-server/dist/index.js", "stdio"],
      "env": {
        "OPENCODE_URL": "http://100.72.207.100:8848",
        "OPENCODE_USERNAME": "opencode",
        "OPENCODE_PASSWORD": "your-password",
        "OPENCODE_AUTH_TYPE": "basic"
      }
    }
  }
}
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

### Example 1: Using Default Configuration

Simply ask in OpenClaw/Claude:

> "Help me create a login function"

AI will automatically call `opencode_chat` using settings from `.env`.

### Example 2: Connect to Different OpenCode Server

> "Using http://192.168.1.50:8848, write me a web scraper"

AI will pass custom URL:
```json
{
  "message": "Write me a web scraper",
  "url": "http://192.168.1.50:8848"
}
```

### Example 3: Using Username/Password Authentication

> "Use basic auth with admin/123456, check server status"

```json
{
  "auth_type": "basic",
  "username": "admin",
  "password": "123456"
}
```

### Example 4: Multi-Server Management

> "List all sessions from server A, then create a new session on server B"

First call:
```json
{
  "name": "opencode_list_sessions",
  "arguments": {
    "url": "http://server-a:8848"
  }
}
```

Second call:
```json
{
  "name": "opencode_create_session",
  "arguments": {
    "url": "http://server-b:8848"
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
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "version": "2.0.0",
  "defaultEndpoint": "http://100.72.207.100:8848",
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

## 🙏 Acknowledgments

- Built with [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Inspired by the need to bridge OpenClaw and OpenCode workflows
