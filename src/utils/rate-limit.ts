export class RateLimiter {
  private static readonly WINDOW_SIZE = 60; // 1 minute
  private static readonly MAX_REQUESTS = 100; // per window

  constructor(private kvNamespace: KVNamespace) {}

  async checkLimit(userId: string): Promise<boolean> {
    const key = `rate:${userId}`;
    const now = Date.now();
    const windowStart = now - (this.constructor as typeof RateLimiter).WINDOW_SIZE * 1000;

    // Get current count
    const data = await this.kvNamespace.get(key);
    let requests: number[] = [];
    
    if (data) {
      try {
        requests = JSON.parse(data);
        // Filter out old requests
        requests = requests.filter(timestamp => timestamp > windowStart);
      } catch {
        requests = [];
      }
    }

    // Check if limit exceeded
    if (requests.length >= (this.constructor as typeof RateLimiter).MAX_REQUESTS) {
      return false;
    }

    // Add current request
    requests.push(now);

    // Store updated count with TTL
    await this.kvNamespace.put(
      key, 
      JSON.stringify(requests),
      { expirationTtl: (this.constructor as typeof RateLimiter).WINDOW_SIZE }
    );

    return true;
  }

  async getRemainingRequests(userId: string): Promise<number> {
    const key = `rate:${userId}`;
    const now = Date.now();
    const windowStart = now - (this.constructor as typeof RateLimiter).WINDOW_SIZE * 1000;

    const data = await this.kvNamespace.get(key);
    if (!data) {
      return (this.constructor as typeof RateLimiter).MAX_REQUESTS;
    }

    try {
      const requests: number[] = JSON.parse(data);
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      return Math.max(0, (this.constructor as typeof RateLimiter).MAX_REQUESTS - validRequests.length);
    } catch {
      return (this.constructor as typeof RateLimiter).MAX_REQUESTS;
    }
  }
}