import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, LogLevel, LogEntry } from './logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: any;

  beforeEach(() => {
    logger = new Logger('test-service');
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Log Level Methods', () => {
    it('should log debug messages with correct format', () => {
      logger.debug({ requestId: 'test-123', userId: 'user-456', method: 'testMethod' });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.level).toBe('debug');
      expect(parsed.requestId).toBe('test-123');
      expect(parsed.userId).toBe('user-456');
      expect(parsed.method).toBe('testMethod');
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should log info messages with correct format', () => {
      logger.info({ requestId: 'info-123', userId: 'user-789', duration: 150 });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.level).toBe('info');
      expect(parsed.requestId).toBe('info-123');
      expect(parsed.userId).toBe('user-789');
      expect(parsed.duration).toBe(150);
    });

    it('should log warn messages with correct format', () => {
      logger.warn({ requestId: 'warn-123', metadata: { warning: 'test warning' } });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.level).toBe('warn');
      expect(parsed.requestId).toBe('warn-123');
      expect(parsed.metadata).toEqual({ warning: 'test warning' });
    });

    it('should log error messages with correct format', () => {
      const errorDetails = {
        code: 'ERR_TEST',
        message: 'Test error message',
        stack: 'Error stack trace'
      };
      
      logger.error({ 
        requestId: 'err-123',
        error: errorDetails,
        metadata: { context: 'test context' }
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.level).toBe('error');
      expect(parsed.requestId).toBe('err-123');
      expect(parsed.error).toEqual(errorDetails);
      expect(parsed.metadata).toEqual({ context: 'test context' });
    });
  });

  describe('JSON Output Format', () => {
    it('should output valid JSON for all log entries', () => {
      const testCases = [
        { method: 'debug', entry: { requestId: 'json-1' } },
        { method: 'info', entry: { requestId: 'json-2', userId: 'user-1' } },
        { method: 'warn', entry: { requestId: 'json-3', duration: 100 } },
        { method: 'error', entry: { requestId: 'json-4', error: { code: 'ERR', message: 'Error' } } }
      ];

      testCases.forEach(({ method, entry }) => {
        (logger as any)[method](entry);
      });

      expect(consoleSpy).toHaveBeenCalledTimes(testCases.length);
      
      consoleSpy.mock.calls.forEach((call: any[]) => {
        expect(() => JSON.parse(call[0])).not.toThrow();
      });
    });

    it('should include all required fields in log output', () => {
      logger.info({ requestId: 'required-123' });
      
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level');
      expect(parsed).toHaveProperty('requestId');
    });
  });

  describe('Error Object Serialization', () => {
    it('should properly serialize error objects', () => {
      const error = new Error('Test error');
      logger.error({
        requestId: 'error-ser-123',
        error: {
          code: 'TEST_ERROR',
          message: error.message,
          stack: error.stack
        }
      });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBe('TEST_ERROR');
      expect(parsed.error.message).toBe('Test error');
      expect(parsed.error.stack).toBeDefined();
    });

    it('should handle errors with custom properties', () => {
      logger.error({
        requestId: 'custom-err-123',
        error: {
          code: 'CUSTOM_ERROR',
          message: 'Custom error message'
        },
        metadata: {
          customField: 'custom value',
          errorDetails: { id: 123, type: 'validation' }
        }
      });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.error.code).toBe('CUSTOM_ERROR');
      expect(parsed.metadata.customField).toBe('custom value');
      expect(parsed.metadata.errorDetails).toEqual({ id: 123, type: 'validation' });
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined values in metadata', () => {
      logger.info({
        requestId: 'undefined-123',
        metadata: {
          defined: 'value',
          notDefined: undefined,
          nullValue: null
        }
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.metadata.defined).toBe('value');
      expect(parsed.metadata.notDefined).toBeUndefined();
      expect(parsed.metadata.nullValue).toBeNull();
    });

    it('should handle null values', () => {
      logger.info({
        requestId: 'null-123',
        userId: null as any,
        metadata: null as any
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.userId).toBeNull();
      expect(parsed.metadata).toBeNull();
    });

    it('should handle circular references without throwing', () => {
      const circular: any = { a: 1, b: 2 };
      circular.self = circular;

      expect(() => {
        logger.info({
          requestId: 'circular-123',
          metadata: { data: circular }
        });
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleSpy.mock.calls[0][0];
      
      expect(logOutput).toContain('[Circular]');
      expect(() => JSON.parse(logOutput)).not.toThrow();
    });

    it('should handle deeply nested circular references', () => {
      const obj1: any = { name: 'obj1' };
      const obj2: any = { name: 'obj2', ref: obj1 };
      obj1.ref = obj2;

      expect(() => {
        logger.warn({
          requestId: 'deep-circular-123',
          metadata: { nested: { data: obj1 } }
        });
      }).not.toThrow();

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('[Circular]');
    });

    it('should handle empty log entries with only requestId', () => {
      logger.info({ requestId: 'minimal-123' });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.requestId).toBe('minimal-123');
      expect(parsed.level).toBe('info');
      expect(parsed.timestamp).toBeDefined();
      expect(Object.keys(parsed).length).toBeGreaterThanOrEqual(3);
    });

    it('should handle very large metadata objects', () => {
      const largeMetadata: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeMetadata[`key${i}`] = `value${i}`;
      }

      expect(() => {
        logger.debug({
          requestId: 'large-123',
          metadata: largeMetadata
        });
      }).not.toThrow();

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(Object.keys(parsed.metadata).length).toBe(1000);
    });

    it('should handle special characters in strings', () => {
      logger.info({
        requestId: 'special-123',
        metadata: {
          quotes: 'String with "quotes"',
          newlines: 'String with\nnewlines',
          tabs: 'String with\ttabs',
          unicode: 'String with 🎉 emoji',
          backslashes: 'String with \\ backslashes'
        }
      });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      expect(parsed.metadata.quotes).toBe('String with "quotes"');
      expect(parsed.metadata.newlines).toBe('String with\nnewlines');
      expect(parsed.metadata.tabs).toBe('String with\ttabs');
      expect(parsed.metadata.unicode).toBe('String with 🎉 emoji');
      expect(parsed.metadata.backslashes).toBe('String with \\ backslashes');
    });
  });

  describe('Service Name', () => {
    it('should use default service name', () => {
      const defaultLogger = new Logger();
      expect(defaultLogger).toBeDefined();
      // Service name is private, so we just verify the logger works
      defaultLogger.info({ requestId: 'service-test-123' });
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should use custom service name', () => {
      const customLogger = new Logger('custom-service');
      expect(customLogger).toBeDefined();
      customLogger.info({ requestId: 'custom-service-123' });
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timestamp Format', () => {
    it('should use ISO 8601 format for timestamps', () => {
      const beforeTime = new Date().toISOString();
      logger.info({ requestId: 'timestamp-123' });
      const afterTime = new Date().toISOString();

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      const logTime = new Date(parsed.timestamp);

      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(logTime.getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
      expect(logTime.getTime()).toBeLessThanOrEqual(new Date(afterTime).getTime());
    });
  });
});