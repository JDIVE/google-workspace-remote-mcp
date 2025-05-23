# Project Review

This document summarizes suggested improvements for the Google Workspace Remote MCP Server based on the current planning documentation.

## Security Improvements

- **Validate Authorization Tokens**: Tokens are now verified in `src/utils/validation.ts` using HMAC-SHA256 with the `JWT_SECRET` environment variable.
- **CSRF Protection**: The implementation plan mentions CSRF protection but does not describe a concrete approach. Add state parameter checks and possibly double-submit tokens in the OAuth flow.
- **Key Rotation**: Document a process for rotating the `ENCRYPTION_KEY` used for token encryption and ensure old tokens are re-encrypted or invalidated.
- **Scope Minimization**: Ensure that OAuth scopes are restricted to Gmail, Calendar, Drive and People APIs only. Review `OAUTH_SETUP.md` and `IMPLEMENTATION_PLAN.md` to confirm that no additional scopes are requested.

## Operational Considerations

- **Monitoring and Logging**: Expand the logging plan defined in `TECHNICAL_REQUIREMENTS.md` to include structured logs for OAuth and tool usage. Consider using Cloudflare Logpush or a third-party service.
- **Error Handling**: Provide clearer instructions for handling Google API errors and user-facing messages. Include retry logic guidelines and user notifications when tokens expire.
- **Rate Limiting**: Document expected rate limits and clarify how to tune `maxRequests` and `windowMs` in `RateLimiter` for production.
- **Testing**: The testing plan is comprehensive. Ensure integration tests mock Google APIs to avoid accidental real requests.

## Documentation Updates

- **Clarify People API Usage**: Rename references from "Contacts" to "People" where appropriate to match Google API naming.
- **Add Example Configuration**: Include a sample `wrangler.toml` and `.dev.vars` file with placeholder values to help new contributors set up the project quickly.
- **Expand Deployment Guide**: Provide instructions for staging environments and how to perform blue/green deployments or rollbacks using Wrangler.

These suggestions aim to make the project more secure and maintainable without changing the current planned functionality.
