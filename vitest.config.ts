import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Will be switched to miniflare once we have build output
    // environment: 'miniflare',
    // environmentOptions: {
    //   kvNamespaces: ['OAUTH_TOKENS', 'OAUTH_STATE', 'RATE_LIMITS'],
    //   bindings: {
    //     GOOGLE_CLIENT_ID: 'test-client-id',
    //     GOOGLE_CLIENT_SECRET: 'test-client-secret',
    //     ENCRYPTION_KEY: 'test-encryption-key-32-chars-long',
    //     JWT_SECRET: 'test-jwt-secret-for-testing-only',
    //     ALLOWED_ORIGINS: 'http://localhost:3000'
    //   }
    // }
  }
});