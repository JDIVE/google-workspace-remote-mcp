# Google Workspace Remote MCP Server

A Cloudflare Worker-based MCP (Model Context Protocol) server providing secure remote access to Google Workspace APIs including Gmail, Calendar, Drive, and Contacts.

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
- **Contacts**: Read and manage contact information

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
│   │   └── tokens.ts         # Token management
│   ├── tools/
│   │   ├── gmail.ts          # Gmail tool implementations
│   │   ├── calendar.ts       # Calendar tool implementations
│   │   ├── drive.ts          # Drive tool implementations
│   │   └── contacts.ts       # Contacts tool implementations
│   └── utils/
│       ├── errors.ts         # Error handling utilities
│       ├── validation.ts     # Input validation
│       └── rate-limit.ts     # Rate limiting logic
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── fixtures/             # Test fixtures
├── wrangler.toml             # Cloudflare configuration
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
3. Configure Google OAuth credentials
4. Set up Cloudflare KV namespace
5. Deploy with Wrangler: `wrangler deploy`
6. Configure MCP client to connect via SSE

## Documentation

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Step-by-step build guide
- [Technical Requirements](./TECHNICAL_REQUIREMENTS.md) - Dependencies and specifications
- [OAuth Setup](./OAUTH_SETUP.md) - Authentication configuration
- [API Design](./API_DESIGN.md) - Tool definitions and interfaces
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Cloudflare deployment instructions
- [Testing Plan](./TESTING_PLAN.md) - Testing strategies and examples

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

## Contributing

This is a private project for Jamie's assistant configuration. For similar implementations, reference the patterns and adapt to your needs.

## License

Private - Not for redistribution

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Google Workspace API Documentation](https://developers.google.com/workspace)