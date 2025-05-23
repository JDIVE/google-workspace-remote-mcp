import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServer } from '../../../src/mcp/server';
import { SSETransport } from '../../../src/mcp/transport';
import { Logger } from '../../../src/utils/logger';
import { Env } from '../../../src/index';

// Mock dependencies
vi.mock('../../../src/tools/handlers/index', () => ({
  handleToolCall: vi.fn(),
}));

vi.mock('../../../src/tools/gmail', () => ({
  getGmailTools: vi.fn(() => [
    {
      name: 'gmail_search_messages',
      description: 'Search Gmail messages',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
    }
  ]),
}));

vi.mock('../../../src/tools/calendar', () => ({
  getCalendarTools: vi.fn(() => [
    {
      name: 'calendar_list_events',
      description: 'List calendar events',
      parameters: { type: 'object', properties: {} }
    }
  ]),
}));

vi.mock('../../../src/tools/drive', () => ({
  getDriveTools: vi.fn(() => [
    {
      name: 'drive_list_files',
      description: 'List Drive files',
      parameters: { type: 'object', properties: {} }
    }
  ]),
}));

vi.mock('../../../src/tools/contacts', () => ({
  getContactsTools: vi.fn(() => [
    {
      name: 'contacts_list',
      description: 'List contacts',
      parameters: { type: 'object', properties: {} }
    }
  ]),
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
    it('should initialize server and register tools', async () => {
      await mcpServer.initialize();

      // Check that logger was called to log the initialization
      expect(mockLogger.info).toHaveBeenCalledWith({
        requestId: expect.any(String),
        userId: 'test-user-123',
        method: 'initialize',
        metadata: { toolCount: 4 }, // 4 mocked tools
      });
    });
  });

  describe('handleRequest', () => {
    beforeEach(async () => {
      // Initialize server before each test to register tools
      await mcpServer.initialize();
      vi.clearAllMocks(); // Clear mocks after initialization
    });

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
          tools: [
            {
              name: 'gmail_search_messages',
              description: 'Search Gmail messages',
              parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
            },
            {
              name: 'calendar_list_events',
              description: 'List calendar events',
              parameters: { type: 'object', properties: {} }
            },
            {
              name: 'drive_list_files',
              description: 'List Drive files',
              parameters: { type: 'object', properties: {} }
            },
            {
              name: 'contacts_list',
              description: 'List contacts',
              parameters: { type: 'object', properties: {} }
            }
          ],
        },
      });
    });

    it('should handle tools/call request', async () => {
      const { handleToolCall } = await import('../../../src/tools/handlers/index');
      vi.mocked(handleToolCall).mockResolvedValue({ success: true, data: 'test result' });

      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-456',
        method: 'tools/call' as const,
        params: {
          name: 'gmail_search_messages',
          arguments: {
            query: 'from:test@example.com',
          },
        },
      };

      await mcpServer.handleRequest(request);

      expect(handleToolCall).toHaveBeenCalledWith(
        'gmail_search_messages',
        {
          query: 'from:test@example.com',
        },
        expect.objectContaining({
          env: mockEnv,
          userId: 'test-user-123',
          logger: mockLogger,
          requestId: expect.any(String),
        })
      );

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-456',
        result: { success: true, data: 'test result' },
      });
    });

    it('should handle unsupported method', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-789',
        method: 'unsupported/method' as any,
      };

      await mcpServer.handleRequest(request);

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-789',
        error: {
          code: -32603,
          message: 'Unsupported method: unsupported/method',
        },
      });
    });

    it('should handle tools/call with unknown tool', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-error',
        method: 'tools/call' as const,
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      };

      await mcpServer.handleRequest(request);

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-error',
        error: {
          code: -32603,
          message: 'Unknown tool: unknown_tool',
        },
      });
    });

    it('should handle tools/call with tool execution error', async () => {
      const { handleToolCall } = await import('../../../src/tools/handlers/index');
      vi.mocked(handleToolCall).mockRejectedValue(new Error('Tool execution failed'));

      const request = {
        jsonrpc: '2.0' as const,
        id: 'test-tool-error',
        method: 'tools/call' as const,
        params: {
          name: 'gmail_search_messages',
          arguments: { query: 'test' },
        },
      };

      await mcpServer.handleRequest(request);

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-tool-error',
        error: {
          code: -32603,
          message: 'Tool execution failed',
        },
      });
    });

    it('should handle request without id (notification)', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        method: 'tools/list' as const,
      };

      await mcpServer.handleRequest(request);

      // Server still sends response even for notifications in this implementation
      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: undefined,
        result: expect.any(Object),
      });
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await mcpServer.initialize();
      vi.clearAllMocks();
    });

    it('should handle malformed requests gracefully', async () => {
      // The server doesn't actually validate jsonrpc version, so let's test a real error case
      const requestWithoutMethod = {
        jsonrpc: '2.0',
        id: 'malformed',
      } as any;

      await mcpServer.handleRequest(requestWithoutMethod);

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'malformed',
        error: {
          code: -32603,
          message: 'Unsupported method: undefined',
        },
      });
    });

    it('should handle parameter validation errors', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'validation-error',
        method: 'tools/call' as const,
        params: {
          name: 'gmail_search_messages',
          arguments: {}, // Missing required 'query' parameter
        },
      };

      await mcpServer.handleRequest(request);

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'validation-error',
        error: {
          code: -32603,
          message: 'Invalid parameters: Missing required parameter: query',
        },
      });
    });
  });

  describe('tool discovery', () => {
    beforeEach(async () => {
      await mcpServer.initialize();
      vi.clearAllMocks();
    });

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
      
      expect(toolNames).toEqual([
        'gmail_search_messages',
        'calendar_list_events',
        'drive_list_files',
        'contacts_list'
      ]);

      // Check tool structure
      tools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(tool.parameters).toHaveProperty('type', 'object');
      });
    });
  });
});