# OAuth Setup Guide

Comprehensive guide for configuring Google OAuth 2.0 for the Google Workspace MCP Server.

## Prerequisites

1. Google Cloud Project with billing enabled
2. Admin access to Google Cloud Console
3. Domain verification (for production use)

## Step 1: Create Google Cloud Project

### 1.1 Create New Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Enter project details:
   - **Project name**: `google-workspace-mcp`
   - **Organization**: Select if applicable
   - **Location**: Choose appropriate folder
4. Click "Create"

### 1.2 Enable Required APIs
Navigate to "APIs & Services" → "Library" and enable:

1. **Gmail API**
   - Search for "Gmail API"
   - Click "Enable"

2. **Google Calendar API**
   - Search for "Google Calendar API"
   - Click "Enable"

3. **Google Drive API**
   - Search for "Google Drive API"
   - Click "Enable"

4. **Google People API**
   - Search for "Google People API"
   - Click "Enable"

## Step 2: Configure OAuth Consent Screen

### 2.1 Basic Configuration
1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose user type:
   - **Internal**: For G Suite/Workspace organizations only
   - **External**: For any Google account (requires verification)
3. Click "Create"

### 2.2 App Information
Fill in the required fields:

```yaml
App name: Google Workspace MCP Server
User support email: your-email@domain.com
App logo: (optional, 120x120px)
```

### 2.3 App Domain
```yaml
Application home page: https://your-worker.workers.dev
Application privacy policy: https://your-worker.workers.dev/privacy
Application terms of service: https://your-worker.workers.dev/terms
```

### 2.4 Authorized Domains
Add your domains:
- `workers.dev` (for Cloudflare Workers)
- Your custom domain (if applicable)

### 2.5 Developer Contact Information
Add email addresses for Google to contact about your app.

## Step 3: Configure OAuth Scopes

### 3.1 Add Scopes
Click "Add or Remove Scopes" and add:

#### Gmail Scopes
```
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.labels
https://www.googleapis.com/auth/gmail.settings.basic
```

#### Calendar Scopes
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

#### Drive Scopes
```
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.metadata
```

#### Contacts Scopes
```
https://www.googleapis.com/auth/contacts.readonly
https://www.googleapis.com/auth/directory.readonly
```

### 3.2 Sensitive Scopes
Note: Some scopes are considered sensitive and require verification:
- Gmail scopes (reading/sending email)
- Drive scopes (accessing files)
- Calendar scopes (accessing events)

For development, you can use the app in "Testing" mode with up to 100 users.

## Step 4: Create OAuth 2.0 Credentials

### 4.1 Create Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Web application"

### 4.2 Configure OAuth Client
```yaml
Name: Google Workspace MCP Client

Authorized JavaScript origins:
- https://your-worker.workers.dev
- http://localhost:8787 (for development)

Authorized redirect URIs:
- https://your-worker.workers.dev/oauth/callback
- http://localhost:8787/oauth/callback (for development)
```

### 4.3 Save Credentials
After creation, you'll receive:
- **Client ID**: `xxxxxxxxxxxx.apps.googleusercontent.com`
- **Client Secret**: `GOCSPX-xxxxxxxxxxxxx`

Save these securely - you'll need them for Cloudflare secrets.

## Step 5: Configure Cloudflare Secrets

### 5.1 Set OAuth Credentials
```bash
# Set client ID
wrangler secret put GOOGLE_CLIENT_ID
# Enter the client ID when prompted

# Set client secret
wrangler secret put GOOGLE_CLIENT_SECRET
# Enter the client secret when prompted

# Set encryption key (generate a secure 32-character key)
wrangler secret put ENCRYPTION_KEY
# Enter a 32-character encryption key
```

### 5.2 Generate Encryption Key
```javascript
// Generate secure encryption key
const crypto = require('crypto');
const key = crypto.randomBytes(32).toString('base64').slice(0, 32);
console.log('Encryption Key:', key);
```

## Step 6: OAuth Implementation Details

### 6.1 Authorization URL Construction
```typescript
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
authUrl.searchParams.set('redirect_uri', `${WORKER_URL}/oauth/callback`);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline'); // For refresh token
authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
authUrl.searchParams.set('state', generateSecureState()); // CSRF protection
```

### 6.2 Callback Handler Implementation
```typescript
async function handleOAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  // Validate state for CSRF protection
  if (!validateState(state)) {
    return new Response('Invalid state parameter', { status: 400 });
  }
  
  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/oauth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  
  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Token exchange failed:', error);
    return new Response('Authorization failed', { status: 500 });
  }
  
  const tokens = await tokenResponse.json();
  
  // Store tokens securely
  await storeTokens(env, state, tokens);
  
  // Return success page
  return new Response(generateSuccessHTML(), {
    headers: { 'Content-Type': 'text/html' },
  });
}
```

### 6.3 Token Refresh Implementation
```typescript
async function refreshAccessToken(
  refreshToken: string,
  env: Env
): Promise<TokenResponse> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Token refresh failed:', error);
    
    // Check if refresh token is revoked
    if (response.status === 400) {
      throw new Error('Refresh token revoked - reauthorization required');
    }
    
    throw new Error('Token refresh failed');
  }
  
  return response.json();
}
```

