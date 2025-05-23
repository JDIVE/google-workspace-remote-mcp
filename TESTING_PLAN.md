# Testing Plan

Comprehensive testing strategy for the Google Workspace MCP Server.

## Testing Overview

### Test Pyramid
1. **Unit Tests** (70%) - Individual functions and classes
2. **Integration Tests** (20%) - Component interactions
3. **E2E Tests** (10%) - Full workflow validation

### Coverage Goals
- Overall: 85% minimum
- Critical paths: 95% minimum
- Error handling: 100%

## Test Environment Setup

### 1. Install Testing Dependencies
```bash
npm install --save-dev \
  vitest \
  @vitest/coverage-v8 \
  @vitest/ui \
  miniflare \
  msw \
  @testing-library/jest-dom \
  vitest-fetch-mock
```

### 2. Configure Vitest
Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      bindings: {
        GOOGLE_CLIENT_ID: 'test-client-id',
        GOOGLE_CLIENT_SECRET: 'test-client-secret',
        ENCRYPTION_KEY: 'test-encryption-key-32-chars-long',
        ALLOWED_ORIGINS: 'http://localhost:3000,http://test.example.com'
      },
      kvNamespaces: {
        OAUTH_TOKENS: 'test-oauth-tokens',
        RATE_LIMITS: 'test-rate-limits'
      }
    },
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts'
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});
```

### 3. Test Setup File
Create `tests/setup.ts`:
```typescript
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';
import 'vitest-fetch-mock';
import createFetchMock from 'vitest-fetch-mock';

const fetchMocker = createFetchMock(vi);

// Enable fetch mocking
fetchMocker.enableMocks();

// Setup MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  fetchMocker.resetMocks();
});
afterAll(() => server.close());

// Global test utilities
global.createMockRequest = (body: any, headers: Record<string, string> = {}) => {
  return new Request('http://localhost:8787/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
      ...headers
    },
    body: JSON.stringify(body)
  });
};

global.createMockEnv = () => ({
  OAUTH_TOKENS: createMockKV(),
  RATE_LIMITS: createMockKV(),
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  ENCRYPTION_KEY: 'test-encryption-key-32-chars-long',
  ALLOWED_ORIGINS: 'http://localhost:3000'
});

function createMockKV(): KVNamespace {
  const store = new Map();
  
  return {
    get: async (key: string) => store.get(key) || null,
    put: async (key: string, value: string, options?: any) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async (options?: any) => {
      const keys = Array.from(store.keys())
        .filter(k => !options?.prefix || k.startsWith(options.prefix))
        .map(name => ({ name, metadata: null }));
      return { keys, list_complete: true, cursor: '' };
    }
  } as any;
}
```

## Unit Tests

### 1. MCP Server Tests
Create `tests/unit/mcp/server.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServer } from '@/mcp/server';
import { SSETransport } from '@/mcp/transport';

describe('MCPServer', () => {
  let server: MCPServer;
  let transport: SSETransport;
  let mockSend: any;

  beforeEach(() => {
    transport = new SSETransport();
    mockSend = vi.spyOn(transport, 'send').mockResolvedValue();
    server = new MCPServer(transport);
  });

  describe('initialize', () => {
    it('should handle initialize request', async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {}
        }
      };

      await server.processRequest(request);

      expect(mockSend).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "google-workspace-mcp",
            version: "1.0.0"
          }
        }
      });
    });

    it('should reject invalid protocol version', async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: "invalid-version",
          capabilities: {}
        }
      };

      await server.processRequest(request);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: -32602,
            message: expect.stringContaining('protocol version')
          })
        })
      );
    });
  });

  describe('tools/list', () => {
    it('should list all available tools', async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 3,
        method: 'tools/list',
        params: {}
      };

      await server.processRequest(request);

      expect(mockSend).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        id: 3,
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringMatching(/^(gmail|calendar|drive|contacts)_/),
              description: expect.any(String),
              parameters: expect.any(Object)
            })
          ])
        }
      });
    });
  });

  describe('tools/call', () => {
    it('should validate required parameters', async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 4,
        method: 'tools/call',
        params: {
          name: 'gmail_send_message',
          arguments: {
            // Missing required 'to', 'subject', 'body'
          }
        }
      };

      await server.processRequest(request);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: -32602,
            message: expect.stringContaining('required')
          })
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle unknown methods', async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 5,
        method: 'unknown/method',
        params: {}
      };

      await server.processRequest(request);

      expect(mockSend).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        id: 5,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      });
    });

    it('should handle malformed requests', async () => {
      const request = {
        // Missing jsonrpc
        id: 6,
        method: 'test'
      } as any;

      await server.processRequest(request);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: -32600,
            message: 'Invalid request'
          })
        })
      );
    });
  });
});
```

### 2. OAuth Tests
Create `tests/unit/auth/oauth.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleOAuth } from '@/auth/oauth';

