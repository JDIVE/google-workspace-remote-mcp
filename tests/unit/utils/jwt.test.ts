import { describe, it, expect } from 'vitest';
import { createJWT } from '../../../src/utils/jwt';
import { validateJWT } from '../../../src/utils/validation';

describe('createJWT', () => {
  const SECRET = 'test-secret-key';

  it('creates a valid JWT that can be validated', async () => {
    const token = await createJWT('user123', SECRET, 60);
    const userId = await validateJWT(token, SECRET);
    expect(userId).toBe('user123');
  });
});
