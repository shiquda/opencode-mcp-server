# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-22

### Added
- Initial release with full OpenCode API support
- Support for `opencode_chat` - send programming tasks
- Support for `opencode_create_session` - create new sessions
- Support for `opencode_list_sessions` - list all sessions
- Support for `opencode_get_session` - get session details
- Support for `opencode_get_messages` - get session messages
- Support for `opencode_check_health` - health check
- Dual transport mode: Stdio and SSE
- Multiple authentication methods: Bearer, Basic, None
- Per-request configuration override
- TypeScript implementation with full type safety

### Features
- Environment variable configuration with `.env` file support
- Runtime parameter override for each tool call
- Custom URL support for multi-server management
- Comprehensive error handling and reporting
- English-only codebase for international accessibility
