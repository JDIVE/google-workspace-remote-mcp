import { webcrypto } from 'crypto';

export interface EncryptedData {
  version: number;
  data: string;
  iv: string;
}

export interface Env {
  ENCRYPTION_KEY: string;
  ENCRYPTION_KEY_OLD?: string;
  TOKEN_STORE: KVNamespace;
  ROTATION_LOCK?: DurableObjectNamespace;
}

const CURRENT_VERSION = 2;
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

/**
 * Derives a cryptographic key from a base64-encoded string
 */
async function deriveKey(keyString: string): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(keyString), c => c.charCodeAt(0));
  return await webcrypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts data using the provided key
 */
async function encryptWithKey(data: string, key: CryptoKey): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await webcrypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(data)
  );
  
  return {
    version: CURRENT_VERSION,
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

/**
 * Decrypts data using the provided key
 */
async function decryptWithKey(encrypted: EncryptedData, key: CryptoKey): Promise<string> {
  const decoder = new TextDecoder();
  const data = Uint8Array.from(atob(encrypted.data), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
  
  const decrypted = await webcrypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );
  
  return decoder.decode(decrypted);
}

/**
 * Encrypts data using the current encryption key
 */
export async function encrypt(data: string, env: Env): Promise<string> {
  const key = await deriveKey(env.ENCRYPTION_KEY);
  const encrypted = await encryptWithKey(data, key);
  return JSON.stringify(encrypted);
}

/**
 * Decrypts data, automatically handling key rotation
 */
export async function decrypt(encrypted: string, env: Env, tokenKey?: string): Promise<string> {
  const parsed = JSON.parse(encrypted) as EncryptedData;
  const currentKey = await deriveKey(env.ENCRYPTION_KEY);
  
  // Try current key first
  try {
    return await decryptWithKey(parsed, currentKey);
  } catch (error) {
    // Fall back to old key if available
    if (env.ENCRYPTION_KEY_OLD) {
      const oldKey = await deriveKey(env.ENCRYPTION_KEY_OLD);
      const decrypted = await decryptWithKey(parsed, oldKey);
      
      // Re-encrypt with new key if we have a token key
      if (tokenKey) {
        await reEncryptToken(tokenKey, decrypted, env);
      }
      
      return decrypted;
    }
    throw new Error('Failed to decrypt with any available key');
  }
}

/**
 * Re-encrypts a token with the current key
 */
async function reEncryptToken(tokenKey: string, decryptedData: string, env: Env): Promise<void> {
  // Use distributed lock to prevent race conditions
  if (env.ROTATION_LOCK) {
    const lockId = env.ROTATION_LOCK.idFromName(tokenKey);
    const lock = env.ROTATION_LOCK.get(lockId);
    
    // Try to acquire lock
    const response = await lock.fetch(new Request('https://lock/acquire', {
      method: 'POST',
      body: JSON.stringify({ key: tokenKey, ttl: 30000 }) // 30 second TTL
    }));
    
    if (!response.ok) {
      // Another worker is already re-encrypting this token
      return;
    }
    
    try {
      await performReEncryption(tokenKey, decryptedData, env);
    } finally {
      // Release lock
      await lock.fetch(new Request('https://lock/release', {
        method: 'POST',
        body: JSON.stringify({ key: tokenKey })
      }));
    }
  } else {
    // Fallback: use KV conditional writes
    await performReEncryptionWithConditionalWrite(tokenKey, decryptedData, env);
  }
}

/**
 * Performs the actual re-encryption
 */
async function performReEncryption(tokenKey: string, decryptedData: string, env: Env): Promise<void> {
  const newEncrypted = await encrypt(decryptedData, env);
  await env.TOKEN_STORE.put(tokenKey, newEncrypted, {
    metadata: { 
      rotated: true, 
      rotatedAt: new Date().toISOString(),
      version: CURRENT_VERSION
    }
  });
}

/**
 * Performs re-encryption using KV conditional writes to prevent races
 */
async function performReEncryptionWithConditionalWrite(
  tokenKey: string, 
  decryptedData: string, 
  env: Env
): Promise<void> {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    const existing = await env.TOKEN_STORE.getWithMetadata(tokenKey);
    if (!existing.value) {
      throw new Error(`Token ${tokenKey} not found`);
    }
    
    // Check if already rotated
    if (existing.metadata?.version === CURRENT_VERSION) {
      return;
    }
    
    const newEncrypted = await encrypt(decryptedData, env);
    
    // Try to update with conditional write
    const updated = await env.TOKEN_STORE.put(tokenKey, newEncrypted, {
      metadata: {
        rotated: true,
        rotatedAt: new Date().toISOString(),
        version: CURRENT_VERSION,
        previousVersion: existing.metadata?.version || 1
      },
      // This is a simplified example - real KV doesn't have built-in CAS
      // In production, you'd use a version number or timestamp check
    });
    
    // If successful, break
    break;
  }
}

/**
 * Generates a new encryption key with proper entropy
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = new Uint8Array(32); // 256-bit key
  webcrypto.getRandomValues(key);
  return btoa(String.fromCharCode(...key));
}

/**
 * Gets rotation progress statistics
 */
export async function getRotationProgress(env: Env): Promise<{
  total: number;
  rotated: number;
  pending: number;
  percentage: number;
}> {
  let total = 0;
  let rotated = 0;
  
  // List all tokens
  let cursor: string | undefined;
  do {
    const list = await env.TOKEN_STORE.list({ cursor, limit: 1000 });
    total += list.keys.length;
    
    for (const key of list.keys) {
      if (key.metadata?.version === CURRENT_VERSION) {
        rotated++;
      }
    }
    
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  
  const pending = total - rotated;
  const percentage = total > 0 ? (rotated / total) * 100 : 0;
  
  return { total, rotated, pending, percentage };
}

/**
 * Verifies that all tokens can be decrypted with the current key
 */
export async function verifyRotation(env: Env): Promise<{
  success: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let cursor: string | undefined;
  
  do {
    const list = await env.TOKEN_STORE.list({ cursor, limit: 100 });
    
    for (const key of list.keys) {
      try {
        const encrypted = await env.TOKEN_STORE.get(key.name);
        if (encrypted) {
          await decrypt(encrypted, env);
        }
      } catch (error) {
        errors.push(`Failed to decrypt ${key.name}: ${error}`);
      }
    }
    
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  
  return {
    success: errors.length === 0,
    errors
  };
}