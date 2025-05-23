# 1. Improve Type Safety and Error Handling

## Description
- `handleMCPRequest` parses the request body without a try/catch block. Malformed JSON causes a generic 500 error.
- `TokenManager.getAuthClient` does not set `expiry_date` on OAuth credentials, preventing automatic token refresh.

## Suggested Fixes
- Validate and handle JSON parsing errors in `src/index.ts` before calling `server.handleRequest`.
- Include `expiry_date` when setting credentials in `src/auth/tokens.ts` so the Google client can refresh tokens automatically.

## Files
- `src/index.ts`
- `src/auth/tokens.ts`
