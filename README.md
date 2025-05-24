# Google Workspace Remote MCP Server

A Cloudflare Worker-based MCP (Model Context Protocol) server providing secure remote access to Google Workspace APIs including Gmail, Calendar, Drive, and People.

## Overview

This project implements a remote MCP server deployed on Cloudflare Workers that bridges AI assistants with Google Workspace services. It handles OAuth authentication, token management, and provides a standardized interface for workspace operations.

## Architecture

```
┌─────────────────┐     SSE Transport      ┌──────────────────────┐
│   MCP Client    │◄───────────────────────►│  Cloudflare Worker   │
│  (AI Assistant) │                         │   (MCP Server)       │
└─────────────────┘                         └──────────┬───────────┘
                                                       │
                                            ┌──────────▼───────────┐
                                            │   Cloudflare KV     │
                                            │  (OAuth Tokens)     │
                                            └──────────┬───────────┘
                                                       │
                                            ┌──────────▼───────────┐
                                            │  Google Workspace   │
                                            │       APIs          │
                                            └────────────────────┘
```

## Key Components

### 1. MCP Server Layer
- Implements the Model Context Protocol specification
- Handles tool registration and execution
- Manages SSE (Server-Sent Events) transport
- Provides standardized error handling

### 2. OAuth Management
- Secure OAuth 2.0 flow implementation
- Token storage in Cloudflare KV
- Automatic token refresh
- Multi-account support

### 3. Google Workspace Integration
- **Gmail**: Read, send, search emails; manage labels and drafts
- **Calendar**: Create, read, update events; manage attendees
- **Drive**: Upload, download, search files; manage permissions
- **People**: Read and manage contact information

### 4. Security Features
- Encrypted token storage
- Scope-based permissions
- Request validation
- Rate limiting
- CORS configuration

## Project Structure

```
google-workspace-remote-mcp/
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── mcp/
│   │   ├── server.ts         # MCP server implementation
│   │   ├── transport.ts      # SSE transport handler
│   │   └── types.ts          # TypeScript definitions
│   ├── auth/
│   │   ├── oauth.ts          # OAuth flow implementation
│   │   ├── storage.ts        # KV storage interface
│   │   ├── tokens.ts         # Token management
│   │   └── state.ts          # CSRF state management
│   ├── tools/
│   │   ├── gmail.ts          # Gmail tool definitions
│   │   ├── calendar.ts       # Calendar tool definitions
│   │   ├── drive.ts          # Drive tool definitions
│   │   ├── contacts.ts       # Contacts tool definitions
│   │   └── handlers/         # Tool implementation handlers
│   │       ├── index.ts      # Handler routing
│   │       ├── gmail.ts      # Gmail implementation
│   │       ├── calendar.ts   # Calendar implementation
│   │       ├── drive.ts      # Drive implementation
│   │       └── contacts.ts   # Contacts implementation
│   └── utils/
│       ├── errors.ts         # Error handling utilities
│       ├── validation.ts     # JWT validation
│       ├── rate-limit.ts     # Rate limiting logic
│       ├── logger.ts         # Structured logging
│       └── encryption.ts     # Token encryption
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── fixtures/             # Test fixtures
├── wrangler.toml             # Cloudflare configuration
├── wrangler.toml.example     # Sample Cloudflare configuration
├── .dev.vars.example         # Sample environment variables
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript configuration
└── vitest.config.ts          # Test configuration
```

## Technology Stack

- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **Storage**: Cloudflare KV
- **Transport**: Server-Sent Events (SSE)
- **APIs**: Google Workspace APIs v3
- **Testing**: Vitest with vitest-evals
- **Build**: Wrangler CLI

## Quick Start

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy the example configuration files:
   ```bash
   cp wrangler.toml.example wrangler.toml
   cp .dev.vars.example .dev.vars
   ```
4. Configure Google OAuth credentials
5. Set up Cloudflare KV namespace
6. Deploy with Wrangler: `wrangler deploy`
7. Configure MCP client to connect via SSE

## Documentation

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Step-by-step build guide
- [Technical Requirements](./TECHNICAL_REQUIREMENTS.md) - Dependencies and specifications
- [OAuth Setup](./OAUTH_SETUP.md) - Authentication configuration
- [API Design](./API_DESIGN.md) - Tool definitions and interfaces
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Cloudflare deployment instructions
- [Testing Plan](./TESTING_PLAN.md) - Testing strategies and examples
- [Error Handling Guide](./ERROR_HANDLING.md) - Dealing with API failures and notifying users

## Security Considerations

- All OAuth tokens are encrypted at rest
- API keys are stored as Worker secrets
- Request validation prevents unauthorized access
- Rate limiting protects against abuse
- Minimal data retention policy

## Performance Optimizations

- Edge caching for frequently accessed data
- Batch API requests where possible
- Efficient token refresh strategies
- Connection pooling for SSE streams
- Lazy loading of tool implementations

## Cloudflare Workers Compatibility

This project is built for Cloudflare Workers with the following considerations:

### Node.js Compatibility
- Uses `compatibility_date = "2024-09-23"` and `nodejs_compat` flag for Node.js API support
- The `googleapis` package works via Wrangler's automatic polyfills
- No native Node.js modules or file system access required

### Runtime Considerations
- All cryptographic operations use the Web Crypto API
- Buffer operations are polyfilled automatically by Wrangler
- Network requests use the Fetch API
- No long-running processes or WebSocket connections

### Deployment Notes
- Ensure your `wrangler.toml` includes the `nodejs_compat` compatibility flag
- The worker bundle size is optimized through tree-shaking
- KV storage is used for all persistent data (tokens, rate limits)
- Environment variables and secrets are properly configured

If you encounter compatibility issues during deployment:
1. Check that `compatibility_date` is set to a recent date
2. Verify the `nodejs_compat` flag is enabled
3. Review the Wrangler build output for any bundling warnings
4. Test thoroughly in the Cloudflare Workers environment

## Contributing

This is a private project for Jamie's assistant configuration. For similar implementations, reference the patterns and adapt to your needs.

## License

Private - Not for redistribution

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Google Workspace API Documentation](https://developers.google.com/workspace)
