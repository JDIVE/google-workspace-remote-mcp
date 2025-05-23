import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createState, consumeState } from '../../../src/auth/state';
import { Env } from '../../../src/index';

describe('CSRF State Management', () => {
  let mockEnv: Env;
  let mockRateLimits: any;
  let mockOAuthState: any;

  beforeEach(() => {
    mockRateLimits = {
      get: vi.fn(),
      put: vi.fn(),
    };

    mockOAuthState = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    mockEnv = {
      OAUTH_TOKENS: {} as KVNamespace,
      OAUTH_STATE: mockOAuthState,
      RATE_LIMITS: mockRateLimits,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      ENCRYPTION_KEY: 'test-encryption-key',
      JWT_SECRET: 'test-jwt-secret',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };

    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      ...global.crypto,
      randomUUID: vi.fn(() => 'mock-uuid-12345'),
    });
  });

  describe('createState', () => {
    it('should create and store new state', async () => {
      mockRateLimits.get.mockResolvedValue(null); // No existing rate limit
      mockOAuthState.put.mockResolvedValue(undefined);

      const state = await createState(mockEnv, 'user123', '192.168.1.1');

      expect(state).toBe('mock-uuid-12345');
      expect(mockRateLimits.get).toHaveBeenCalledWith('state:192.168.1.1');
      expect(mockRateLimits.put).toHaveBeenCalledWith(
        'state:192.168.1.1',
        '1',
        { expirationTtl: 300 }
      );
      expect(mockOAuthState.put).toHaveBeenCalledWith(
        'mock-uuid-12345',
        'user123',
        { expirationTtl: 300 }
      );
    });

    it('should increment rate limit counter', async () => {
      mockRateLimits.get.mockResolvedValue('5'); // Existing count
      mockOAuthState.put.mockResolvedValue(undefined);

      const state = await createState(mockEnv, 'user123', '192.168.1.1');

      expect(state).toBe('mock-uuid-12345');
      expect(mockRateLimits.put).toHaveBeenCalledWith(
        'state:192.168.1.1',
        '6',
        { expirationTtl: 300 }
      );
    });

    it('should return null when rate limit exceeded', async () => {
      mockRateLimits.get.mockResolvedValue('11'); // Exceeds limit of 10

      const state = await createState(mockEnv, 'user123', '192.168.1.1');

      expect(state).toBeNull();
      expect(mockRateLimits.put).not.toHaveBeenCalled();
      expect(mockOAuthState.put).not.toHaveBeenCalled();
    });

    it('should handle exactly at rate limit', async () => {
      mockRateLimits.get.mockResolvedValue('11'); // Over limit (limit is > 10)

      const state = await createState(mockEnv, 'user123', '192.168.1.1');

      expect(state).toBeNull();
      expect(mockRateLimits.put).not.toHaveBeenCalled();
      expect(mockOAuthState.put).not.toHaveBeenCalled();
    });
  });

  describe('consumeState', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should consume valid state and return user ID', async () => {
      mockOAuthState.get.mockResolvedValue('user123');
      mockOAuthState.delete.mockResolvedValue(undefined);

      const userId = await consumeState(mockEnv, 'valid-state-token', 'req-123');

      expect(userId).toBe('user123');
      expect(mockOAuthState.get).toHaveBeenCalledWith('valid-state-token');
      expect(mockOAuthState.delete).toHaveBeenCalledWith('valid-state-token');
    });

    it('should return null when state is null', async () => {
      const userId = await consumeState(mockEnv, null, 'req-123');

      expect(userId).toBeNull();
      expect(mockOAuthState.get).not.toHaveBeenCalled();
      expect(mockOAuthState.delete).not.toHaveBeenCalled();
      
      // Check that warning was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CSRF validation failed: no state provided')
      );
    });

    it('should return null when state is empty string', async () => {
      const userId = await consumeState(mockEnv, '', 'req-123');

      expect(userId).toBeNull();
      expect(mockOAuthState.get).not.toHaveBeenCalled();
      expect(mockOAuthState.delete).not.toHaveBeenCalled();
      
      // Check that warning was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CSRF validation failed: no state provided')
      );
    });

    it('should return null and log warning for invalid state token', async () => {
      mockOAuthState.get.mockResolvedValue(null); // Invalid state token

      const userId = await consumeState(mockEnv, 'invalid-state-token', 'req-123');

      expect(userId).toBeNull();
      expect(mockOAuthState.get).toHaveBeenCalledWith('invalid-state-token');
      expect(mockOAuthState.delete).not.toHaveBeenCalled();
      
      // Check that warning was logged with partial state
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CSRF validation failed: invalid state token')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid-...')
      );
    });

    it('should delete state even when valid', async () => {
      mockOAuthState.get.mockResolvedValue('user456');
      mockOAuthState.delete.mockResolvedValue(undefined);

      const userId = await consumeState(mockEnv, 'one-time-state', 'req-456');

      expect(userId).toBe('user456');
      expect(mockOAuthState.delete).toHaveBeenCalledWith('one-time-state');
    });

    it('should handle long state tokens in logging', async () => {
      const longState = 'very-long-state-token-that-should-be-truncated-in-logs';
      mockOAuthState.get.mockResolvedValue(null);

      const userId = await consumeState(mockEnv, longState, 'req-789');

      expect(userId).toBeNull();
      
      // Check that state was truncated to first 8 characters + '...'
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('very-lon...')
      );
    });
  });
});