## Step 7: Security Best Practices

### 7.1 State Parameter
Generate cryptographically secure state parameters:
```typescript
function generateSecureState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

### 7.2 Token Storage
Encrypt tokens before storing in KV:
```typescript
async function storeTokens(
  env: Env,
  userId: string,
  tokens: TokenResponse
): Promise<void> {
  const tokenData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
    scope: tokens.scope,
    token_type: tokens.token_type,
  };
  
  const encrypted = await encrypt(
    JSON.stringify(tokenData),
    env.ENCRYPTION_KEY
  );
  
  await env.OAUTH_TOKENS.put(
    `tokens:${userId}`,
    encrypted,
    {
      expirationTtl: 60 * 60 * 24 * 90, // 90 days
    }
  );
}
```

### 7.3 PKCE Implementation (Optional but Recommended)
```typescript
interface PKCEChallenge {
  verifier: string;
  challenge: string;
  method: 'S256';
}

function generatePKCEChallenge(): PKCEChallenge {
  const verifier = generateSecureState(); // 43-128 chars
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return { verifier, challenge, method: 'S256' };
}

// Add to authorization URL
authUrl.searchParams.set('code_challenge', pkce.challenge);
authUrl.searchParams.set('code_challenge_method', pkce.method);

// Include verifier in token exchange
tokenParams.set('code_verifier', pkce.verifier);
```

## Step 8: Testing OAuth Flow

### 8.1 Development Testing
1. Start local development server:
   ```bash
   wrangler dev
   ```

2. Create test authorization URL:
   ```
   http://localhost:8787/oauth/authorize?user_id=test-user
   ```

3. Complete OAuth flow in browser

4. Verify token storage:
   ```bash
   wrangler kv:key get --namespace-id=YOUR_NAMESPACE_ID "tokens:test-user"
   ```

### 8.2 Production Testing
1. Deploy to Cloudflare:
   ```bash
   wrangler deploy
   ```

2. Test with production URLs

3. Monitor logs:
   ```bash
   wrangler tail
   ```

## Step 9: User Management

### 9.1 Multi-Account Support
```typescript
interface UserAccount {
  userId: string;
  email: string;
  createdAt: number;
  lastUsed: number;
}

async function listUserAccounts(env: Env): Promise<UserAccount[]> {
  const list = await env.OAUTH_TOKENS.list({ prefix: 'tokens:' });
  const accounts: UserAccount[] = [];
  
  for (const key of list.keys) {
    const userId = key.name.replace('tokens:', '');
    const metadata = await getUserMetadata(env, userId);
    if (metadata) {
      accounts.push(metadata);
    }
  }
  
  return accounts;
}
```

### 9.2 Account Switching
```typescript
async function switchAccount(
  env: Env,
  fromUserId: string,
  toUserId: string
): Promise<boolean> {
  // Verify target account exists
  const tokens = await getTokens(env, toUserId);
  if (!tokens) {
    return false;
  }
  
  // Update last used timestamp
  await updateLastUsed(env, toUserId);
  
  return true;
}
```

## Step 10: Troubleshooting

### Common Issues and Solutions

#### 10.1 "Invalid redirect URI"
**Problem**: OAuth callback fails with redirect URI mismatch
**Solution**: 
- Ensure redirect URI in code exactly matches configured URI
- Check for trailing slashes
- Verify protocol (http vs https)

#### 10.2 "Refresh token not returned"
**Problem**: No refresh token in token response
**Solution**:
- Add `access_type=offline` to authorization URL
- Add `prompt=consent` to force consent screen
- Revoke access and reauthorize

#### 10.3 "Token expired" errors
**Problem**: Access token expires during use
**Solution**:
```typescript
async function executeWithTokenRefresh<T>(
  env: Env,
  userId: string,
  operation: (token: string) => Promise<T>
): Promise<T> {
  let token = await getValidAccessToken(env, userId);
  
  try {
    return await operation(token);
  } catch (error) {
    if (error.status === 401) {
      // Token might have just expired, try refresh
      token = await refreshAndGetToken(env, userId);
      return await operation(token);
    }
    throw error;
  }
}
```

#### 10.4 "Quota exceeded"
**Problem**: API quota limits reached
**Solution**:
- Implement exponential backoff
- Cache API responses
- Request quota increase in Cloud Console

## Verification Checklist

- [ ] Google Cloud Project created
- [ ] All required APIs enabled
- [ ] OAuth consent screen configured
- [ ] OAuth credentials created
- [ ] Cloudflare secrets configured
- [ ] Redirect URIs match exactly
- [ ] Scopes are properly configured
- [ ] Token encryption working
- [ ] Refresh flow implemented
- [ ] Error handling in place
- [ ] Rate limiting configured
- [ ] Monitoring/logging enabled

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google API Scopes Reference](https://developers.google.com/identity/protocols/oauth2/scopes)
- [OAuth 2.0 Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [Cloudflare Workers KV Documentation](https://developers.cloudflare.com/workers/runtime-apis/kv/)