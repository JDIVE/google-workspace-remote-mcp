import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServer } from '../../../src/mcp/server';
import { SSETransport } from '../../../src/mcp/transport';
import { Logger } from '../../../src/utils/logger';
import { Env } from '../../../src/index';

// Mock the tool handlers
vi.mock('../../../src/tools/handlers/index', () => ({
  callTool: vi.fn(),
}));

describe('MCPServer', () => {
  let mcpServer: MCPServer;
  let mockTransport: vi.Mocked<SSETransport>;
  let mockEnv: Env;
  let mockLogger: vi.Mocked<Logger>;

  beforeEach(() => {
    mockTransport = {
      send: vi.fn(),
      sendError: vi.fn(),
      close: vi.fn(),
      getResponse: vi.fn(),
    } as any;

    mockEnv = {
      OAUTH_TOKENS: {} as KVNamespace,
      OAUTH_STATE: {} as KVNamespace,
      RATE_LIMITS: {} as KVNamespace,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      ENCRYPTION_KEY: 'test-encryption-key',
      JWT_SECRET: 'test-jwt-secret',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    mcpServer = new MCPServer(mockTransport, mockEnv, 'test-user-123', mockLogger);
  });

  describe('initialize', () => {
    it('should send initialization response with available tools', async () => {
      await mcpServer.initialize();

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'google-workspace-mcp',
            version: '1.0.0',
          },
        },
      });
    });
  });

  describe('handleRequest', () => {
    it('should handle tools/list request', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-123',
        method: 'tools/list' as const,
      };

      await mcpServer.handleRequest(request);

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-123',
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: expect.stringMatching(/^gmail_/),
            }),
            expect.objectContaining({
              name: expect.stringMatching(/^calendar_/),
            }),
            expect.objectContaining({
              name: expect.stringMatching(/^drive_/),
            }),
            expect.objectContaining({
              name: expect.stringMatching(/^contacts_/),
            }),
          ]),
        },
      });
    });

    it('should handle tools/call request', async () => {
      const { callTool } = await import('../../../src/tools/handlers/index');
      (callTool as any).mockResolvedValue({ success: true, data: 'test result' });

      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-456',
        method: 'tools/call' as const,
        params: {
          name: 'gmail_send',
          arguments: {
            to: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
          },
        },
      };

      await mcpServer.handleRequest(request);

      expect(callTool).toHaveBeenCalledWith(
        'gmail_send',
        {
          to: 'test@example.com',
          subject: 'Test',
          body: 'Hello',
        },
        mockEnv,
        'test-user-123',
        mockLogger
      );

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-456',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, data: 'test result' }),
            },
          ],
        },
      });
    });

    it('should handle unsupported method', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-789',
        method: 'unsupported/method' as any,
      };

      await mcpServer.handleRequest(request);

      expect(mockTransport.sendError).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-789',
        error: {
          code: -32601,
          message: 'Method not found',
        },
      });
    });

    it('should handle tools/call with missing tool name', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-error',
        method: 'tools/call' as const,
        params: {
          arguments: {},
        },
      };

      await mcpServer.handleRequest(request);

      expect(mockTransport.sendError).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-error',
        error: {
          code: -32602,
          message: 'Invalid params',
          data: { reason: 'Missing tool name' },
        },
      });
    });

    it('should handle tools/call with tool execution error', async () => {
      const { callTool } = await import('../../../src/tools/handlers/index');
      (callTool as any).mockRejectedValue(new Error('Tool execution failed'));

      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-tool-error',
        method: 'tools/call' as const,
        params: {
          name: 'gmail_send',
          arguments: {},
        },
      };

      await mcpServer.handleRequest(request);

      expect(mockTransport.sendError).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-tool-error',
        error: {
          code: -32603,
          message: 'Tool execution failed',
          data: { tool: 'gmail_send' },
        },
      });
    });

    it('should handle request without id (notification)', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        method: 'tools/list' as const,
      };

      await mcpServer.handleRequest(request);

      // Should not send response for notifications
      expect(mockTransport.send).not.toHaveBeenCalled();
      expect(mockTransport.sendError).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const malformedRequest = {
        jsonrpc: '1.0', // Wrong version
        method: 'tools/list',
      } as any;

      await mcpServer.handleRequest(malformedRequest);

      expect(mockTransport.sendError).toHaveBeenCalledWith({
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });
    });

    it('should log tool execution errors', async () => {
      const { callTool } = await import('../../../src/tools/handlers/index');
      const testError = new Error('Test error');
      (callTool as any).mockRejectedValue(testError);

      const request = {
        jsonrpc: '2.0' as const,
        id: 'error-test',
        method: 'tools/call' as const,
        params: {
          name: 'test_tool',
          arguments: {},
        },
      };

      await mcpServer.handleRequest(request);

      expect(mockLogger.error).toHaveBeenCalledWith({
        userId: 'test-user-123',
        method: 'tools/call',
        tool: 'test_tool',
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: 'Test error',
        },
      });
    });
  });

  describe('tool discovery', () => {
    it('should include all Google Workspace tools in tools/list response', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'tools-list',
        method: 'tools/list' as const,
      };

      await mcpServer.handleRequest(request);

      const sendCall = vi.mocked(mockTransport.send).mock.calls[0][0];
      const tools = sendCall.result.tools;

      // Check that we have tools from all services
      const toolNames = tools.map((tool: any) => tool.name);
      
      expect(toolNames).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^gmail_/),
          expect.stringMatching(/^calendar_/),
          expect.stringMatching(/^drive_/),
          expect.stringMatching(/^contacts_/),
        ])
      );

      // Check tool structure
      tools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
      });
    });
  });
});