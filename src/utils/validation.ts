export class JWTError extends Error {
  constructor(public code: 'EXPIRED' | 'INVALID_SIGNATURE' | 'MALFORMED', message: string) {
    super(message);
    this.name = 'JWTError';
  }
}

export class JWTExpiredError extends JWTError {
  constructor() {
    super('EXPIRED', 'JWT has expired');
  }
}

export class JWTInvalidSignatureError extends JWTError {
  constructor() {
    super('INVALID_SIGNATURE', 'JWT signature verification failed');
  }
}

export class JWTMalformedError extends JWTError {
  constructor(message = 'JWT is malformed') {
    super('MALFORMED', message);
  }
}

interface JWTHeader {
  alg: string;
  typ: string;
}

interface JWTPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  [key: string]: any;
}

interface ValidateOptions {
  clockTolerance?: number; // seconds
}

export async function validateRequest(
  authHeader: string,
  secret: string,
  options: ValidateOptions = {}
): Promise<string | null> {
  try {
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new JWTMalformedError('Missing Bearer prefix');
    }

    const token = authHeader.substring(7);
    const userId = await validateJWT(token, secret, options);
    return userId;
  } catch (error) {
    if (error instanceof JWTError) {
      throw error;
    }
    return null;
  }
}

export async function validateJWT(
  token: string,
  secret: string,
  options: ValidateOptions = {}
): Promise<string> {
  const parts = token.split('.');
  
  if (parts.length !== 3) {
    throw new JWTMalformedError('JWT must have 3 parts');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header and payload
  let header: JWTHeader;
  let payload: JWTPayload;
  
  try {
    header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
    payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    throw new JWTMalformedError('Invalid base64 encoding');
  }

  // Currently only support HS256
  if (header.alg !== 'HS256') {
    throw new JWTMalformedError(`Unsupported algorithm: ${header.alg}`);
  }

  // Verify signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = Uint8Array.from(
    atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );

  const valid = await crypto.subtle.verify('HMAC', key, signature, data);
  
  if (!valid) {
    throw new JWTInvalidSignatureError();
  }

  // Validate claims
  const now = Math.floor(Date.now() / 1000);
  const clockTolerance = options.clockTolerance || 0;

  // Check expiration
  if (payload.exp !== undefined && payload.exp < now - clockTolerance) {
    throw new JWTExpiredError();
  }

  // Check not before
  if (payload.nbf !== undefined && payload.nbf > now + clockTolerance) {
    throw new JWTMalformedError('Token not yet valid (nbf)');
  }

  // Check issued at
  if (payload.iat !== undefined && payload.iat > now + clockTolerance) {
    throw new JWTMalformedError('Token issued in the future (iat)');
  }

  // Extract user ID
  if (!payload.sub) {
    throw new JWTMalformedError('Missing sub claim');
  }

  return payload.sub;
}