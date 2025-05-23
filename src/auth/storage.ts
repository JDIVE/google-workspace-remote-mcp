import { encrypt, decrypt } from '../utils/encryption';
import { Env } from '../index';

export interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
  scope?: string;
}

export class TokenStorage {
  constructor(
    private kvNamespace: KVNamespace,
    private encryptionKey: string
  ) {}

  async storeTokens(userId: string, tokens: StoredTokens): Promise<void> {
    const key = `tokens:${userId}`;
    const encrypted = await encrypt(JSON.stringify(tokens), { 
      ENCRYPTION_KEY: this.encryptionKey 
    } as Env);
    
    // Store with 90-day TTL for refresh tokens
    await this.kvNamespace.put(key, encrypted, {
      expirationTtl: 90 * 24 * 60 * 60 // 90 days
    });
  }

  async getTokens(userId: string): Promise<StoredTokens | null> {
    const key = `tokens:${userId}`;
    const encrypted = await this.kvNamespace.get(key);
    
    if (!encrypted) {
      return null;
    }

    try {
      const decrypted = await decrypt(encrypted, { 
        ENCRYPTION_KEY: this.encryptionKey 
      } as Env, key);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to decrypt tokens:', error);
      return null;
    }
  }

  async deleteTokens(userId: string): Promise<void> {
    const key = `tokens:${userId}`;
    await this.kvNamespace.delete(key);
  }
}