# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

```bash
# Development
npm run dev                    # Start local Cloudflare Worker dev server
npm run typecheck              # TypeScript type checking
npm run lint                   # Run ESLint
npm run format                 # Format code with Prettier

# Testing
npm test                       # Run all tests
npm test -- --watch           # Run tests in watch mode
npm test -- src/utils/logger.test.ts  # Run specific test file
npm run test:coverage         # Generate coverage report
npm run test:ui               # Open Vitest UI

# Deployment
npm run build                 # Build for production (if needed)
wrangler deploy               # Deploy to Cloudflare Workers
wrangler deploy --env preview # Deploy to preview environment
wrangler tail                 # Stream production logs
```

## Architecture Overview

This is a Cloudflare Worker-based MCP (Model Context Protocol) server that provides secure access to Google Workspace APIs. The architecture follows a modular design with clear separation of concerns.

### Request Flow

1. **Entry Point** (`src/index.ts`): All requests enter through the Worker fetch handler
   - Applies CORS and security headers
   - Routes to OAuth endpoints (`/oauth/authorize`, `/oauth/callback`)
   - Routes to MCP endpoint (`/mcp`) for SSE communication
   - Validates JWT tokens for API access

2. **Authentication Flow**:
   - OAuth initiation creates CSRF state token in KV
   - User is redirected to Google OAuth consent
   - Callback exchanges code for tokens
   - Tokens are encrypted and stored in `OAUTH_TOKENS` KV namespace
   - JWT validation required for all MCP requests

3. **MCP Protocol** (`src/mcp/server.ts`):
   - Implements Server-Sent Events (SSE) transport
   - Handles `initialize`, `tools/list`, and `tools/call` methods
   - Validates tool parameters against schemas
   - Routes tool calls to appropriate handlers

4. **Tool Execution**:
   - Tools are prefixed by service (gmail_, calendar_, drive_, contacts_)
   - Router (`src/tools/handlers/index.ts`) directs to service handlers
   - Each handler creates authenticated Google API client
   - Results are transformed and returned via SSE

### Key Components

**Token Management** (`src/auth/tokens.ts`):
- Automatic refresh of expired access tokens
- Creates authenticated Google API clients for handlers
- Handles token encryption/decryption

**Rate Limiting** (`src/utils/rate-limit.ts`):
- 100 requests/minute per user
- Uses KV with 1-minute TTL for tracking

**Encryption** (`src/utils/encryption.ts`):
- AES-256-GCM encryption for tokens
- Supports key rotation with dual-key decryption
- Automatic re-encryption on old key detection

**Error Handling**:
- Google API errors mapped to MCP error codes
- Structured logging with request IDs
- Graceful handling of token expiration

### KV Namespaces

- `OAUTH_TOKENS`: Encrypted user tokens (90-day TTL)
- `OAUTH_STATE`: CSRF state tokens (5-minute TTL)
- `RATE_LIMITS`: Request counting (1-minute TTL)

### Environment Variables

Required secrets:
- `GOOGLE_CLIENT_ID`: OAuth client ID
- `GOOGLE_CLIENT_SECRET`: OAuth client secret
- `ENCRYPTION_KEY`: 32-byte key for token encryption (base64 encoded)
- `JWT_SECRET`: Secret for JWT signing/validation
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## Tool Implementation Pattern

When adding new tools:

1. Define tool in appropriate service file (`src/tools/{service}.ts`)
2. Add handler function in `src/tools/handlers/{service}.ts`
3. Handler receives `ToolContext` with authenticated client
4. Use try-catch for Google API calls and map errors appropriately

Example handler structure:
```typescript
async function handleToolName(service: any, params: any) {
  const response = await service.method({
    // API parameters
  });
  return response.data;
}
```

## Security Considerations

- All tokens encrypted at rest
- JWT validation uses HMAC-SHA256
- CSRF protection via state tokens
- Rate limiting prevents abuse
- Automatic token refresh maintains security