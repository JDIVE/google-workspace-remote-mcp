# Changelog

## [1.0.0] - 2025-05-23

### Added
- Initial implementation of Google Workspace MCP Server
- Complete TypeScript codebase with Cloudflare Workers runtime
- MCP server implementation with SSE transport
- OAuth 2.0 authentication flow with CSRF protection
- Token encryption and secure storage in KV
- JWT validation for API authentication
- Rate limiting (100 requests/minute per user)
- Structured logging with circular reference handling
- 28 Google Workspace tools implemented:
  - Gmail: 8 tools (search, send, labels, drafts, etc.)
  - Calendar: 6 tools (events, create, update, delete, etc.)
  - Drive: 8 tools (list, upload, download, share, etc.)
  - Contacts: 6 tools (list, search, create, update, etc.)
- Complete error handling with Google API error mapping
- Comprehensive tool parameter validation
- Key rotation support with automatic re-encryption
- Unit test setup with Vitest
- Sample configuration files
- Comprehensive documentation

### Security
- Implemented JWT validation with HMAC-SHA256
- Added CSRF protection using state tokens
- Encrypted token storage with AES-256-GCM
- Rate limiting to prevent abuse
- Security headers (HSTS, CSP, etc.)

### Documentation
- Complete implementation plan
- OAuth setup guide
- Deployment guide with KV namespace setup
- API design with all tool definitions
- Security policy and best practices
- Testing plan
- Sample configuration files