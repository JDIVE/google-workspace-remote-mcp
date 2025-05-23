import assert from 'assert/strict';
import { test } from 'node:test';
import {
  validateRequest,
  JWTExpiredError,
  JWTNotYetValidError,
  JWTInvalidSignatureError,
  JWTMalformedError,
} from '../src/utils/validation';
import { createHmac } from 'crypto';
import { Buffer } from 'buffer';

function signToken(payload: Record<string, any>, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${headerB64}.${payloadB64}`;
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

test('validateRequest returns user id for valid token', () => {
  process.env.JWT_SECRET = 'testsecret';
  const token = signToken({ sub: 'user1', exp: Math.floor(Date.now() / 1000) + 60 }, 'testsecret');
  const header = `Bearer ${token}`;
  assert.equal(validateRequest(header), 'user1');
});

test('validateRequest throws JWTInvalidSignatureError for invalid signature', () => {
  process.env.JWT_SECRET = 'testsecret';
  const token = signToken({ sub: 'user1', exp: Math.floor(Date.now() / 1000) + 60 }, 'wrong');
  const header = `Bearer ${token}`;
  assert.throws(() => validateRequest(header), JWTInvalidSignatureError);
});

test('validateRequest throws JWTExpiredError for expired token', () => {
  process.env.JWT_SECRET = 'testsecret';
  const token = signToken({ sub: 'user1', exp: Math.floor(Date.now() / 1000) - 10 }, 'testsecret');
  const header = `Bearer ${token}`;
  assert.throws(() => validateRequest(header), JWTExpiredError);
});

test('validateRequest validates nbf claim', () => {
  process.env.JWT_SECRET = 'testsecret';
  const futureTime = Math.floor(Date.now() / 1000) + 60;
  const token = signToken({ sub: 'user1', nbf: futureTime }, 'testsecret');
  const header = `Bearer ${token}`;
  assert.throws(() => validateRequest(header), JWTNotYetValidError);
});

test('validateRequest accepts valid nbf claim', () => {
  process.env.JWT_SECRET = 'testsecret';
  const pastTime = Math.floor(Date.now() / 1000) - 60;
  const token = signToken({ sub: 'user1', nbf: pastTime }, 'testsecret');
  const header = `Bearer ${token}`;
  assert.equal(validateRequest(header), 'user1');
});

test('validateRequest validates iat claim', () => {
  process.env.JWT_SECRET = 'testsecret';
  const futureTime = Math.floor(Date.now() / 1000) + 60;
  const token = signToken({ sub: 'user1', iat: futureTime }, 'testsecret');
  const header = `Bearer ${token}`;
  assert.throws(() => validateRequest(header), JWTNotYetValidError);
});

test('validateRequest throws JWTMalformedError for malformed token', () => {
  process.env.JWT_SECRET = 'testsecret';
  const header = 'Bearer invalid.token';
  assert.throws(() => validateRequest(header), JWTMalformedError);
});

test('validateRequest throws JWTMalformedError for missing Bearer prefix', () => {
  process.env.JWT_SECRET = 'testsecret';
  const token = signToken({ sub: 'user1' }, 'testsecret');
  assert.throws(() => validateRequest(token), JWTMalformedError);
});

test('validateRequest throws JWTMalformedError for missing sub claim', () => {
  process.env.JWT_SECRET = 'testsecret';
  const token = signToken({ exp: Math.floor(Date.now() / 1000) + 60 }, 'testsecret');
  const header = `Bearer ${token}`;
  assert.throws(() => validateRequest(header), JWTMalformedError);
});

test('validateRequest respects clockTolerance option', () => {
  process.env.JWT_SECRET = 'testsecret';
  const expiredTime = Math.floor(Date.now() / 1000) - 5;
  const token = signToken({ sub: 'user1', exp: expiredTime }, 'testsecret');
  const header = `Bearer ${token}`;
  
  // Should throw without tolerance
  assert.throws(() => validateRequest(header), JWTExpiredError);
  
  // Should pass with tolerance
  assert.equal(validateRequest(header, { clockTolerance: 10 }), 'user1');
});

test('validateRequest throws Error when JWT_SECRET not configured', () => {
  delete process.env.JWT_SECRET;
  const token = signToken({ sub: 'user1' }, 'testsecret');
  const header = `Bearer ${token}`;
  assert.throws(() => validateRequest(header), { message: 'JWT_SECRET not configured' });
});