describe('GoogleOAuth', () => {
  let oauth: GoogleOAuth;
  
  beforeEach(() => {
    oauth = new GoogleOAuth({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:8787/oauth/callback',
      scopes: ['https://www.googleapis.com/auth/gmail.modify']
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const state = 'test-state-123';
      const url = oauth.getAuthorizationUrl(state);
      
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Foauth%2Fcallback');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
    });

    it('should include all scopes', () => {
      const oauth = new GoogleOAuth({
        clientId: 'test',
        clientSecret: 'test',
        redirectUri: 'http://test',
        scopes: [
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/calendar'
        ]
      });
      
      const url = oauth.getAuthorizationUrl('state');
      expect(url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.modify+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens successfully', async () => {
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.modify',
        token_type: 'Bearer'
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockTokens));

      const tokens = await oauth.exchangeCodeForTokens('test-code');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: expect.stringContaining('code=test-code')
        })
      );

      expect(tokens).toEqual(mockTokens);
    });

    it('should handle token exchange errors', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ error: 'invalid_grant' }),
        { status: 400 }
      );

      await expect(oauth.exchangeCodeForTokens('invalid-code'))
        .rejects.toThrow('Token exchange failed');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh token successfully', async () => {
      const mockTokens = {
        access_token: 'new-access-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.modify',
        token_type: 'Bearer'
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockTokens));

      const tokens = await oauth.refreshAccessToken('test-refresh-token');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('refresh_token=test-refresh-token')
        })
      );

      expect(tokens).toEqual(mockTokens);
    });

    it('should handle refresh token revocation', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ error: 'invalid_grant' }),
        { status: 400 }
      );

      await expect(oauth.refreshAccessToken('revoked-token'))
        .rejects.toThrow('Token refresh failed');
    });
  });
});
```

### 3. Token Storage Tests
Create `tests/unit/auth/storage.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenStorage } from '@/auth/storage';
import { encrypt, decrypt } from '@/utils/crypto';

describe('TokenStorage', () => {
  let storage: TokenStorage;
  let mockKV: KVNamespace;
  
  beforeEach(() => {
    mockKV = createMockKV();
    storage = new TokenStorage(mockKV, 'test-encryption-key-32-chars-long');
  });

  describe('storeTokens', () => {
    it('should store encrypted tokens', async () => {
      const tokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: Date.now() + 3600000
      };

      await storage.storeTokens('user-123', tokens);

      const storedValue = await mockKV.get('tokens:user-123');
      expect(storedValue).toBeTruthy();

      // Verify it's encrypted
      expect(storedValue).not.toContain('test-access-token');
      
      // Verify we can decrypt it
      const decrypted = await decrypt(storedValue!, 'test-encryption-key-32-chars-long');
      expect(JSON.parse(decrypted)).toEqual(tokens);
    });

    it('should set appropriate TTL', async () => {
      const putSpy = vi.spyOn(mockKV, 'put');
      
      await storage.storeTokens('user-123', {
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: Date.now()
      });

      expect(putSpy).toHaveBeenCalledWith(
        'tokens:user-123',
        expect.any(String),
        expect.objectContaining({
          expirationTtl: 60 * 60 * 24 * 90 // 90 days
        })
      );
    });
  });

  describe('getTokens', () => {
    it('should retrieve and decrypt tokens', async () => {
      const tokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: Date.now() + 3600000
      };

      // Store encrypted tokens
      const encrypted = await encrypt(
        JSON.stringify(tokens),
        'test-encryption-key-32-chars-long'
      );
      await mockKV.put('tokens:user-123', encrypted);

      // Retrieve through storage
      const retrieved = await storage.getTokens('user-123');
      
      expect(retrieved).toEqual(tokens);
    });

    it('should return null for non-existent user', async () => {
      const tokens = await storage.getTokens('non-existent');
      expect(tokens).toBeNull();
    });

    it('should handle decryption errors', async () => {
      // Store invalid encrypted data
      await mockKV.put('tokens:user-123', 'invalid-encrypted-data');

      await expect(storage.getTokens('user-123'))
        .rejects.toThrow();
    });
  });

  describe('deleteTokens', () => {
    it('should delete tokens', async () => {
      await mockKV.put('tokens:user-123', 'some-data');
      
      await storage.deleteTokens('user-123');
      
      const result = await mockKV.get('tokens:user-123');
      expect(result).toBeNull();
    });
  });
});
```

### 4. Gmail Service Tests
Create `tests/unit/tools/gmail.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GmailService } from '@/tools/gmail';

