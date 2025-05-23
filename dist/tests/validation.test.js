"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("assert/strict"));
const node_test_1 = require("node:test");
const validation_1 = require("../src/utils/validation");
const crypto_1 = require("crypto");
const buffer_1 = require("buffer");
function signToken(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = buffer_1.Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = buffer_1.Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = `${headerB64}.${payloadB64}`;
    const signature = (0, crypto_1.createHmac)('sha256', secret).update(data).digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
}
(0, node_test_1.test)('validateRequest returns user id for valid token', () => {
    process.env.JWT_SECRET = 'testsecret';
    const token = signToken({ sub: 'user1', exp: Math.floor(Date.now() / 1000) + 60 }, 'testsecret');
    const header = `Bearer ${token}`;
    strict_1.default.equal((0, validation_1.validateRequest)(header), 'user1');
});
(0, node_test_1.test)('validateRequest throws JWTInvalidSignatureError for invalid signature', () => {
    process.env.JWT_SECRET = 'testsecret';
    const token = signToken({ sub: 'user1', exp: Math.floor(Date.now() / 1000) + 60 }, 'wrong');
    const header = `Bearer ${token}`;
    strict_1.default.throws(() => (0, validation_1.validateRequest)(header), validation_1.JWTInvalidSignatureError);
});
(0, node_test_1.test)('validateRequest throws JWTExpiredError for expired token', () => {
    process.env.JWT_SECRET = 'testsecret';
    const token = signToken({ sub: 'user1', exp: Math.floor(Date.now() / 1000) - 10 }, 'testsecret');
    const header = `Bearer ${token}`;
    strict_1.default.throws(() => (0, validation_1.validateRequest)(header), validation_1.JWTExpiredError);
});
(0, node_test_1.test)('validateRequest validates nbf claim', () => {
    process.env.JWT_SECRET = 'testsecret';
    const futureTime = Math.floor(Date.now() / 1000) + 60;
    const token = signToken({ sub: 'user1', nbf: futureTime }, 'testsecret');
    const header = `Bearer ${token}`;
    strict_1.default.throws(() => (0, validation_1.validateRequest)(header), validation_1.JWTNotYetValidError);
});
(0, node_test_1.test)('validateRequest accepts valid nbf claim', () => {
    process.env.JWT_SECRET = 'testsecret';
    const pastTime = Math.floor(Date.now() / 1000) - 60;
    const token = signToken({ sub: 'user1', nbf: pastTime }, 'testsecret');
    const header = `Bearer ${token}`;
    strict_1.default.equal((0, validation_1.validateRequest)(header), 'user1');
});
(0, node_test_1.test)('validateRequest validates iat claim', () => {
    process.env.JWT_SECRET = 'testsecret';
    const futureTime = Math.floor(Date.now() / 1000) + 60;
    const token = signToken({ sub: 'user1', iat: futureTime }, 'testsecret');
    const header = `Bearer ${token}`;
    strict_1.default.throws(() => (0, validation_1.validateRequest)(header), validation_1.JWTNotYetValidError);
});
(0, node_test_1.test)('validateRequest throws JWTMalformedError for malformed token', () => {
    process.env.JWT_SECRET = 'testsecret';
    const header = 'Bearer invalid.token';
    strict_1.default.throws(() => (0, validation_1.validateRequest)(header), validation_1.JWTMalformedError);
});
(0, node_test_1.test)('validateRequest throws JWTMalformedError for missing Bearer prefix', () => {
    process.env.JWT_SECRET = 'testsecret';
    const token = signToken({ sub: 'user1' }, 'testsecret');
    strict_1.default.throws(() => (0, validation_1.validateRequest)(token), validation_1.JWTMalformedError);
});
(0, node_test_1.test)('validateRequest throws JWTMalformedError for missing sub claim', () => {
    process.env.JWT_SECRET = 'testsecret';
    const token = signToken({ exp: Math.floor(Date.now() / 1000) + 60 }, 'testsecret');
    const header = `Bearer ${token}`;
    strict_1.default.throws(() => (0, validation_1.validateRequest)(header), validation_1.JWTMalformedError);
});
(0, node_test_1.test)('validateRequest respects clockTolerance option', () => {
    process.env.JWT_SECRET = 'testsecret';
    const expiredTime = Math.floor(Date.now() / 1000) - 5;
    const token = signToken({ sub: 'user1', exp: expiredTime }, 'testsecret');
    const header = `Bearer ${token}`;
    // Should throw without tolerance
    strict_1.default.throws(() => (0, validation_1.validateRequest)(header), validation_1.JWTExpiredError);
    // Should pass with tolerance
    strict_1.default.equal((0, validation_1.validateRequest)(header, { clockTolerance: 10 }), 'user1');
});
(0, node_test_1.test)('validateRequest throws Error when JWT_SECRET not configured', () => {
    delete process.env.JWT_SECRET;
    const token = signToken({ sub: 'user1' }, 'testsecret');
    const header = `Bearer ${token}`;
    strict_1.default.throws(() => (0, validation_1.validateRequest)(header), { message: 'JWT_SECRET not configured' });
});
