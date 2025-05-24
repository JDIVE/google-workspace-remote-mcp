import { SSETransport } from "./transport";
import { MCPRequest, MCPResponse, Tool, ServerInfo } from "./types";
import { getGmailTools } from "../tools/gmail";
import { getCalendarTools } from "../tools/calendar";
import { getDriveTools } from "../tools/drive";
import { getContactsTools } from "../tools/contacts";
import { handleToolCall, ToolContext } from "../tools/handlers";
import { TokenManager } from "../auth/tokens";
import { handleGoogleAPIError } from "../utils/errors";
import { Logger } from "../utils/logger";
import { Env } from "../index";

export class MCPServer {
  private tools: Map<string, Tool> = new Map();
  private tokenManager: TokenManager;
  private serverInfo: ServerInfo = {
    name: "google-workspace-mcp",
    version: "1.0.0",
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
  };

  constructor(
    private transport: SSETransport,
    private env: Env,
    private userId: string,
    private logger: Logger,
    private isUnauthenticated: boolean = false,
    private requestUrl?: string,
  ) {
    this.tokenManager = new TokenManager(env);
  }

  async initialize(): Promise<void> {
    // Register all tools
    const allTools = [
      ...getGmailTools(),
      ...getCalendarTools(),
      ...getDriveTools(),
      ...getContactsTools(),
    ];

    allTools.forEach((tool) => {
      this.tools.set(tool.name, tool);
    });

    this.logger.info({
      requestId: crypto.randomUUID(),
      userId: this.userId,
      method: "initialize",
      metadata: { toolCount: this.tools.size },
    });
  }

  async handleRequest(request: MCPRequest): Promise<void> {
    try {
      let response: MCPResponse;

      switch (request.method) {
        case "initialize":
          response = await this.handleInitialize(request);
          break;

        case "tools/list":
          response = await this.handleToolsList(request);
          break;

        case "tools/call":
          response = await this.handleToolCall(request);
          break;

        default:
          throw new Error(`Unsupported method: ${request.method}`);
      }

      await this.transport.send(response);
    } catch (error) {
      const mcpError =
        error instanceof Error
          ? { code: -32603, message: error.message }
          : { code: -32603, message: "Internal error" };

      await this.transport.send({
        jsonrpc: "2.0",
        error: mcpError,
        id: request.id,
      });
    }
  }

  private async handleInitialize(request: MCPRequest): Promise<MCPResponse> {
    return {
      jsonrpc: "2.0",
      result: {
        protocolVersion: "1.0",
        serverInfo: this.serverInfo,
      },
      id: request.id,
    };
  }

  private async handleToolsList(request: MCPRequest): Promise<MCPResponse> {
    const tools = Array.from(this.tools.values());

    return {
      jsonrpc: "2.0",
      result: { tools },
      id: request.id,
    };
  }

  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params;

    if (!this.tools.has(name)) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const tool = this.tools.get(name)!;

    // Check if authentication is required
    if (this.isUnauthenticated) {
      // Generate OAuth URL using the request origin
      const requestUrl = this.requestUrl ? new URL(this.requestUrl) : null;
      const baseUrl = requestUrl ? `${requestUrl.protocol}//${requestUrl.host}` : 'https://your-worker.workers.dev';
      const authUrl = new URL(`${baseUrl}/oauth/authorize`);
      authUrl.searchParams.set('user_id', this.userId);
      
      return {
        jsonrpc: "2.0",
        result: {
          content: [{
            type: "text",
            text: `🔐 Authentication required to use Google Workspace tools.\n\nPlease authenticate by visiting:\n${authUrl.toString()}\n\nOnce authenticated, the tools will be available for use.`
          }]
        },
        id: request.id,
      };
    }

    // Validate parameters
    const validation = this.validateParameters(args, tool.parameters);
    if (!validation.valid) {
      throw new Error(`Invalid parameters: ${validation.error}`);
    }

    try {
      // Create tool context
      const context: ToolContext = {
        env: this.env,
        userId: this.userId,
        tokenManager: this.tokenManager,
        logger: this.logger,
        requestId: crypto.randomUUID(),
      };

      // Execute tool
      const result = await handleToolCall(name, args, context);

      return {
        jsonrpc: "2.0",
        result,
        id: request.id,
      };
    } catch (error: any) {
      // Handle Google API errors specially
      if (error.response?.status) {
        const mcpError = handleGoogleAPIError(error);
        throw mcpError;
      }
      throw error;
    }
  }

  private validateParameters(
    params: any,
    schema: any,
  ): { valid: boolean; error?: string } {
    if (!schema || !schema.properties) {
      return { valid: true };
    }

    // Check required parameters
    if (schema.required) {
      for (const required of schema.required) {
        if (params[required] === undefined) {
          return {
            valid: false,
            error: `Missing required parameter: ${required}`,
          };
        }
      }
    }

    // Validate parameter types
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (!propSchema) {
        continue; // Allow extra properties
      }

      const type = (propSchema as any).type;
      const actualType = Array.isArray(value) ? "array" : typeof value;

      if (type && type !== actualType) {
        return {
          valid: false,
          error: `Invalid type for ${key}: expected ${type}, got ${actualType}`,
        };
      }
    }

    return { valid: true };
  }
}