describe('GmailService', () => {
  let service: GmailService;
  const mockAccessToken = 'test-access-token';

  beforeEach(() => {
    service = new GmailService(mockAccessToken);
    fetchMock.resetMocks();
  });

  describe('searchMessages', () => {
    it('should search messages with query', async () => {
      const mockResponse = {
        messages: [
          { id: 'msg1', threadId: 'thread1' },
          { id: 'msg2', threadId: 'thread2' }
        ],
        resultSizeEstimate: 2
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockResponse));

      const result = await service.searchMessages('from:test@example.com', 20);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from%3Atest%40example.com&maxResults=20',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-access-token'
          }
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle search errors', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ error: { message: 'Invalid query' } }),
        { status: 400 }
      );

      await expect(service.searchMessages('invalid query'))
        .rejects.toThrow('Gmail search failed');
    });
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const mockResponse = {
        id: 'sent-message-id',
        threadId: 'thread-id'
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockResponse));

      const result = await service.sendMessage(
        ['recipient@example.com'],
        'Test Subject',
        'Test Body',
        ['cc@example.com'],
        ['bcc@example.com']
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-access-token',
            'Content-Type': 'application/json'
          },
          body: expect.stringContaining('"raw"')
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should encode message correctly', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ id: 'test' }));

      await service.sendMessage(
        ['test@example.com'],
        'Test Subject',
        'Test Body'
      );

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body as string);
      
      // Decode the raw message
      const decodedMessage = atob(body.raw.replace(/-/g, '+').replace(/_/g, '/'));
      
      expect(decodedMessage).toContain('To: test@example.com');
      expect(decodedMessage).toContain('Subject: Test Subject');
      expect(decodedMessage).toContain('Test Body');
    });
  });

  describe('getMessage', () => {
    it('should retrieve message with full format', async () => {
      const mockMessage = {
        id: 'msg123',
        threadId: 'thread123',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test Message' }
          ]
        }
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockMessage));

      const result = await service.getMessage('msg123', 'full');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg123?format=full',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-access-token'
          }
        })
      );

      expect(result).toEqual(mockMessage);
    });
  });
});
```

## Integration Tests

### 1. OAuth Flow Integration
Create `tests/integration/oauth-flow.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createWorker } from '../helpers/worker';

describe('OAuth Flow Integration', () => {
  let worker: any;
  let env: any;

  beforeEach(() => {
    env = createMockEnv();
    worker = createWorker(env);
  });

  it('should complete full OAuth flow', async () => {
    // Step 1: Initiate OAuth
    const authResponse = await worker.fetch(
      new Request('http://localhost:8787/oauth/authorize?user_id=test-user')
    );

    expect(authResponse.status).toBe(302);
    const location = authResponse.headers.get('Location');
    expect(location).toContain('accounts.google.com');
    expect(location).toContain('state=');

    // Extract state
    const state = new URL(location!).searchParams.get('state');

    // Step 2: Simulate callback with code
    fetchMock.mockResponseOnce(JSON.stringify({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/gmail.modify',
      token_type: 'Bearer'
    }));

    const callbackResponse = await worker.fetch(
      new Request(`http://localhost:8787/oauth/callback?code=test-code&state=${state}`)
    );

    expect(callbackResponse.status).toBe(200);
    expect(await callbackResponse.text()).toContain('Authorization successful');

    // Step 3: Verify tokens were stored
    const storedTokens = await env.OAUTH_TOKENS.get('tokens:test-user');
    expect(storedTokens).toBeTruthy();
  });

  it('should handle OAuth errors gracefully', async () => {
    const response = await worker.fetch(
      new Request('http://localhost:8787/oauth/callback?error=access_denied')
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Authorization denied');
  });
});
```

### 2. MCP Tool Execution Integration
Create `tests/integration/tool-execution.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MCPTestClient } from '../helpers/mcp-client';

