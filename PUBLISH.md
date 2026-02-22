# Publishing to npm

This guide explains how to publish the OpenCode MCP Server to npm.

## 📋 Prerequisites

1. **npm account**: Create one at https://www.npmjs.com/signup
2. **Login to npm CLI**:
   ```bash
   npm login
   ```
3. **Verify package name is available**:
   ```bash
   npm search opencode-mcp-server
   ```

## 🚀 Publishing Steps

### 1. Update Version

Update the version in `package.json` following [Semantic Versioning](https://semver.org/):

```bash
# For patch updates (bug fixes)
npm version patch

# For minor updates (new features, backward compatible)
npm version minor

# For major updates (breaking changes)
npm version major
```

Or manually edit `package.json`:
```json
{
  "version": "0.1.0"
}
```

### 2. Build Project

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

# For scoped packages (@username/package-name)
npm publish --access public
```

### 6. Verify Publication

```bash
# Check the package page
open https://www.npmjs.com/package/opencode-mcp-server

# Test installation
npm install -g opencode-mcp-server
```

## 🔄 Updating the Package

1. Make your changes
2. Update version: `npm version patch|minor|major`
3. Build: `npm run build`
4. Publish: `npm publish`

## 🏷️ Tagging Releases

After publishing to npm, tag the release on GitHub:

```bash
# Push tags
git push origin --tags

# Or create release via GitHub CLI
gh release create v0.1.0 --title "v0.1.0" --notes "Release notes"
```

## 📦 Package Contents

The following files are included in the npm package (as defined in `package.json` `files` field):

- `dist/` - Compiled JavaScript files
- `README.md` - Documentation
- `LICENSE` - MIT License
- `CHANGELOG.md` - Version history

## ⚠️ Important Notes

- **Never commit `.env` files** - they contain sensitive data
- **Always build before publishing** - the `prepare` script should handle this
- **Test locally first** - use `npm pack` and `npm link` to test
- **Update CHANGELOG.md** - document what changed in each version

## 🔗 Useful Commands

```bash
# Unpublish a version (within 72 hours)
npm unpublish opencode-mcp-server@0.1.0

# Deprecate a version
npm deprecate opencode-mcp-server@0.1.0 "Use version 0.2.0 instead"

# View package info
npm view opencode-mcp-server

# Check who owns the package
npm owner ls opencode-mcp-server
```

## 📚 References

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [package.json Documentation](https://docs.npmjs.com/cli/v10/configuring-npm/package-json)
