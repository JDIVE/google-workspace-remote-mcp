import { describe, it, expect } from 'vitest';
import { createJWT } from '../../../src/utils/jwt';
import { validateJWT } from '../../../src/utils/validation';

describe('createJWT', () => {
  const SECRET = 'test-secret-key-that-is-at-least-32-characters-long';

  it('creates a valid JWT that can be validated', async () => {
    const token = await createJWT('user123', SECRET, 60);
    const userId = await validateJWT(token, SECRET);
    expect(userId).toBe('user123');
  });

  it('throws error if secret is too short', async () => {
    await expect(createJWT('user123', 'short', 60)).rejects.toThrow(
      'JWT_SECRET must be at least 32 characters'
    );
  });

  it('throws error if secret is empty', async () => {
    await expect(createJWT('user123', '', 60)).rejects.toThrow(
      'JWT_SECRET must be at least 32 characters'
    );
  });

  it('throws error if expiration is invalid', async () => {
    await expect(createJWT('user123', SECRET, 0)).rejects.toThrow(
      'Invalid expiration time: must be between 1 second and 24 hours'
    );

    await expect(createJWT('user123', SECRET, -1)).rejects.toThrow(
      'Invalid expiration time: must be between 1 second and 24 hours'
    );

    await expect(createJWT('user123', SECRET, 86401)).rejects.toThrow(
      'Invalid expiration time: must be between 1 second and 24 hours'
    );
  });
});
