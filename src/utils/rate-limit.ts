export class RateLimiter {
  private static readonly WINDOW_SIZE = 60; // 1 minute
  private static readonly MAX_REQUESTS = 100; // per window

  constructor(private kvNamespace: KVNamespace) {}

  async checkLimit(userId: string): Promise<boolean> {
    const key = `rate:${userId}`;

    // Get current count
    const countStr = await this.kvNamespace.get(key);
    const currentCount = countStr ? parseInt(countStr, 10) || 0 : 0;

    // Check if limit exceeded
    if (currentCount >= (this.constructor as typeof RateLimiter).MAX_REQUESTS) {
      return false;
    }

    // Increment counter with TTL
    await this.kvNamespace.put(key, (currentCount + 1).toString(), {
      expirationTtl: (this.constructor as typeof RateLimiter).WINDOW_SIZE,
    });

    return true;
  }

  async getRemainingRequests(userId: string): Promise<number> {
    const key = `rate:${userId}`;

    const countStr = await this.kvNamespace.get(key);
    const currentCount = countStr ? parseInt(countStr, 10) || 0 : 0;

    return Math.max(
      0,
      (this.constructor as typeof RateLimiter).MAX_REQUESTS - currentCount,
    );
  }

  async resetLimit(userId: string): Promise<void> {
    const key = `rate:${userId}`;
    await this.kvNamespace.delete(key);
  }
}
