import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateJWT,
  validateRequest,
  JWTExpiredError,
  JWTInvalidSignatureError,
  JWTMalformedError,
} from '../../../src/utils/validation';

describe('JWT Validation', () => {
  const SECRET = 'test-secret-key';
  let validToken: string;

  beforeEach(async () => {
    // Create a valid JWT for testing
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: 'test-user-123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '');
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '');
    const message = `${headerB64}.${payloadB64}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    validToken = `${headerB64}.${payloadB64}.${signatureB64}`;
  });

  describe('validateJWT', () => {
    it('should validate a valid JWT', async () => {
      const userId = await validateJWT(validToken, SECRET);
      expect(userId).toBe('test-user-123');
    });

    it('should reject malformed JWT with wrong number of parts', async () => {
      await expect(validateJWT('invalid.token', SECRET)).rejects.toThrow(
        JWTMalformedError
      );
      await expect(validateJWT('invalid.token.with.too.many.parts', SECRET)).rejects.toThrow(
        JWTMalformedError
      );
    });

    it('should reject JWT with invalid base64 encoding', async () => {
      await expect(validateJWT('invalid.invalid.invalid', SECRET)).rejects.toThrow(
        JWTMalformedError
      );
    });

    it('should reject JWT with unsupported algorithm', async () => {
      const header = { alg: 'RS256', typ: 'JWT' };
      const payload = { sub: 'test-user', iat: Math.floor(Date.now() / 1000) };
      const headerB64 = btoa(JSON.stringify(header));
      const payloadB64 = btoa(JSON.stringify(payload));
      const invalidToken = `${headerB64}.${payloadB64}.invalid`;

      await expect(validateJWT(invalidToken, SECRET)).rejects.toThrow(
        JWTMalformedError
      );
    });

    it('should reject JWT with invalid signature', async () => {
      const parts = validToken.split('.');
      const invalidToken = `${parts[0]}.${parts[1]}.invalid-signature`;

      await expect(validateJWT(invalidToken, SECRET)).rejects.toThrow();
    });

    it('should reject expired JWT', async () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = {
        sub: 'test-user-123',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
      };

      const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '');
      const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '');
      const message = `${headerB64}.${payloadB64}`;

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
      const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const expiredToken = `${headerB64}.${payloadB64}.${signatureB64}`;

      await expect(validateJWT(expiredToken, SECRET)).rejects.toThrow(
        JWTExpiredError
      );
    });

    it('should reject JWT without sub claim', async () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = {
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '');
      const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '');
      const message = `${headerB64}.${payloadB64}`;

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
      const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const tokenWithoutSub = `${headerB64}.${payloadB64}.${signatureB64}`;

      await expect(validateJWT(tokenWithoutSub, SECRET)).rejects.toThrow(
        JWTMalformedError
      );
    });
  });

  describe('validateRequest', () => {
    it('should validate valid authorization header', async () => {
      const authHeader = `Bearer ${validToken}`;
      const userId = await validateRequest(authHeader, SECRET);
      expect(userId).toBe('test-user-123');
    });

    it('should reject missing Bearer prefix', async () => {
      await expect(validateRequest(validToken, SECRET)).rejects.toThrow(
        JWTMalformedError
      );
    });

    it('should reject invalid token in authorization header', async () => {
      const authHeader = 'Bearer invalid.token.here';
      await expect(validateRequest(authHeader, SECRET)).rejects.toThrow(
        JWTMalformedError
      );
    });

    it('should handle missing JWT secret', async () => {
      const authHeader = `Bearer ${validToken}`;
      const userId = await validateRequest(authHeader, '');
      expect(userId).toBeNull();
    });
  });
});