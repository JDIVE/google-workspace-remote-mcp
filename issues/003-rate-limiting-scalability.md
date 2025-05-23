# 3. Rate Limiting Scalability

## Description
`RateLimiter` stores an array of timestamps for each user in KV (`src/utils/rate-limit.ts`). For high traffic users this array can grow quickly and degrade performance.

## Suggested Fixes
Consider switching to a simple counter with a rolling window expiration, or using a token bucket algorithm, to reduce storage and processing overhead.

## Files
- `src/utils/rate-limit.ts`
