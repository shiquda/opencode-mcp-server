# Publishing to npm

This guide explains how to publish the OpenCode MCP Server to npm.

## Prerequisites

1. **npm account**: Create one at https://www.npmjs.com/signup
2. **Login to npm CLI**:
   ```bash
   npm login
   ```

## Publishing Steps

### 1. Update Version (if needed)

```bash
# For patch updates (bug fixes)
npm version patch

# For minor updates (new features)
npm version minor

# For major updates (breaking changes)
npm version major
```

### 2. Build the Project

```bash
npm run build
```

### 3. Test Locally

```bash
# Test the CLI works
node dist/index.js --help

# Test with npx
npx .
```

### 4. Check Package Contents

```bash
# See what will be published
npm pack --dry-run
```

### 5. Publish to npm

```bash
# Publish (for public packages)
npm publish --access public
```

### 6. Verify Publication

```bash
# Check the package page
open https://www.npmjs.com/package/opencode-mcp-server

# Test installation
npm install -g opencode-mcp-server
```

## Using the Published Package

After publishing, users can install and use it in two ways:

### Option 1: Global Installation

```bash
npm install -g opencode-mcp-server
opencode-mcp-server
```

### Option 2: npx (No Installation)

```bash
npx -y opencode-mcp-server
```

### Option 3: OpenClaw Configuration

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

## Updating the Package

1. Make your changes
2. Update version: `npm version patch|minor|major`
3. Build: `npm run build`
4. Publish: `npm publish`

## Troubleshooting

- **403 Forbidden**: Check if you're logged in: `npm whoami`
- **Package name taken**: Check availability: `npm search opencode-mcp-server`
- **Build errors**: Ensure TypeScript compiles: `npm run build`

## Useful Commands

```bash
# Unpublish a version (within 72 hours)
npm unpublish opencode-mcp-server@0.1.0

# Deprecate a version
npm deprecate opencode-mcp-server@0.1.0 "Use version 0.2.0 instead"

# View package info
npm view opencode-mcp-server
```
