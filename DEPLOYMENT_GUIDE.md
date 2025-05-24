# Deployment Guide

Complete instructions for deploying the Google Workspace MCP Server to Cloudflare Workers.

## Prerequisites

- [ ] Cloudflare account with Workers enabled
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] Google OAuth credentials configured
- [ ] All tests passing locally

## Pre-Deployment Checklist

### 1. Code Verification
```bash
# Run all tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Build test
npm run build
```

### 2. Environment Variables
Ensure all required secrets are set:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ENCRYPTION_KEY`

### 3. KV Namespaces
Verify KV namespaces are created and bound correctly.

## Step 1: Configure Cloudflare Account

### 1.1 Login to Wrangler
```bash
wrangler login
```

### 1.2 Verify Account
```bash
wrangler whoami
```

Expected output:
```
 ⛅️ wrangler 3.22.0
-------------------
Getting User settings...
👋 You are logged in with an OAuth Token, associated with the email 'your-email@example.com'!
┌──────────────────────┬──────────────────────────────────┐
│ Account Name         │ Account ID                       │
├──────────────────────┼──────────────────────────────────┤
│ Your Account         │ 1234567890abcdef1234567890abcdef │
└──────────────────────┴──────────────────────────────────┘
```

## Step 2: Create KV Namespaces

### 2.1 Create Production Namespaces
```bash
# Create OAuth tokens namespace
wrangler kv:namespace create "OAUTH_TOKENS"
# Save the ID from output

# Create rate limits namespace
wrangler kv:namespace create "RATE_LIMITS"
# Save the ID from output
```

### 2.2 Create Preview Namespaces (for staging)
```bash
# Create preview OAuth tokens namespace
wrangler kv:namespace create "OAUTH_TOKENS" --preview
# Save the preview_id from output

# Create preview rate limits namespace
wrangler kv:namespace create "RATE_LIMITS" --preview
# Save the preview_id from output
```

### 2.3 Update wrangler.toml
Update `wrangler.toml` with the namespace IDs:
```toml
[[kv_namespaces]]
binding = "OAUTH_TOKENS"
id = "your-oauth-tokens-namespace-id"
preview_id = "your-oauth-tokens-preview-id"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "your-rate-limits-namespace-id"
preview_id = "your-rate-limits-preview-id"
```

## Step 3: Configure Secrets

### 3.1 Set Production Secrets
```bash
# Google OAuth Client ID
wrangler secret put GOOGLE_CLIENT_ID
# Paste your client ID when prompted

# Google OAuth Client Secret
wrangler secret put GOOGLE_CLIENT_SECRET
# Paste your client secret when prompted

