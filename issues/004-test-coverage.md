# 4. Improve Test Coverage

## Description
The test suite currently includes only a single unit test for the logger utility. Core components such as token management, OAuth handlers and tool execution lack tests.

## Suggested Fixes
Add unit and integration tests covering:
- Token refresh logic in `TokenManager`
- OAuth authorization and callback handlers
- Tool handlers for Gmail, Calendar, Drive and People APIs

## Files
- `tests/`
