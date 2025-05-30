import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Env } from '../../src/index';

// Mock all dependencies
vi.mock('../../src/mcp/server');
vi.mock('../../src/mcp/transport');
vi.mock('../../src/auth/oauth');
vi.mock('../../src/auth/storage');
vi.mock('../../src/utils/validation');
vi.mock('../../src/utils/rate-limit');
vi.mock('../../src/utils/logger');
vi.mock('../../src/auth/state');

describe('Main Handler', () => {
  let mockEnv: Env;
  let defaultExport: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    mockEnv = {
      OAUTH_TOKENS: {} as KVNamespace,
      OAUTH_STATE: {} as KVNamespace,
      RATE_LIMITS: {} as KVNamespace,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      ENCRYPTION_KEY: 'test-encryption-key',
      JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-characters-long',
      ALLOWED_ORIGINS: 'http://localhost:3000,https://example.com',
    };

    // Import the module after mocks are set up
    const module = await import('../../src/index');
    defaultExport = module.default;
  });

  describe('CORS handling', () => {
    it('should handle preflight OPTIONS request', async () => {
      const request = new Request('https://example.com/test', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
        },
      });

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });

    it('should reject origin not in allowed list', async () => {
      const request = new Request('https://example.com/test', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://malicious.com',
        },
      });

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('Route handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://example.com/unknown', {
        method: 'GET',
      });

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('should handle health check', async () => {
      const request = new Request('https://example.com/health', {
        method: 'GET',
      });

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should route to OAuth authorize endpoint', async () => {
      const request = new Request('https://example.com/oauth/authorize?user_id=test123', {
        method: 'GET',
        headers: {
          'CF-Connecting-IP': '192.168.1.1',
        },
      });

      // Mock the createState and GoogleOAuth functions
      const { createState } = await import('../../src/auth/state');
      const { GoogleOAuth } = await import('../../src/auth/oauth');
      
      vi.mocked(createState).mockResolvedValue('mock-state-token');
      
      const mockOAuth = {
        getAuthorizationUrl: vi.fn().mockReturnValue('https://accounts.google.com/oauth/authorize?state=mock-state-token'),
      };
      vi.mocked(GoogleOAuth).mockImplementation(() => mockOAuth as any);

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('accounts.google.com');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(vi.mocked(createState)).toHaveBeenCalledWith(
        mockEnv,
        'test123',
        '192.168.1.1'
      );
    });

    it('should handle OAuth authorize without user_id', async () => {
      const request = new Request('https://example.com/oauth/authorize', {
        method: 'GET',
      });

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Missing user_id parameter');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should route to OAuth callback endpoint', async () => {
      const request = new Request('https://example.com/oauth/callback?code=auth-code&state=valid-state', {
        method: 'GET',
      });

      // Mock the consumeState and OAuth functions
      const { consumeState } = await import('../../src/auth/state');
      const { GoogleOAuth } = await import('../../src/auth/oauth');
      const { TokenStorage } = await import('../../src/auth/storage');

      vi.mocked(consumeState).mockResolvedValue('user123');
      
      const mockOAuth = {
        exchangeCodeForTokens: vi.fn().mockResolvedValue({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
      };
      vi.mocked(GoogleOAuth).mockImplementation(() => mockOAuth as any);

      const mockStorage = {
        storeTokens: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(TokenStorage).mockImplementation(() => mockStorage as any);

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      const body = await response.json();
      expect(body.token).toBeDefined();
      expect(mockOAuth.exchangeCodeForTokens).toHaveBeenCalledWith('auth-code');
      expect(mockStorage.storeTokens).toHaveBeenCalled();
    });
  });

  describe('MCP endpoint', () => {
    it('should handle MCP POST request with valid auth', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test',
          method: 'tools/list',
        }),
      });

      // Mock validation and dependencies
      const { validateRequest } = await import('../../src/utils/validation');
      const { RateLimiter } = await import('../../src/utils/rate-limit');
      const { SSETransport } = await import('../../src/mcp/transport');
      const { MCPServer } = await import('../../src/mcp/server');

      vi.mocked(validateRequest).mockResolvedValue('user123');

      const mockRateLimiter = {
        checkLimit: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(RateLimiter).mockImplementation(() => mockRateLimiter as any);

      const mockTransport = {
        getResponse: vi.fn().mockImplementation((headers) => {
          return new Response('SSE response', {
            headers: {
              'Content-Type': 'text/event-stream',
              ...headers
            }
          });
        }),
      };
      vi.mocked(SSETransport).mockImplementation(() => mockTransport as any);

      const mockServer = {
        initialize: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(MCPServer).mockImplementation(() => mockServer as any);

      const response = await defaultExport.fetch(request, mockEnv);

      expect(vi.mocked(validateRequest)).toHaveBeenCalledWith('Bearer valid-jwt-token', mockEnv.JWT_SECRET);
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('user123');
      expect(mockServer.initialize).toHaveBeenCalled();
      expect(mockServer.handleRequest).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test',
        method: 'tools/list',
      });
    });

    it('should allow unauthenticated access to initialize and tools/list', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test',
          method: 'initialize',
        }),
      });

      // Mock dependencies
      const { SSETransport } = await import('../../src/mcp/transport');
      const { MCPServer } = await import('../../src/mcp/server');
      const { RateLimiter } = await import('../../src/utils/rate-limit');

      const mockRateLimiter = {
        checkLimit: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(RateLimiter).mockImplementation(() => mockRateLimiter as any);

      const mockTransport = {
        getResponse: vi.fn().mockImplementation((headers) => {
          return new Response('SSE response', {
            headers: {
              'Content-Type': 'text/event-stream',
              ...headers
            }
          });
        }),
      };
      vi.mocked(SSETransport).mockImplementation(() => mockTransport as any);

      const mockServer = {
        initialize: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(MCPServer).mockImplementation(() => mockServer as any);

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      // Verify security headers are included
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
      expect(mockServer.initialize).toHaveBeenCalled();
      expect(mockServer.handleRequest).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test',
        method: 'initialize',
      });
    });

    it('should return 401 for invalid JWT token', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test',
          method: 'tools/call',
          params: {
            name: 'gmail_list',
            arguments: {}
          }
        }),
      });

      // Mock JWT validation failure
      const { validateRequest, JWTError } = await import('../../src/utils/validation');
      vi.mocked(validateRequest).mockRejectedValue(new JWTError('INVALID_SIGNATURE', 'Invalid signature'));

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Invalid or expired token');
    });

    it('should require authorization for tools/call', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test',
          method: 'tools/call',
          params: {
            name: 'gmail_list',
            arguments: {}
          }
        }),
      });

      // Mock dependencies
      const { SSETransport } = await import('../../src/mcp/transport');
      const { MCPServer } = await import('../../src/mcp/server');
      const { RateLimiter } = await import('../../src/utils/rate-limit');

      const mockRateLimiter = {
        checkLimit: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(RateLimiter).mockImplementation(() => mockRateLimiter as any);

      const mockTransport = {
        getResponse: vi.fn().mockImplementation((headers) => {
          return new Response('SSE response', {
            headers: {
              'Content-Type': 'text/event-stream',
              ...headers
            }
          });
        }),
      };
      vi.mocked(SSETransport).mockImplementation(() => mockTransport as any);

      const mockServer = {
        initialize: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(MCPServer).mockImplementation(() => mockServer as any);

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(200); // Returns 200 with SSE stream containing auth URL
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      // Verify security headers are included for unauthenticated SSE
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
      // Verify the server was created in unauthenticated mode (5th parameter = true)
      expect(vi.mocked(MCPServer)).toHaveBeenCalledWith(
        expect.anything(), // transport
        mockEnv,
        expect.any(String), // sessionId
        expect.anything(), // logger
        true, // isUnauthenticated
        'https://example.com/mcp' // requestUrl
      );
    });

    it('should reject MCP request when rate limited', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      // Mock validation and rate limiting
      const { validateRequest } = await import('../../src/utils/validation');
      const { RateLimiter } = await import('../../src/utils/rate-limit');

      vi.mocked(validateRequest).mockResolvedValue('user123');

      const mockRateLimiter = {
        checkLimit: vi.fn().mockResolvedValue(false), // Rate limited
      };
      vi.mocked(RateLimiter).mockImplementation(() => mockRateLimiter as any);

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(429);
      expect(await response.text()).toBe('Rate limit exceeded');
      expect(response.headers.get('Retry-After')).toBe('60');
    });

    it('should handle invalid JSON in MCP request', async () => {
      const request = new Request('https://example.com/mcp', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid-jwt-token',
          'Content-Type': 'application/json',
        },
        body: 'invalid json{',
      });

      // Mock validation and rate limiting
      const { validateRequest } = await import('../../src/utils/validation');
      const { RateLimiter } = await import('../../src/utils/rate-limit');

      vi.mocked(validateRequest).mockResolvedValue('user123');

      const mockRateLimiter = {
        checkLimit: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(RateLimiter).mockImplementation(() => mockRateLimiter as any);

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid JSON in request body');
    });
  });

  describe('Error handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      const request = new Request('https://example.com/oauth/authorize?user_id=test', {
        method: 'GET',
        headers: {
          'CF-Connecting-IP': '192.168.1.1',
        },
      });

      // Mock createState to return null (rate limited), which will trigger an error condition
      const { createState } = await import('../../src/auth/state');
      const { GoogleOAuth } = await import('../../src/auth/oauth');
      
      vi.mocked(createState).mockResolvedValue(null); // Rate limited
      
      // Mock GoogleOAuth so it doesn't cause issues
      const mockOAuth = {
        getAuthorizationUrl: vi.fn().mockReturnValue('https://accounts.google.com/oauth/authorize'),
      };
      vi.mocked(GoogleOAuth).mockImplementation(() => mockOAuth as any);

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(429);
      expect(await response.text()).toBe('Too many authorization attempts');
    });

    it('should include security headers in error responses', async () => {
      const request = new Request('https://example.com/unknown', {
        method: 'GET',
      });

      const response = await defaultExport.fetch(request, mockEnv);

      expect(response.status).toBe(404);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    });
  });
});