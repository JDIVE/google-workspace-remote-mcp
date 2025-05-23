# Testing Quick Start Guide

## Essential Commands

```bash
# Install dependencies
npm ci

# Run all tests (watch mode - press 'q' to quit)
npm test

# Run tests once and exit
npm run test:run

# Run with coverage report
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Run everything (CI pipeline)
npm run ci
```

## Exiting Watch Mode

When running `npm test`, Vitest starts in watch mode:
- Press **`q`** to quit
- Press **`a`** to run all tests
- Press **`f`** to run only failed tests
- Press **`t`** to filter by test name pattern

## Test Categories

```bash
# Security tests
npm test tests/unit/auth/
npm test tests/unit/utils/validation.test.ts
npm test tests/unit/utils/encryption.test.ts

# Core functionality
npm test tests/unit/mcp/
npm test tests/unit/index.test.ts

# Utilities
npm test tests/unit/utils/
```

## Coverage Report

After running `npm run test:coverage`:
- Text report appears in terminal
- HTML report available in `./coverage/index.html`
- JSON report in `./coverage/coverage-final.json`

## Current Status

- ✅ **89 tests passing**
- ✅ **100% pass rate**  
- ✅ **Comprehensive security coverage**
- ✅ **Coverage tracking enabled**
- ✅ **Linting configured**

## Troubleshooting

**Tests stuck in watch mode?**
- Press `q` to quit, or use `npm run test:run` for single execution

**Coverage fails?**
- Ensure `@vitest/coverage-v8` is installed: `npm install`

**Linting errors?**
- Auto-fix: `npm run lint:fix`
- Check formatting: `npm run format:check`

**TypeScript errors?**
- Run: `npm run typecheck` for detailed error information