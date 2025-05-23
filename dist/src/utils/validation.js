"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWTMalformedError = exports.JWTInvalidSignatureError = exports.JWTNotYetValidError = exports.JWTExpiredError = exports.JWTError = void 0;
exports.validateRequest = validateRequest;
exports.validateToolArguments = validateToolArguments;
const crypto_1 = require("crypto");
const buffer_1 = require("buffer");
// Custom error types for JWT validation
class JWTError extends Error {
    constructor(message) {
        super(message);
        this.name = 'JWTError';
    }
}
exports.JWTError = JWTError;
class JWTExpiredError extends JWTError {
    constructor(message = 'JWT has expired') {
        super(message);
        this.name = 'JWTExpiredError';
    }
}
exports.JWTExpiredError = JWTExpiredError;
class JWTNotYetValidError extends JWTError {
    constructor(message = 'JWT is not yet valid') {
        super(message);
        this.name = 'JWTNotYetValidError';
    }
}
exports.JWTNotYetValidError = JWTNotYetValidError;
class JWTInvalidSignatureError extends JWTError {
    constructor(message = 'JWT signature is invalid') {
        super(message);
        this.name = 'JWTInvalidSignatureError';
    }
}
exports.JWTInvalidSignatureError = JWTInvalidSignatureError;
class JWTMalformedError extends JWTError {
    constructor(message = 'JWT is malformed') {
        super(message);
        this.name = 'JWTMalformedError';
    }
}
exports.JWTMalformedError = JWTMalformedError;
/**
 * Validates a bearer token using HMAC SHA-256.
 * The JWT_SECRET environment variable is used as the signing key.
 * @param authHeader Authorization header value
 * @param options Validation options
 * @returns the user id (sub) if valid, otherwise null
 * @throws {JWTError} When JWT validation fails with specific error types
 */
function validateRequest(authHeader, options = {}) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET not configured');
    }
    if (!authHeader.startsWith('Bearer ')) {
        throw new JWTMalformedError('Authorization header must start with "Bearer "');
    }
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new JWTMalformedError('JWT must have three parts separated by dots');
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    try {
        // Verify signature
        const data = `${headerB64}.${payloadB64}`;
        const expected = (0, crypto_1.createHmac)('sha256', secret).update(data).digest('base64url');
        if (expected !== signatureB64) {
            throw new JWTInvalidSignatureError();
        }
        // Parse payload
        const payload = JSON.parse(buffer_1.Buffer.from(payloadB64, 'base64url').toString());
        const now = Math.floor(Date.now() / 1000);
        const clockTolerance = options.clockTolerance || 0;
        // Validate exp claim
        if (typeof payload.exp === 'number') {
            if (now >= payload.exp + clockTolerance) {
                throw new JWTExpiredError(`Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
            }
        }
        // Validate nbf claim (not before)
        if (typeof payload.nbf === 'number') {
            if (now < payload.nbf - clockTolerance) {
                throw new JWTNotYetValidError(`Token not valid until ${new Date(payload.nbf * 1000).toISOString()}`);
            }
        }
        // Validate iat claim (issued at)
        if (typeof payload.iat === 'number') {
            if (payload.iat > now + clockTolerance) {
                throw new JWTNotYetValidError('Token issued in the future');
            }
        }
        // Validate sub claim
        if (typeof payload.sub !== 'string') {
            throw new JWTMalformedError('JWT must contain a string "sub" claim');
        }
        return payload.sub;
    }
    catch (error) {
        if (error instanceof JWTError) {
            throw error;
        }
        throw new JWTMalformedError('Failed to parse JWT: ' + error.message);
    }
}
function validateToolArguments(tool, args) {
    const errors = [];
    if (tool.parameters.required) {
        for (const required of tool.parameters.required) {
            if (!(required in args)) {
                errors.push(`Missing required parameter: ${required}`);
            }
        }
    }
    for (const [key, value] of Object.entries(args)) {
        const paramDef = tool.parameters.properties[key];
        if (!paramDef) {
            errors.push(`Unknown parameter: ${key}`);
            continue;
        }
        if (!validateType(value, paramDef)) {
            errors.push(`Invalid type for parameter ${key}`);
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
function validateType(value, schema) {
    switch (schema.type) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number';
        case 'boolean':
            return typeof value === 'boolean';
        case 'array':
            return Array.isArray(value);
        case 'object':
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        default:
            return true;
    }
}
