# Error Handling Guide

This document describes how to surface errors to MCP clients and how to gracefully handle common Google API failures.

## 1. Categorising Google API Errors

Handle errors based on the HTTP status code returned by the Google Workspace API:

| Status | Meaning | Recommended Action |
|-------|---------|-------------------|
| `401` | Unauthorized / token invalid | Refresh the access token. If refresh fails, notify the user to re-authorise. |
| `403` | Permission denied | Inform the user that the requested operation is not allowed. |
| `429` | Rate limit exceeded | Retry the request using exponential backoff. |
| `5xx` | Server error | Retry with backoff and surface a generic failure message if the problem persists. |

Use the utility function defined in `src/utils/errors.ts` to map these errors to `MCPError` instances:

```typescript
export function handleGoogleAPIError(error: any): MCPError {
  if (error.response?.status === 401) {
    return new MCPError(-32001, 'Authentication required');
  } else if (error.response?.status === 403) {
    return new MCPError(-32002, 'Permission denied');
  } else if (error.response?.status === 429) {
    return new MCPError(-32003, 'Rate limit exceeded');
  }
  return new MCPError(-32603, 'Internal server error', error.message);
}
```

## 2. Retry Logic

Transient failures such as `429` or `5xx` errors should be retried automatically. Use exponential backoff with jitter to avoid thundering herd problems:

```typescript
async function retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === retries - 1 || ![429, 500, 502, 503, 504].includes(error.response?.status)) {
        throw error;
      }
      const delay = Math.pow(2, i) * 1000 + Math.random() * 100;
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('Retry failed');
}
```

## 3. User Notifications for Expired Tokens

When a refresh token becomes invalid or the user revokes access, API calls will start returning `401` errors. After a failed refresh attempt, send a notification to the client so the user can re-authorise:

```typescript
if (error.response?.status === 401) {
  const refreshed = await refreshAndGetToken(env, userId).catch(() => null);
  if (!refreshed) {
    await sendEvent(userId, { type: 'auth_error', message: 'Please reconnect your Google account.' });
    throw new AuthError('Re-authorization required');
  }
}
```

Clients should display a clear message directing the user to reconnect their account through the OAuth flow.

---

Following these guidelines ensures consistent error responses and a better user experience when problems occur.
