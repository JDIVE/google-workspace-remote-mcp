import assert from 'assert/strict';
import { test } from 'node:test';
import { validateRequest } from '../src/utils/validation';
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

test('validateRequest returns null for invalid signature', () => {
  process.env.JWT_SECRET = 'testsecret';
  const token = signToken({ sub: 'user1', exp: Math.floor(Date.now() / 1000) + 60 }, 'wrong');
  const header = `Bearer ${token}`;
  assert.equal(validateRequest(header), null);
});

test('validateRequest returns null for expired token', () => {
  process.env.JWT_SECRET = 'testsecret';
  const token = signToken({ sub: 'user1', exp: Math.floor(Date.now() / 1000) - 10 }, 'testsecret');
  const header = `Bearer ${token}`;
  assert.equal(validateRequest(header), null);
});
