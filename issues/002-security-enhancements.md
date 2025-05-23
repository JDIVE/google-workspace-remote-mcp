# 2. Security Enhancements

## Description
- `consumeState` in `src/auth/state.ts` uses `console.warn` for CSRF warnings instead of the structured `Logger` class.
- `handleMCPRequest` returns only CORS headers for SSE responses and omits other security headers that are used elsewhere in the worker.

## Suggested Fixes
- Replace `console.warn` calls in `consumeState` with `Logger.warn` for consistent structured logging.
- Ensure security headers (`X-Content-Type-Options`, `X-Frame-Options`, etc.) are included in the response from `handleMCPRequest`.

## Files
- `src/auth/state.ts`
- `src/index.ts`
