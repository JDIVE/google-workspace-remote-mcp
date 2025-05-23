# Technical Requirements

Comprehensive technical specifications and dependencies for the Google Workspace Remote MCP Server.

## Core Dependencies

### Runtime Requirements
- **Node.js**: 18.x or higher (for development)
- **Cloudflare Workers**: Compatibility date 2024-01-01 or later
- **TypeScript**: 5.x

### NPM Dependencies

#### Production Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^0.5.0",
  "googleapis": "^128.0.0"
}
```

#### Development Dependencies
```json
{
  "@cloudflare/workers-types": "^4.20240117.0",
  "@types/node": "^20.11.0",
  "@typescript-eslint/eslint-plugin": "^6.19.0",
  "@typescript-eslint/parser": "^6.19.0",
  "@vitest/coverage-v8": "^1.2.0",
  "eslint": "^8.56.0",
  "miniflare": "^3.20240129.0",
  "prettier": "^3.2.0",
  "typescript": "^5.3.0",
  "vitest": "^1.2.0",
  "wrangler": "^3.22.0"
}
```

## API Requirements

### Google Workspace APIs
1. **Gmail API v1**
   - Scopes required:
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.labels`
     - `https://www.googleapis.com/auth/gmail.settings.basic`

2. **Google Calendar API v3**
   - Scopes required:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/calendar.events`

3. **Google Drive API v3**
   - Scopes required:
     - `https://www.googleapis.com/auth/drive`
     - `https://www.googleapis.com/auth/drive.file`
     - `https://www.googleapis.com/auth/drive.metadata`

4. **Google People API v1**
   - Scopes required:
     - `https://www.googleapis.com/auth/contacts.readonly`
     - `https://www.googleapis.com/auth/directory.readonly`

### Model Context Protocol (MCP)
- **Protocol Version**: 2024-11-05
- **Transport**: Server-Sent Events (SSE)
- **JSON-RPC**: 2.0

## Cloudflare Requirements

### Workers Configuration
```toml
[compatibility_flags]
nodejs_compat = true

[build]
command = "npm run build"

[build.upload]
format = "modules"
main = "./dist/index.js"

[[rules]]
type = "ESModule"
globs = ["**/*.js"]
```

### KV Namespaces
1. **OAUTH_TOKENS**
   - Purpose: Store encrypted OAuth tokens
   - TTL: 90 days
   - Key format: `tokens:{userId}`
   - Value: Encrypted JSON containing tokens

2. **RATE_LIMITS**
   - Purpose: Track API usage per user
   - TTL: 1 minute sliding window
   - Key format: `rate:{userId}`
   - Value: JSON with count and reset time

### Worker Secrets Required
- `GOOGLE_CLIENT_ID`: OAuth 2.0 client ID
- `GOOGLE_CLIENT_SECRET`: OAuth 2.0 client secret
- `ENCRYPTION_KEY`: 32-character encryption key for token storage
- `JWT_SECRET`: HMAC secret for verifying authorization tokens

### Worker Variables
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## Technical Specifications

### Request/Response Format

#### MCP Request Structure
```typescript
interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: {
    [key: string]: any;
  };
}
```

#### MCP Response Structure
```typescript
interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
```

### Authentication Flow
1. Client initiates OAuth flow
2. User authorizes in browser
3. Callback receives authorization code
4. Exchange code for tokens
5. Store encrypted tokens in KV
6. Return success to client

### Token Storage Schema
```typescript
interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
  scope: string;
  token_type: "Bearer";
}
```

### Rate Limiting Rules
- **Per User**: 100 requests per minute
- **Global**: 10,000 requests per minute
- **Burst**: Allow up to 10 requests in 1 second
- **Headers**: Return `X-RateLimit-*` headers

## Performance Requirements

### Response Times
- **Tool List**: < 100ms
- **Tool Execution**: < 2000ms (excluding API calls)
- **OAuth Flow**: < 5000ms total

### Resource Limits
- **CPU Time**: 50ms per request (Worker limit)
- **Memory**: 128MB per request
- **Script Size**: < 10MB compressed
- **KV Operations**: < 1000 per request

