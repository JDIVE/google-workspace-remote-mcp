import { describe, it, expect } from 'vitest';
import { Logger } from '../../../src/utils/logger';

describe('Logger', () => {
  it('should create a logger instance', () => {
    const logger = new Logger();
    expect(logger).toBeDefined();
  });

  it('should log with custom service name', () => {
    const logger = new Logger('test-service');
    expect(logger).toBeDefined();
  });
});