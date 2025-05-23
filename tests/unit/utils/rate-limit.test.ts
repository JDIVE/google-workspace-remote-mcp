import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../../src/utils/rate-limit';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let mockKV: any;

  beforeEach(() => {
    mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    rateLimiter = new RateLimiter(mockKV);
  });

  describe('checkLimit', () => {
    it('should allow first request for new user', async () => {
      mockKV.get.mockResolvedValue(null); // No existing count
      mockKV.put.mockResolvedValue(undefined);

      const result = await rateLimiter.checkLimit('user123');

      expect(result).toBe(true);
      expect(mockKV.get).toHaveBeenCalledWith('rate:user123');
      expect(mockKV.put).toHaveBeenCalledWith(
        'rate:user123',
        '1',
        { expirationTtl: 60 }
      );
    });

    it('should increment counter for existing user', async () => {
      mockKV.get.mockResolvedValue('5'); // Existing count
      mockKV.put.mockResolvedValue(undefined);

      const result = await rateLimiter.checkLimit('user123');

      expect(result).toBe(true);
      expect(mockKV.put).toHaveBeenCalledWith(
        'rate:user123',
        '6',
        { expirationTtl: 60 }
      );
    });

    it('should reject request when limit reached', async () => {
      mockKV.get.mockResolvedValue('100'); // At limit
      mockKV.put.mockResolvedValue(undefined);

      const result = await rateLimiter.checkLimit('user123');

      expect(result).toBe(false);
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('should reject request when limit exceeded', async () => {
      mockKV.get.mockResolvedValue('101'); // Over limit
      mockKV.put.mockResolvedValue(undefined);

      const result = await rateLimiter.checkLimit('user123');

      expect(result).toBe(false);
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('should handle exactly at limit minus one', async () => {
      mockKV.get.mockResolvedValue('99'); // One below limit
      mockKV.put.mockResolvedValue(undefined);

      const result = await rateLimiter.checkLimit('user123');

      expect(result).toBe(true);
      expect(mockKV.put).toHaveBeenCalledWith(
        'rate:user123',
        '100',
        { expirationTtl: 60 }
      );
    });

    it('should handle invalid count strings gracefully', async () => {
      mockKV.get.mockResolvedValue('invalid'); // Invalid number
      mockKV.put.mockResolvedValue(undefined);

      const result = await rateLimiter.checkLimit('user123');

      expect(result).toBe(true);
      // Should treat NaN as 0 and increment to 1
      expect(mockKV.put).toHaveBeenCalledWith(
        'rate:user123',
        '1',
        { expirationTtl: 60 }
      );
    });

    it('should handle empty string count', async () => {
      mockKV.get.mockResolvedValue(''); // Empty string
      mockKV.put.mockResolvedValue(undefined);

      const result = await rateLimiter.checkLimit('user123');

      expect(result).toBe(true);
      expect(mockKV.put).toHaveBeenCalledWith(
        'rate:user123',
        '1',
        { expirationTtl: 60 }
      );
    });
  });

  describe('getRemainingRequests', () => {
    it('should return max requests for new user', async () => {
      mockKV.get.mockResolvedValue(null);

      const remaining = await rateLimiter.getRemainingRequests('user123');

      expect(remaining).toBe(100);
      expect(mockKV.get).toHaveBeenCalledWith('rate:user123');
    });

    it('should calculate remaining requests correctly', async () => {
      mockKV.get.mockResolvedValue('25');

      const remaining = await rateLimiter.getRemainingRequests('user123');

      expect(remaining).toBe(75); // 100 - 25
    });

    it('should return 0 when at limit', async () => {
      mockKV.get.mockResolvedValue('100');

      const remaining = await rateLimiter.getRemainingRequests('user123');

      expect(remaining).toBe(0);
    });

    it('should return 0 when over limit', async () => {
      mockKV.get.mockResolvedValue('150');

      const remaining = await rateLimiter.getRemainingRequests('user123');

      expect(remaining).toBe(0);
    });

    it('should handle invalid count strings', async () => {
      mockKV.get.mockResolvedValue('invalid');

      const remaining = await rateLimiter.getRemainingRequests('user123');

      expect(remaining).toBe(100); // Should default to max when NaN (|| 0 converts NaN to 0)
    });
  });

  describe('resetLimit', () => {
    it('should delete the rate limit key', async () => {
      mockKV.delete.mockResolvedValue(undefined);

      await rateLimiter.resetLimit('user123');

      expect(mockKV.delete).toHaveBeenCalledWith('rate:user123');
    });

    it('should not throw if key does not exist', async () => {
      mockKV.delete.mockResolvedValue(undefined);

      await expect(rateLimiter.resetLimit('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('rate limiting constants', () => {
    it('should use correct window size and max requests', async () => {
      // Test that the constants are set correctly
      // We can't directly test private static readonly properties,
      // but we can verify their behavior through the methods
      
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      await rateLimiter.checkLimit('user123');

      expect(mockKV.put).toHaveBeenCalledWith(
        'rate:user123',
        '1',
        { expirationTtl: 60 } // WINDOW_SIZE = 60 seconds
      );
    });
  });

  describe('concurrent access simulation', () => {
    it('should handle multiple rapid requests correctly', async () => {
      // Since the requests run concurrently, they'll all see the same initial count
      // This simulates the race condition behavior in real KV systems
      mockKV.get.mockResolvedValue(null); // All requests see no existing count
      mockKV.put.mockResolvedValue(undefined);

      // Simulate 5 rapid requests
      const results = await Promise.all([
        rateLimiter.checkLimit('user123'),
        rateLimiter.checkLimit('user123'),
        rateLimiter.checkLimit('user123'),
        rateLimiter.checkLimit('user123'),
        rateLimiter.checkLimit('user123'),
      ]);

      // All should be allowed as they all start from 0
      expect(results).toEqual([true, true, true, true, true]);
      expect(mockKV.put).toHaveBeenCalledTimes(5);
    });
  });
});