### Caching Strategy
1. **Tool Definitions**: Cache indefinitely
2. **User Tokens**: Cache until expiry
3. **API Responses**: Cache based on endpoint
   - Calendar events: 5 minutes
   - Drive file list: 1 minute
   - Contact list: 15 minutes

## Security Requirements

### Encryption
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **IV**: Random 12 bytes per encryption

### Input Validation
```typescript
interface ValidationRules {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  dateTime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;
  fileSize: { max: 10 * 1024 * 1024 }; // 10MB
  stringLength: { max: 10000 };
}
```

### CORS Policy
```typescript
const corsConfig = {
  allowedOrigins: [
    'https://claude.ai',
    'https://api.anthropic.com'
  ],
  allowedMethods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
  credentials: true
};
```

### Security Headers
```typescript
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};
```

## Error Handling

### Error Codes
| Code | Meaning | HTTP Status |
|------|---------|-------------|
| -32700 | Parse error | 400 |
| -32600 | Invalid request | 400 |
| -32601 | Method not found | 404 |
| -32602 | Invalid params | 400 |
| -32603 | Internal error | 500 |
| -32001 | Auth required | 401 |
| -32002 | Permission denied | 403 |
| -32003 | Rate limit exceeded | 429 |
| -32004 | Resource not found | 404 |
| -32005 | Quota exceeded | 429 |

### Error Response Format
```typescript
interface ErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: {
      details?: string;
      field?: string;
      retryAfter?: number;
    };
  };
}
```

## Monitoring Requirements

### Metrics to Track
1. **Request Metrics**
   - Total requests per minute
   - Request latency (p50, p95, p99)
   - Error rate by error code
   - Success rate by tool

2. **OAuth Metrics**
   - Authorization success rate
   - Token refresh rate
   - Token expiration events

3. **API Usage**
   - Google API calls per service
   - API error rates
   - Quota usage percentage

### Logging Requirements
```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  requestId: string;
  userId?: string;
  method?: string;
  duration?: number;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}
```

## Browser Compatibility

### SSE Support Required
- Chrome 6+
- Firefox 6+
- Safari 5+
- Edge 79+
- Opera 11+

### JavaScript Features Used
- ES2021 features
- async/await
- Fetch API
- Crypto API
- TextEncoder/TextDecoder

## Development Environment

### Required Tools
1. **Node.js 18+**: Development runtime
2. **pnpm or npm**: Package management
3. **Git**: Version control
4. **VS Code** (recommended):
   - Extensions:
     - Cloudflare Workers
     - ESLint
     - Prettier
     - TypeScript

### Environment Variables for Development
```env
# .dev.vars
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
ENCRYPTION_KEY=32_char_encryption_key_for_dev
JWT_SECRET=dev_jwt_secret
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Testing Requirements

### Unit Test Coverage
- Minimum 80% code coverage
- All tools must have tests
- OAuth flow must be tested
- Error handling must be tested

### Integration Test Requirements
- Test against Google API mocks
- Test SSE transport
- Test rate limiting
- Test token refresh

### E2E Test Scenarios
1. Complete OAuth flow
2. Execute each tool type
3. Handle token expiration
4. Test concurrent requests
5. Verify rate limiting

## Deployment Requirements

### CI/CD Pipeline
1. Run tests on all commits
2. Type checking with TypeScript
3. Linting with ESLint
4. Security scanning
5. Deploy to staging first
6. Production deployment after approval

### Rollback Strategy
- Keep 3 previous versions
- Instant rollback capability
- Health checks after deployment
- Monitoring alerts for errors

## Compliance Requirements

### Data Protection
- No PII stored beyond tokens
- Tokens encrypted at rest
- Automatic token expiration
- User-initiated data deletion

### API Usage
- Respect Google API quotas
- Implement exponential backoff
- Handle quota errors gracefully
- Monitor usage trends

### Audit Logging
- Log all authentication events
- Log all tool executions
- Log all errors
- Retain logs for 30 days