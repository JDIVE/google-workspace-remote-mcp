# Security Policy

## Supported Versions

As this project is in early development, security updates will be applied to the latest version only.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### 1. Do NOT Create a Public Issue

Security vulnerabilities should not be reported through public GitHub issues as this could put users at risk.

### 2. Report Privately

Please report security vulnerabilities by:

- Email: [Create a security contact email or use GitHub Security Advisories]
- GitHub Security Advisories: [Enable in repository settings]

### 3. Include in Your Report

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)
- Your contact information

### 4. Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 5 business days
- **Fix Timeline**: Depends on severity
  - Critical: 1-3 days
  - High: 1 week
  - Medium: 2-4 weeks
  - Low: Next regular release

## Security Best Practices

When contributing to this project, please follow these security guidelines:

### Authentication & Authorization
- Never commit credentials, tokens, or secrets
- Use environment variables for sensitive configuration
- Implement proper token validation (see issue #2)
- Follow OAuth 2.0 best practices

### Data Protection
- Encrypt sensitive data at rest (tokens in KV storage)
- Use HTTPS for all external communications
- Implement proper CORS policies
- Validate and sanitize all user inputs

### Dependency Management
- Keep dependencies up to date
- Review dependency licenses
- Audit for known vulnerabilities regularly
- Use exact versions in production

### Code Review
- All code must be reviewed before merging
- Security-sensitive changes require additional review
- Test authorization logic thoroughly
- Document security assumptions

## Known Security Considerations

### Current Implementation Status
- **JWT Validation**: Currently using placeholder (see issue #2) - MUST be fixed before production
- **CSRF Protection**: Needs implementation (see issue #3)
- **Key Rotation**: Process needs documentation (see issue #5)

### Google Workspace API Security
- Follows Google OAuth 2.0 implementation
- Scopes limited to required APIs only
- Tokens stored encrypted in Cloudflare KV
- Automatic token refresh implemented

### Cloudflare Worker Security
- Runs in isolated V8 environment
- No file system access
- Request size limits enforced
- Automatic DDoS protection

## Security Headers

The following security headers are implemented:
```typescript
'X-Content-Type-Options': 'nosniff'
'X-Frame-Options': 'DENY'
'X-XSS-Protection': '1; mode=block'
'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
'Content-Security-Policy': "default-src 'self'"
```

## Rate Limiting

- Default: 100 requests per minute per user
- OAuth endpoints: 10 requests per minute per IP
- Configurable per deployment

## Audit Log

Major security-related changes:
- [Date when implemented] - Initial security policy
- [Future dates] - Security improvements as implemented

## Contact

For security concerns, contact:
- GitHub Security Advisories (preferred)
- Project maintainers through GitHub

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who:
- Follow this policy
- Give us reasonable time to fix issues
- Don't exploit vulnerabilities beyond POC

Thank you for helping keep our users safe!