describe('Tool Execution Integration', () => {
  let client: MCPTestClient;
  let env: any;

  beforeEach(async () => {
    env = createMockEnv();
    client = new MCPTestClient('http://localhost:8787/mcp', 'test-token');
    
    // Store test tokens
    await env.OAUTH_TOKENS.put('tokens:test-user', JSON.stringify({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Date.now() + 3600000
    }));
  });

  it('should execute gmail_search_messages tool', async () => {
    // Mock Gmail API response
    fetchMock.mockResponseOnce(JSON.stringify({
      messages: [
        { id: 'msg1', threadId: 'thread1' },
        { id: 'msg2', threadId: 'thread2' }
      ],
      resultSizeEstimate: 2
    }));

    const response = await client.callTool('gmail_search_messages', {
      query: 'from:test@example.com',
      maxResults: 10
    });

    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty('messages');
    expect(response.data.messages).toHaveLength(2);
  });

  it('should handle token refresh during tool execution', async () => {
    // Set expired token
    await env.OAUTH_TOKENS.put('tokens:test-user', JSON.stringify({
      access_token: 'expired-token',
      refresh_token: 'test-refresh-token',
      expires_at: Date.now() - 1000 // Expired
    }));

    // Mock token refresh
    fetchMock.mockResponseOnce(JSON.stringify({
      access_token: 'new-access-token',
      expires_in: 3600
    }));

    // Mock Gmail API response
    fetchMock.mockResponseOnce(JSON.stringify({
      messages: []
    }));

    const response = await client.callTool('gmail_search_messages', {
      query: 'test'
    });

    expect(response.success).toBe(true);
    
    // Verify token was refreshed
    const updatedTokens = JSON.parse(
      await env.OAUTH_TOKENS.get('tokens:test-user')
    );
    expect(updatedTokens.access_token).toBe('new-access-token');
  });

  it('should enforce rate limits', async () => {
    // Exhaust rate limit
    for (let i = 0; i < 100; i++) {
      await client.callTool('gmail_list_labels', {});
    }

    // Next request should be rate limited
    const response = await client.callTool('gmail_list_labels', {});
    
    expect(response.success).toBe(false);
    expect(response.error.code).toBe(-32003);
    expect(response.error.message).toContain('Rate limit');
  });
});
```

## E2E Tests

### 1. Complete Workflow Test
Create `tests/e2e/complete-workflow.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { MCPTestClient } from '../helpers/mcp-client';
import { setupTestUser } from '../helpers/setup';

describe('E2E: Complete Workflow', () => {
  it('should complete full email workflow', async () => {
    // Setup
    const { client, userId } = await setupTestUser();

    // 1. Search for emails
    const searchResponse = await client.callTool('gmail_search_messages', {
      query: 'subject:"Test Email"',
      maxResults: 5
    });

    expect(searchResponse.success).toBe(true);
    const messages = searchResponse.data.messages || [];

    // 2. Get first message details
    if (messages.length > 0) {
      const messageResponse = await client.callTool('gmail_get_message', {
        messageId: messages[0].id,
        format: 'full'
      });

      expect(messageResponse.success).toBe(true);
      expect(messageResponse.data).toHaveProperty('payload');
    }

    // 3. Create a draft
    const draftResponse = await client.callTool('gmail_create_draft', {
      to: ['test@example.com'],
      subject: 'Test Draft',
      body: 'This is a test draft'
    });

    expect(draftResponse.success).toBe(true);
    expect(draftResponse.data).toHaveProperty('id');

    // 4. List labels
    const labelsResponse = await client.callTool('gmail_list_labels', {});
    
    expect(labelsResponse.success).toBe(true);
    expect(labelsResponse.data).toHaveProperty('labels');
    expect(Array.isArray(labelsResponse.data.labels)).toBe(true);
  });

  it('should handle calendar operations', async () => {
    const { client } = await setupTestUser();

    // 1. List events
    const listResponse = await client.callTool('calendar_list_events', {
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: 10
    });

    expect(listResponse.success).toBe(true);

    // 2. Create event
    const createResponse = await client.callTool('calendar_create_event', {
      summary: 'Test Meeting',
      description: 'Test meeting description',
      start: {
        dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        timeZone: 'America/New_York'
      },
      end: {
        dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        timeZone: 'America/New_York'
      }
    });

    expect(createResponse.success).toBe(true);
    const eventId = createResponse.data.id;

    // 3. Update event
    const updateResponse = await client.callTool('calendar_update_event', {
      eventId,
      summary: 'Updated Test Meeting'
    });

    expect(updateResponse.success).toBe(true);

    // 4. Delete event
    const deleteResponse = await client.callTool('calendar_delete_event', {
      eventId
    });

    expect(deleteResponse.success).toBe(true);
  });
});
```

## Performance Tests

Create `tests/performance/load.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { MCPTestClient } from '../helpers/mcp-client';

