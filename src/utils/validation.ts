import { createHmac } from 'crypto';
import { Buffer } from 'buffer';

/**
 * Validates a bearer token using HMAC SHA-256.
 * The JWT_SECRET environment variable is used as the signing key.
 * @param authHeader Authorization header value
 * @returns the user id (sub) if valid, otherwise null
 */
export function validateRequest(authHeader: string): string | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  const token = authHeader.replace('Bearer ', '');
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const data = `${headerB64}.${payloadB64}`;
    const expected = createHmac('sha256', secret).update(data).digest('base64url');
    if (expected !== signatureB64) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && now >= payload.exp) {
      return null;
    }
    if (typeof payload.sub !== 'string') {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Tool {
  parameters: {
    required?: string[];
    properties: Record<string, { type: string }>;
  };
}

export function validateToolArguments(tool: Tool, args: any): ValidationResult {
  const errors: string[] = [];

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

function validateType(value: any, schema: any): boolean {
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
