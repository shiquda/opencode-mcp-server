# Contributing to OpenCode MCP Server

Thank you for your interest in contributing to OpenCode MCP Server! We welcome contributions from the community.

## 🚀 Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/opencode-mcp-server.git`
3. Install dependencies: `npm install`
4. Build the project: `npm run build`

## 📝 Guidelines

### Reporting Issues

- Use the GitHub issue tracker
- Describe the bug or feature request clearly
- Include steps to reproduce (for bugs)
- Mention your environment (OS, Node version, etc.)

### Pull Requests

1. Create a new branch for your feature/fix
2. Make your changes
3. Test thoroughly
4. Update documentation if needed
5. Submit a pull request with a clear description

### Code Style

- Follow TypeScript best practices
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small

## 🔧 Development

### Running Locally

```bash
# Stdio mode
npm start

# SSE mode
node dist/index.js sse
```

### Testing

Currently, manual testing is done via:
- Direct MCP client integration (OpenClaw, Claude Desktop)
- curl commands for API endpoints

### Environment Setup

Create a `.env` file:
```env
OPENCODE_URL=http://localhost:8848
OPENCODE_AUTH_TYPE=basic
OPENCODE_USERNAME=opencode
OPENCODE_PASSWORD=your-password
```

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Thank You!

Every contribution helps make OpenCode MCP Server better for everyone!