describe('Performance Tests', () => {
  it('should handle concurrent requests', async () => {
    const clients = Array.from({ length: 10 }, () => 
      new MCPTestClient('http://localhost:8787/mcp', 'test-token')
    );

    const start = Date.now();
    
    const results = await Promise.all(
      clients.map(client => 
        client.callTool('gmail_list_labels', {})
      )
    );

    const duration = Date.now() - start;

    expect(results).toHaveLength(10);
    expect(results.every(r => r.success)).toBe(true);
    expect(duration).toBeLessThan(5000); // All requests complete within 5s
  });

  it('should maintain response time under load', async () => {
    const client = new MCPTestClient('http://localhost:8787/mcp', 'test-token');
    const responseTimes: number[] = [];

    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      await client.callTool('gmail_list_labels', {});
      responseTimes.push(Date.now() - start);
    }

    const avgResponseTime = responseTimes.reduce((a, b) => a + b) / responseTimes.length;
    const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

    expect(avgResponseTime).toBeLessThan(200); // Average under 200ms
    expect(p95ResponseTime).toBeLessThan(500); // 95th percentile under 500ms
  });
});
```

## Test Helpers

### MCP Test Client
Create `tests/helpers/mcp-client.ts`:
```typescript
export class MCPTestClient {
  constructor(
    private endpoint: string,
    private token: string
  ) {}

  async initialize() {
    return this.request('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {}
    });
  }

  async listTools() {
    return this.request('tools/list', {});
  }

  async callTool(name: string, args: any) {
    return this.request('tools/call', {
      name,
      arguments: args
    });
  }

  private async request(method: string, params: any) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.random().toString(36).substring(7),
        method,
        params
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return {
        success: false,
        error: data.error
      };
    }

    return {
      success: true,
      data: data.result
    };
  }
}
```

### Mock Server Setup
Create `tests/mocks/server.ts`:
```typescript
import { setupServer } from 'msw/node';
import { rest } from 'msw';

export const server = setupServer(
  // Google OAuth endpoints
  rest.post('https://oauth2.googleapis.com/token', (req, res, ctx) => {
    return res(
      ctx.json({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.modify',
        token_type: 'Bearer'
      })
    );
  }),

  // Gmail API endpoints
  rest.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', (req, res, ctx) => {
    return res(
      ctx.json({
        messages: [
          { id: 'msg1', threadId: 'thread1' },
          { id: 'msg2', threadId: 'thread2' }
        ],
        resultSizeEstimate: 2
      })
    );
  }),

  // Calendar API endpoints
  rest.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', (req, res, ctx) => {
    return res(
      ctx.json({
        kind: 'calendar#events',
        items: []
      })
    );
  })
);
```

## Running Tests

### Commands
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test server.test.ts

# Run in watch mode
npm test -- --watch

# Run with UI
npm test -- --ui

# Run only unit tests
npm test tests/unit

# Run only integration tests
npm test tests/integration

# Run only E2E tests
npm test tests/e2e
```

### CI/CD Integration
Create `.github/workflows/test.yml`:
```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm run test:coverage
    
    - name: Upload coverage
      uses: actions/upload-artifact@v3
      with:
        name: coverage
        path: coverage/
    
    - name: Check coverage thresholds
      run: |
        npm run test:coverage -- --coverage.thresholdAutoUpdate=false
```

## Test Data Management

### Fixtures
Create `tests/fixtures/gmail.ts`:
```typescript
export const mockMessage = {
  id: 'msg123',
  threadId: 'thread123',
  labelIds: ['INBOX', 'UNREAD'],
  snippet: 'This is a test email...',
  payload: {
    headers: [
      { name: 'From', value: 'sender@example.com' },
      { name: 'To', value: 'recipient@example.com' },
      { name: 'Subject', value: 'Test Email' },
      { name: 'Date', value: 'Mon, 1 Jan 2024 12:00:00 +0000' }
    ],
    body: {
      size: 100,
      data: btoa('This is the email body')
    }
  }
};

export const mockLabels = [
  { id: 'INBOX', name: 'INBOX', type: 'system' },
  { id: 'SENT', name: 'SENT', type: 'system' },
  { id: 'Label_1', name: 'Work', type: 'user' },
  { id: 'Label_2', name: 'Personal', type: 'user' }
];
```

## Debugging Tests

### Debug Configuration
Add to `launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--no-coverage"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Test Utilities
Create `tests/utils/debug.ts`:
```typescript
export function logTestContext(context: any) {
  if (process.env.DEBUG_TESTS) {
    console.log('Test Context:', JSON.stringify(context, null, 2));
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry failed');
}
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Services**: Never make real API calls in tests
3. **Use Factories**: Create test data consistently
4. **Test Edge Cases**: Empty results, errors, timeouts
5. **Performance Awareness**: Keep tests fast
6. **Clear Assertions**: Make test failures obvious
7. **Documentation**: Comment complex test scenarios