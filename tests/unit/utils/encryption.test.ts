import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encrypt, decrypt, generateEncryptionKey } from '../../../src/utils/encryption';
import type { Env } from '../../../src/utils/encryption';

describe('Encryption', () => {
  let mockEnv: Env;

  beforeEach(async () => {
    // Generate proper 32-byte keys
    const key1 = await generateEncryptionKey();
    const key2 = await generateEncryptionKey();
    
    mockEnv = {
      ENCRYPTION_KEY: key1,
      ENCRYPTION_KEY_OLD: key2,
      OAUTH_TOKENS: {} as KVNamespace,
    };
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data successfully', async () => {
      const originalData = 'Hello, World! This is a test message.';

      const encrypted = await encrypt(originalData, mockEnv);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(originalData);

      const decrypted = await decrypt(encrypted, mockEnv);
      expect(decrypted).toBe(originalData);
    });

    it('should encrypt same data differently each time', async () => {
      const originalData = 'test data';

      const encrypted1 = await encrypt(originalData, mockEnv);
      const encrypted2 = await encrypt(originalData, mockEnv);

      expect(encrypted1).not.toBe(encrypted2);

      const decrypted1 = await decrypt(encrypted1, mockEnv);
      const decrypted2 = await decrypt(encrypted2, mockEnv);

      expect(decrypted1).toBe(originalData);
      expect(decrypted2).toBe(originalData);
    });

    it('should handle empty string encryption', async () => {
      const originalData = '';

      const encrypted = await encrypt(originalData, mockEnv);
      const decrypted = await decrypt(encrypted, mockEnv);

      expect(decrypted).toBe(originalData);
    });

    it('should handle unicode characters', async () => {
      const originalData = 'Hello 世界 🌍 émojis and spëcial chars';

      const encrypted = await encrypt(originalData, mockEnv);
      const decrypted = await decrypt(encrypted, mockEnv);

      expect(decrypted).toBe(originalData);
    });

    it('should handle large data', async () => {
      const originalData = 'x'.repeat(10000); // 10KB of data

      const encrypted = await encrypt(originalData, mockEnv);
      const decrypted = await decrypt(encrypted, mockEnv);

      expect(decrypted).toBe(originalData);
    });

    it('should handle JSON data', async () => {
      const originalData = JSON.stringify({
        access_token: 'token123',
        refresh_token: 'refresh456',
        expires_at: 1234567890,
        user: { id: 'user123', email: 'test@example.com' },
      });

      const encrypted = await encrypt(originalData, mockEnv);
      const decrypted = await decrypt(encrypted, mockEnv);

      expect(decrypted).toBe(originalData);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(originalData));
    });
  });

  describe('key rotation', () => {
    it('should decrypt with old key when current key fails', async () => {
      const originalData = 'test data for key rotation';

      // Encrypt with old key (simulate old encryption)
      const oldKeyEnv: Env = {
        ENCRYPTION_KEY: mockEnv.ENCRYPTION_KEY_OLD!,
      };
      const encrypted = await encrypt(originalData, oldKeyEnv);

      // Try to decrypt with current key (should fall back to old key)
      const decrypted = await decrypt(encrypted, mockEnv);
      expect(decrypted).toBe(originalData);
    });

    it('should fail decryption when neither key works', async () => {
      const fakeEncrypted = JSON.stringify({
        version: 2,
        data: btoa('some valid base64 but wrong data'),
        iv: btoa('valid base64 but wrong iv'),
      });

      await expect(decrypt(fakeEncrypted, mockEnv)).rejects.toThrow();
    });

    it('should fail decryption when no old key is available', async () => {
      const envWithoutOldKey: Env = {
        ENCRYPTION_KEY: mockEnv.ENCRYPTION_KEY,
      };

      const fakeEncrypted = JSON.stringify({
        version: 2,
        data: 'invalid-base64-data',
        iv: 'invalid-iv',
      });

      await expect(decrypt(fakeEncrypted, envWithoutOldKey)).rejects.toThrow(
        'Failed to decrypt with any available key'
      );
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a valid 32-byte base64 key', async () => {
      const key = await generateEncryptionKey();

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');

      // Should be base64 encoded 32 bytes (44 characters with padding)
      const decoded = atob(key);
      expect(decoded.length).toBe(32);

      // Should be different each time
      const key2 = await generateEncryptionKey();
      expect(key).not.toBe(key2);
    });

    it('should generate keys that work for encryption', async () => {
      const key = await generateEncryptionKey();
      const testEnv: Env = { ENCRYPTION_KEY: key };
      const testData = 'test data with generated key';

      const encrypted = await encrypt(testData, testEnv);
      const decrypted = await decrypt(encrypted, testEnv);

      expect(decrypted).toBe(testData);
    });
  });

  describe('error handling', () => {
    it('should handle malformed encrypted data', async () => {
      await expect(decrypt('invalid json', mockEnv)).rejects.toThrow();
    });

    it('should handle missing encryption fields', async () => {
      const malformedData = JSON.stringify({
        version: 2,
        data: 'some-data',
        // missing iv field
      });

      await expect(decrypt(malformedData, mockEnv)).rejects.toThrow();
    });

    it('should handle invalid base64 in encrypted data', async () => {
      const invalidData = JSON.stringify({
        version: 2,
        data: 'invalid-base64!@#$%',
        iv: 'invalid-base64!@#$%',
      });

      await expect(decrypt(invalidData, mockEnv)).rejects.toThrow();
    });

    it('should handle empty encryption key', async () => {
      const emptyKeyEnv: Env = { ENCRYPTION_KEY: '' };

      await expect(encrypt('test', emptyKeyEnv)).rejects.toThrow();
    });

    it('should handle invalid encryption key format', async () => {
      const invalidKeyEnv: Env = { ENCRYPTION_KEY: 'not-base64-encoded!' };

      await expect(encrypt('test', invalidKeyEnv)).rejects.toThrow();
    });
  });

  describe('data integrity', () => {
    it('should detect tampered encrypted data', async () => {
      const originalData = 'sensitive data';
      const encrypted = await encrypt(originalData, mockEnv);
      
      // Parse and tamper with the encrypted data
      const encryptedObj = JSON.parse(encrypted);
      encryptedObj.data = encryptedObj.data.slice(0, -1) + 'X'; // Change last character
      const tamperedEncrypted = JSON.stringify(encryptedObj);

      await expect(decrypt(tamperedEncrypted, mockEnv)).rejects.toThrow();
    });

    it('should detect tampered IV', async () => {
      const originalData = 'sensitive data';
      const encrypted = await encrypt(originalData, mockEnv);
      
      // Parse and tamper with the IV
      const encryptedObj = JSON.parse(encrypted);
      encryptedObj.iv = encryptedObj.iv.slice(0, -1) + 'X'; // Change last character
      const tamperedEncrypted = JSON.stringify(encryptedObj);

      await expect(decrypt(tamperedEncrypted, mockEnv)).rejects.toThrow();
    });
  });

  describe('version handling', () => {
    it('should include version in encrypted data', async () => {
      const originalData = 'test data';
      const encrypted = await encrypt(originalData, mockEnv);
      
      const encryptedObj = JSON.parse(encrypted);
      expect(encryptedObj.version).toBe(2);
      expect(encryptedObj.data).toBeDefined();
      expect(encryptedObj.iv).toBeDefined();
    });
  });
});