# Encryption Key (32-byte key, base64 encoded)
wrangler secret put ENCRYPTION_KEY
# Paste your base64-encoded encryption key when prompted
```

### 3.2 Generate Encryption Key
If you need to generate a new encryption key:
```bash
# Generate secure 32-byte encryption key
openssl rand -base64 32
```

Or using Node.js:
```javascript
// generate-key.js
const crypto = require('crypto');
const key = crypto.randomBytes(32).toString('base64');
console.log('Encryption Key:', key);
console.log('Key length:', Buffer.from(key, 'base64').length, 'bytes');
```

Run:
```bash
node generate-key.js
```

### 3.3 Verify Secrets
```bash
wrangler secret list
```

Expected output:
```
[
  {
    "name": "GOOGLE_CLIENT_ID",
    "type": "secret_text"
  },
  {
    "name": "GOOGLE_CLIENT_SECRET",
    "type": "secret_text"
  },
  {
    "name": "ENCRYPTION_KEY",
    "type": "secret_text"
  }
]
```

## Step 4: Configure Domain and Routes

### 4.1 Custom Domain (Optional)
If using a custom domain:

1. Add domain to Cloudflare
2. Configure DNS:
   ```
   Type: CNAME
   Name: mcp-workspace
   Target: your-worker.workers.dev
   Proxy: Yes (orange cloud)
   ```

### 4.2 Update wrangler.toml for Custom Domain
```toml
routes = [
  { pattern = "mcp-workspace.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

### 4.3 Update OAuth Redirect URIs
Update Google OAuth credentials with production URLs:
- `https://your-worker.workers.dev/oauth/callback`
- `https://mcp-workspace.yourdomain.com/oauth/callback` (if using custom domain)

## Step 5: Deploy to Staging

### 5.1 Deploy to Preview Environment
```bash
wrangler deploy --env preview
```

### 5.2 Test Staging Deployment
```bash
# Test health endpoint
curl https://your-worker-preview.workers.dev/health

# Test MCP endpoint
curl -X POST https://your-worker-preview.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### 5.3 Test OAuth Flow
1. Navigate to: `https://your-worker-preview.workers.dev/oauth/authorize?user_id=test-user`
2. Complete OAuth flow
3. Verify token storage:
   ```bash
   wrangler kv:key get --namespace-id=YOUR_PREVIEW_NAMESPACE_ID "tokens:test-user"
   ```

### 5.4 Configure Staging Environment
Add a dedicated section in `wrangler.toml` for staging so secrets and
bindings don't mix with production:

```toml
[env.preview]
route = "staging-mcp.yourdomain.com/*"
kv_namespaces = [
  { binding = "OAUTH_TOKENS", preview_id = "your-oauth-tokens-preview-id" },
  { binding = "RATE_LIMITS",  preview_id = "your-rate-limits-preview-id" }
]
```

Store staging secrets separately:

```bash
wrangler secret put GOOGLE_CLIENT_ID --env preview
wrangler secret put GOOGLE_CLIENT_SECRET --env preview
wrangler secret put ENCRYPTION_KEY --env preview
```

Deploy to staging after configuring the environment:

```bash
wrangler deploy --env preview
```

## Step 6: Deploy to Production

### 6.1 Final Build
```bash
npm run build
```

### 6.2 Deploy
```bash
wrangler deploy
```

Expected output:
```
 ⛅️ wrangler 3.22.0
-------------------
Total Upload: 125.42 KiB / gzip: 35.67 KiB
Uploaded google-workspace-mcp (1.25 sec)
Published google-workspace-mcp (0.35 sec)
  https://google-workspace-mcp.your-subdomain.workers.dev
Current Deployment ID: abc123def456
```

### 6.3 Verify Deployment
```bash
# Check deployment status
wrangler deployments list

# Tail logs
wrangler tail
```

### 6.4 Blue/Green Deployment and Rollback
Use two production workers (`-blue` and `-green`) to deploy with zero downtime:

1. Deploy the new version to the idle color:
   ```bash
   wrangler deploy --name google-workspace-mcp-green
   ```
2. Smoke test the green deployment:
   ```bash
   curl https://google-workspace-mcp-green.workers.dev/health
   ```
3. Switch the route in `wrangler.toml` or Cloudflare dashboard to point to the
   green worker.
4. If problems occur, roll back by switching the route back or by using:
   ```bash
   wrangler rollback <previous-deployment-id> --name google-workspace-mcp-green
   ```
5. Once stable, remove the old blue deployment or keep it for the next cycle.

## Step 7: Post-Deployment Configuration

### 7.1 Update Allowed Origins
```bash
# Update environment variable
wrangler deploy --var ALLOWED_ORIGINS:"https://claude.ai,https://api.anthropic.com"
```

### 7.2 Configure Rate Limits
Set initial rate limit data:
```bash
# Set global rate limit
wrangler kv:key put --namespace-id=YOUR_RATE_LIMITS_ID "global:limit" '{"requests":10000,"window":60000}'

# Set per-user defaults
wrangler kv:key put --namespace-id=YOUR_RATE_LIMITS_ID "default:limit" '{"requests":100,"window":60000}'
```

### 7.3 Enable Logpush (Optional)
For production logging:
```bash
wrangler logpush create \
  --destination-conf "r2://your-bucket/logs" \
  --dataset "workers_trace_events" \
  --fields "EventTimestampMs,Outcome,Exceptions,Logs"
```

## Step 8: Configure MCP Client

### 8.1 Add to Claude Desktop Config
Update `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-sse-client",
        "https://your-worker.workers.dev/mcp"
      ],
      "env": {
        "AUTHORIZATION": "Bearer your-auth-token"
      }
    }
  }
}
```

### 8.2 Test Connection
1. Restart Claude Desktop
2. Open developer tools
3. Check for successful MCP connection

## Step 9: Monitoring Setup

### 9.1 Cloudflare Analytics
1. Go to Workers & Pages → your worker → Analytics
2. Monitor:
   - Request count
   - Error rate
   - CPU time
   - Duration

### 9.2 Set Up Alerts
In Cloudflare Dashboard:
1. Go to Notifications
2. Create alerts for:
   - Error rate > 5%
   - CPU time > 40ms average
   - Request rate spike

### 9.3 Custom Metrics
```typescript
// Add to worker code
async function trackMetric(env: Env, metric: string, value: number) {
  const key = `metric:${metric}:${Date.now()}`;
  await env.RATE_LIMITS.put(key, value.toString(), {
    expirationTtl: 86400 // 24 hours
  });
}

// Usage
await trackMetric(env, 'gmail_api_calls', 1);
await trackMetric(env, 'oauth_refresh', 1);
```

## Step 10: Production Checklist

### Security
- [ ] HTTPS only (enforced by Cloudflare)
- [ ] CORS configured correctly
- [ ] Secrets properly stored
- [ ] Input validation active
- [ ] Rate limiting enabled

### Performance
- [ ] Response times < 2s
- [ ] CPU time < 50ms average
- [ ] Memory usage monitored
- [ ] Caching implemented

### Reliability
- [ ] Error handling comprehensive
- [ ] Automatic token refresh working
- [ ] KV storage redundancy
- [ ] Graceful degradation

### Compliance
- [ ] Data encryption active
- [ ] Minimal data retention
- [ ] Audit logging enabled
- [ ] GDPR compliance (if applicable)

## Rollback Procedures

### Quick Rollback
```bash
# List recent deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback [deployment-id]
```

### Manual Rollback
1. Keep previous build artifacts
2. Deploy specific version:
   ```bash
   wrangler deploy --compatibility-date=2024-01-01 --outdir=dist-backup
   ```

## Troubleshooting

### Common Issues

#### 1. KV Namespace Binding Error
```
Error: No KV namespace binding found for OAUTH_TOKENS
```
**Solution**: Verify namespace IDs in wrangler.toml match created namespaces

#### 2. Secret Not Found
```
Error: A secret named 'GOOGLE_CLIENT_ID' was not found
```
**Solution**: Re-run `wrangler secret put GOOGLE_CLIENT_ID`

#### 3. Route Conflicts
```
Error: Route pattern conflicts with existing route
```
**Solution**: Check existing routes with `wrangler route list`

#### 4. Build Size Too Large
```
Error: Script size exceeds limit (10MB)
```
**Solution**: 
- Enable minification
- Remove unused dependencies
- Use dynamic imports

### Debug Mode
Enable detailed logging:
```typescript
// In worker code
const DEBUG = true;

function debugLog(message: string, data?: any) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
  }
}
```

### Health Check Endpoint
Add health check for monitoring:
```typescript
if (url.pathname === '/health') {
  return new Response(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

## Maintenance

### Regular Tasks
1. **Weekly**: Check error logs
2. **Monthly**: Review rate limit settings
3. **Quarterly**: Update dependencies
4. **Annually**: Rotate encryption keys

### Update Procedure
1. Test updates locally
2. Deploy to staging
3. Run integration tests
4. Deploy to production during low-traffic period
5. Monitor for 24 hours

### Backup Strategy
1. Export KV data regularly:
   ```bash
   wrangler kv:key list --namespace-id=YOUR_NAMESPACE_ID > kv-backup.json
   ```

2. Store configuration backups:
   - wrangler.toml
   - Package versions
   - Environment variables

## Cost Optimization

### Monitor Usage
- Workers requests: 100,000 free/day
- KV operations: 100,000 free/day
- KV storage: 1GB free

### Optimization Tips
1. Cache frequently accessed data
2. Batch API requests
3. Use ETags for conditional requests
4. Implement request coalescing

## Support and Resources

### Documentation
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/cli-wrangler/)
- [MCP Specification](https://modelcontextprotocol.io/)

### Debugging Tools
- [Cloudflare Trace](https://developers.cloudflare.com/workers/observability/trace/)
- [Workers Playground](https://workers.cloudflare.com/playground)
- [miniflare](https://miniflare.dev/) for local testing

### Community
- [Cloudflare Community](https://community.cloudflare.com/)
- [Workers Discord](https://discord.gg/cloudflaredev)