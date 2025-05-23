export interface EncryptedData {
  version: number;
  data: string;
  iv: string;
}

export interface Env {
  ENCRYPTION_KEY: string;
  ENCRYPTION_KEY_OLD?: string;
  OAUTH_TOKENS?: KVNamespace;
  TOKEN_STORE?: KVNamespace;
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
  return await crypto.subtle.importKey(
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
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
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
  
  const decrypted = await crypto.subtle.decrypt(
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
      if (tokenKey && env.TOKEN_STORE) {
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
  if (!env.TOKEN_STORE) return;
  
  // Simple re-encryption without distributed locking for now
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
 * Generates a new encryption key with proper entropy
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = new Uint8Array(32); // 256-bit key
  crypto.getRandomValues(key);
  return btoa(String.fromCharCode(...key));
}