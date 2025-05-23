# Implementation Plan

A comprehensive step-by-step guide for building the Google Workspace Remote MCP Server.

## Phase 1: Project Setup and Foundation

### Step 1.1: Initialize Project
```bash
mkdir google-workspace-remote-mcp
cd google-workspace-remote-mcp
npm init -y
npm install --save-dev @cloudflare/workers-types typescript vitest wrangler
npm install @modelcontextprotocol/sdk googleapis
```

### Step 1.2: Configure TypeScript
Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "lib": ["ES2021"],
    "types": ["@cloudflare/workers-types"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": false,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 1.3: Create Wrangler Configuration
Create `wrangler.toml`:
```toml
name = "google-workspace-mcp"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGINS = "https://claude.ai,https://api.anthropic.com"

[[kv_namespaces]]
binding = "OAUTH_TOKENS"
id = "your-kv-namespace-id"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "your-rate-limit-namespace-id"

[secrets]
# GOOGLE_CLIENT_ID
# GOOGLE_CLIENT_SECRET
# ENCRYPTION_KEY
```

## Phase 2: MCP Server Core Implementation

### Step 2.1: Define MCP Types
Create `src/mcp/types.ts`:
```typescript
export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ServerCapabilities {
  tools?: boolean;
  prompts?: boolean;
  resources?: boolean;
}
```

### Step 2.2: Implement SSE Transport
Create `src/mcp/transport.ts`:
```typescript
export class SSETransport {
  private encoder = new TextEncoder();
  private stream: TransformStream<string, Uint8Array>;
  private writer: WritableStreamDefaultWriter<string>;

  constructor() {
    this.stream = new TransformStream({
      transform: (chunk, controller) => {
        controller.enqueue(this.encoder.encode(`data: ${chunk}\n\n`));
      }
    });
    this.writer = this.stream.writable.getWriter();
  }

  async send(message: any): Promise<void> {
    await this.writer.write(JSON.stringify(message));
  }

  getReadableStream(): ReadableStream<Uint8Array> {
    return this.stream.readable;
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}
```

### Step 2.3: Create MCP Server
Create `src/mcp/server.ts`:
```typescript
import { SSETransport } from './transport';
import { MCPRequest, MCPResponse, Tool } from './types';
import { getGmailTools } from '../tools/gmail';
import { getCalendarTools } from '../tools/calendar';
import { getDriveTools } from '../tools/drive';
import { getPeopleTools } from '../tools/people';

export class MCPServer {
  private transport: SSETransport;
  private tools: Map<string, Tool> = new Map();
  private handlers: Map<string, Function> = new Map();

  constructor(transport: SSETransport) {
    this.transport = transport;
    this.registerTools();
    this.registerHandlers();
  }

  private registerTools() {
    const allTools = [
      ...getGmailTools(),
      ...getCalendarTools(),
      ...getDriveTools(),
      ...getPeopleTools()
    ];

    allTools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });
  }

  private registerHandlers() {
    this.handlers.set('initialize', this.handleInitialize.bind(this));
    this.handlers.set('tools/list', this.handleListTools.bind(this));
    this.handlers.set('tools/call', this.handleCallTool.bind(this));
  }

  async processRequest(request: MCPRequest): Promise<void> {
    const handler = this.handlers.get(request.method);
    
    if (!handler) {
      await this.sendError(request.id, -32601, 'Method not found');
      return;
    }

    try {
      const result = await handler(request.params);
      await this.sendResponse(request.id, result);
    } catch (error) {
      await this.sendError(
        request.id, 
        -32603, 
        'Internal error', 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private async handleInitialize(params: any) {
    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "google-workspace-mcp",
        version: "1.0.0"
      }
    };
  }

  private async handleListTools() {
    return {
      tools: Array.from(this.tools.values())
    };
  }

  private async handleCallTool(params: any) {
    // Tool execution logic here
    const { name, arguments: args } = params;
    const tool = this.tools.get(name);
    
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    // Execute tool based on name
    return await this.executeTool(name, args);
  }

  private async executeTool(name: string, args: any) {
    // This will be implemented per tool
    throw new Error('Not implemented');
  }

  private async sendResponse(id: string | number, result: any) {
    const response: MCPResponse = {
      jsonrpc: "2.0",
      id,
      result
    };
    await this.transport.send(response);
  }

  private async sendError(id: string | number, code: number, message: string, data?: any) {
    const response: MCPResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message, data }
    };
    await this.transport.send(response);
  }
}
```

## Phase 3: OAuth Implementation

### Step 3.1: OAuth Flow Handler
Create `src/auth/oauth.ts`:
```typescript
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export class GoogleOAuth {
  private config: OAuthConfig;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    return response.json();
  }
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}
```

### Step 3.2: Token Storage
Create `src/auth/storage.ts`:
```typescript
import { encrypt, decrypt } from '../utils/crypto';

export class TokenStorage {
  constructor(
    private kv: KVNamespace,
    private encryptionKey: string
  ) {}

  async storeTokens(userId: string, tokens: any): Promise<void> {
    const encrypted = await encrypt(JSON.stringify(tokens), this.encryptionKey);
    await this.kv.put(`tokens:${userId}`, encrypted, {
      expirationTtl: 60 * 60 * 24 * 90 // 90 days
    });
  }

  async getTokens(userId: string): Promise<any | null> {
    const encrypted = await this.kv.get(`tokens:${userId}`);
    if (!encrypted) return null;

    const decrypted = await decrypt(encrypted, this.encryptionKey);
    return JSON.parse(decrypted);
  }

  async deleteTokens(userId: string): Promise<void> {
    await this.kv.delete(`tokens:${userId}`);
  }
}
```

### Step 3.3: Token Manager
Create `src/auth/tokens.ts`:
```typescript
export class TokenManager {
  constructor(
    private oauth: GoogleOAuth,
    private storage: TokenStorage
  ) {}

  async getValidAccessToken(userId: string): Promise<string> {
    const tokens = await this.storage.getTokens(userId);
    
    if (!tokens) {
      throw new Error('No tokens found for user');
    }

    // Check if token is expired
    const now = Date.now();
    if (tokens.expires_at < now) {
      // Refresh the token
      const refreshed = await this.oauth.refreshAccessToken(tokens.refresh_token);
      
      const updatedTokens = {
        ...tokens,
        access_token: refreshed.access_token,
        expires_at: now + (refreshed.expires_in * 1000)
      };

      await this.storage.storeTokens(userId, updatedTokens);
      return refreshed.access_token;
    }

    return tokens.access_token;
  }
}
```

## Phase 4: Google Workspace Tool Implementation

### Step 4.1: Gmail Tools
Create `src/tools/gmail.ts`:
```typescript
import { Tool } from '../mcp/types';

export function getGmailTools(): Tool[] {
  return [
    {
      name: "gmail_search",
      description: "Search emails in Gmail",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Gmail search query"
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results",
            default: 10
          }
        },
        required: ["query"]
      }
    },
    {
      name: "gmail_send",
      description: "Send an email",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: { type: "string" },
            description: "Recipient email addresses"
          },
          subject: {
            type: "string",
            description: "Email subject"
          },
          body: {
            type: "string",
            description: "Email body"
          },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "CC recipients"
          },
          bcc: {
            type: "array",
            items: { type: "string" },
            description: "BCC recipients"
          }
        },
        required: ["to", "subject", "body"]
      }
    },
    // Add more Gmail tools...
  ];
}

export class GmailService {
  constructor(private accessToken: string) {}

  async searchMessages(query: string, maxResults: number = 10) {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail search failed: ${response.statusText}`);
    }

    return response.json();
  }

  async sendMessage(to: string[], subject: string, body: string, cc?: string[], bcc?: string[]) {
    const message = this.createMessage(to, subject, body, cc, bcc);
    
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: this.encodeMessage(message)
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to send email: ${response.statusText}`);
    }

    return response.json();
  }

  private createMessage(to: string[], subject: string, body: string, cc?: string[], bcc?: string[]): string {
    const headers = [
      `To: ${to.join(', ')}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8'
    ];

    if (cc && cc.length > 0) {
      headers.push(`Cc: ${cc.join(', ')}`);
    }

    if (bcc && bcc.length > 0) {
      headers.push(`Bcc: ${bcc.join(', ')}`);
    }

    return headers.join('\r\n') + '\r\n\r\n' + body;
  }

  private encodeMessage(message: string): string {
    return btoa(message).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
```

### Step 4.2: Calendar Tools
Create `src/tools/calendar.ts`:
```typescript
export function getCalendarTools(): Tool[] {
  return [
    {
      name: "calendar_list_events",
      description: "List calendar events",
      parameters: {
        type: "object",
        properties: {
          timeMin: {
            type: "string",
            description: "Start time (ISO format)"
          },
          timeMax: {
            type: "string",
            description: "End time (ISO format)"
          },
          maxResults: {
            type: "number",
            description: "Maximum number of events",
            default: 10
          }
        }
      }
    },
    {
      name: "calendar_create_event",
      description: "Create a calendar event",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Event title"
          },
          start: {
            type: "object",
            properties: {
              dateTime: {
                type: "string",
                description: "Start time (ISO format)"
              },
              timeZone: {
                type: "string",
                description: "Timezone"
              }
            },
            required: ["dateTime"]
          },
          end: {
            type: "object",
            properties: {
              dateTime: {
                type: "string",
                description: "End time (ISO format)"
              },
              timeZone: {
                type: "string",
                description: "Timezone"
              }
            },
            required: ["dateTime"]
          },
          description: {
            type: "string",
            description: "Event description"
          },
          attendees: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: {
                  type: "string"
                }
              }
            }
          }
        },
        required: ["summary", "start", "end"]
      }
    }
  ];
}
```

### Step 4.3: Drive Tools
Create `src/tools/drive.ts`:
```typescript
export function getDriveTools(): Tool[] {
  return [
    {
      name: "drive_list_files",
      description: "List files in Google Drive",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query"
          },
          pageSize: {
            type: "number",
            description: "Number of files to return",
            default: 10
          }
        }
      }
    },
    {
      name: "drive_upload_file",
      description: "Upload a file to Google Drive",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "File name"
          },
          content: {
            type: "string",
            description: "File content (base64 encoded)"
          },
          mimeType: {
            type: "string",
            description: "MIME type of the file"
          },
          parents: {
            type: "array",
            items: { type: "string" },
            description: "Parent folder IDs"
          }
        },
        required: ["name", "content", "mimeType"]
      }
    }
  ];
}
```

### Step 4.4: People Tools
Create `src/tools/people.ts`:
```typescript
export function getPeopleTools(): Tool[] {
  return [
    {
      name: "contacts_list",
      description: "List contacts",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "number",
            description: "Number of contacts to return",
            default: 10
          },
          personFields: {
            type: "string",
            description: "Fields to include (comma-separated)",
            default: "names,emailAddresses,phoneNumbers"
          }
        }
      }
    },
    {
      name: "contacts_search",
      description: "Search contacts",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query"
          },
          pageSize: {
            type: "number",
            description: "Number of results",
            default: 10
          }
        },
        required: ["query"]
      }
    }
  ];
}
```

## Phase 5: Worker Entry Point

### Step 5.1: Main Worker Implementation
Create `src/index.ts`:
```typescript
import { MCPServer } from './mcp/server';
import { SSETransport } from './mcp/transport';
import { GoogleOAuth } from './auth/oauth';
import { TokenStorage } from './auth/storage';
import { TokenManager } from './auth/tokens';
import { validateRequest } from './utils/validation';
import { RateLimiter } from './utils/rate-limit';

export interface Env {
  OAUTH_TOKENS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ENCRYPTION_KEY: string;
  ALLOWED_ORIGINS: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORS handling
    const origin = request.headers.get('Origin');
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',');
    
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    
    // OAuth callback handler
    if (url.pathname === '/oauth/callback') {
      return handleOAuthCallback(request, env);
    }

    // MCP SSE endpoint
    if (url.pathname === '/mcp' && request.method === 'POST') {
      return handleMCPRequest(request, env, corsHeaders);
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function handleMCPRequest(
  request: Request, 
  env: Env, 
  corsHeaders: Record<string, string>
): Promise<Response> {
  // Validate authorization
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const userId = validateRequest(authHeader);
  if (!userId) {
    return new Response('Invalid token', { status: 401, headers: corsHeaders });
  }

  // Rate limiting
  const rateLimiter = new RateLimiter(env.RATE_LIMITS);
  const allowed = await rateLimiter.checkLimit(userId);
  
  if (!allowed) {
    return new Response('Rate limit exceeded', { 
      status: 429, 
      headers: {
        ...corsHeaders,
        'Retry-After': '60'
      }
    });
  }

  // Create SSE transport
  const transport = new SSETransport();
  const server = new MCPServer(transport);

  // Process incoming messages
  const reader = request.body?.getReader();
  if (!reader) {
    return new Response('Bad Request', { status: 400, headers: corsHeaders });
  }

  // Start processing in the background
  ctx.waitUntil(processMessages(reader, server, userId, env));

  // Return SSE response
  return new Response(transport.getReadableStream(), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}

async function processMessages(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  server: MCPServer,
  userId: string,
  env: Env
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            await server.processRequest(message);
          } catch (e) {
            console.error('Failed to process message:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream processing error:', error);
  }
}

async function handleOAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return new Response('Invalid callback parameters', { status: 400 });
  }

  // Exchange code for tokens
  const oauth = new GoogleOAuth({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${url.origin}/oauth/callback`,
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/contacts.readonly'
    ]
  });

  try {
    const tokens = await oauth.exchangeCodeForTokens(code);
    
    // Store tokens
    const storage = new TokenStorage(env.OAUTH_TOKENS, env.ENCRYPTION_KEY);
    await storage.storeTokens(state, {
      ...tokens,
      expires_at: Date.now() + (tokens.expires_in * 1000)
    });

    return new Response('Authorization successful. You can close this window.', {
      headers: {
        'Content-Type': 'text/html'
      }
    });
  } catch (error) {
    console.error('OAuth error:', error);
    return new Response('Authorization failed', { status: 500 });
  }
}
```

## Phase 6: Utility Functions

### Step 6.1: Error Handling
Create `src/utils/errors.ts`:
```typescript
export class MCPError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

export function handleGoogleAPIError(error: any): MCPError {
  if (error.response?.status === 401) {
    return new MCPError(-32001, 'Authentication required');
  } else if (error.response?.status === 403) {
    return new MCPError(-32002, 'Permission denied');
  } else if (error.response?.status === 429) {
    return new MCPError(-32003, 'Rate limit exceeded');
  }
  
  return new MCPError(-32603, 'Internal server error', error.message);
}
```

### Step 6.2: Validation
Create `src/utils/validation.ts`:
```typescript
export function validateRequest(authHeader: string): string | null {
  // Simple bearer token validation
  // In production, implement proper JWT validation
  const token = authHeader.replace('Bearer ', '');
  
  if (!token || token.length < 10) {
    return null;
  }

  // Extract user ID from token
  // This is a placeholder - implement proper token parsing
  return 'user-id';
}

export function validateToolArguments(tool: Tool, args: any): ValidationResult {
  const errors: string[] = [];
  
  // Check required parameters
  if (tool.parameters.required) {
    for (const required of tool.parameters.required) {
      if (!(required in args)) {
        errors.push(`Missing required parameter: ${required}`);
      }
    }
  }

  // Validate parameter types
  for (const [key, value] of Object.entries(args)) {
    const paramDef = tool.parameters.properties[key];
    if (!paramDef) {
      errors.push(`Unknown parameter: ${key}`);
      continue;
    }

    if (!validateType(value, paramDef)) {
      errors.push(`Invalid type for parameter ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateType(value: any, schema: any): boolean {
  switch (schema.type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

### Step 6.3: Rate Limiting
Create `src/utils/rate-limit.ts`:
```typescript
export class RateLimiter {
  private readonly windowMs = 60 * 1000; // 1 minute
  private readonly maxRequests = 100;

  constructor(private kv: KVNamespace) {}

  async checkLimit(userId: string): Promise<boolean> {
    const key = `rate:${userId}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get current count
    const data = await this.kv.get(key, 'json') as RateLimitData | null;
    
    if (!data || data.resetTime < now) {
      // New window
      await this.kv.put(key, JSON.stringify({
        count: 1,
        resetTime: now + this.windowMs
      }), {
        expirationTtl: Math.ceil(this.windowMs / 1000)
      });
      return true;
    }

    if (data.count >= this.maxRequests) {
      return false;
    }

    // Increment count
    await this.kv.put(key, JSON.stringify({
      count: data.count + 1,
      resetTime: data.resetTime
    }), {
      expirationTtl: Math.ceil((data.resetTime - now) / 1000)
    });

    return true;
  }
}

interface RateLimitData {
  count: number;
  resetTime: number;
}
```

### Step 6.4: Crypto Utilities
Create `src/utils/crypto.ts`:
```typescript
export async function encrypt(text: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encryptedText: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );

  return decoder.decode(decrypted);
}
```

## Phase 7: Testing Setup

### Step 7.1: Vitest Configuration
Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      kvNamespaces: ['OAUTH_TOKENS', 'RATE_LIMITS'],
      bindings: {
        GOOGLE_CLIENT_ID: 'test-client-id',
        GOOGLE_CLIENT_SECRET: 'test-client-secret',
        ENCRYPTION_KEY: 'test-encryption-key-32-chars-long',
        ALLOWED_ORIGINS: 'http://localhost:3000'
      }
    }
  }
});
```

### Step 7.2: Unit Tests Example
Create `tests/unit/mcp/server.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MCPServer } from '../../../src/mcp/server';
import { SSETransport } from '../../../src/mcp/transport';

describe('MCPServer', () => {
  let server: MCPServer;
  let transport: SSETransport;

  beforeEach(() => {
    transport = new SSETransport();
    server = new MCPServer(transport);
  });

  it('should handle initialize request', async () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {}
      }
    };

    await server.processRequest(request);
    
    // Verify response was sent through transport
    // Add assertions here
  });

  it('should list available tools', async () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: 2,
      method: 'tools/list',
      params: {}
    };

    await server.processRequest(request);
    
    // Verify tools were listed
    // Add assertions here
  });
});
```

## Phase 8: Integration and Final Steps

### Step 8.1: Create Package Scripts
Update `package.json`:
```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write 'src/**/*.ts'"
  }
}
```

### Step 8.2: Environment Setup Script
Create `scripts/setup.js`:
```javascript
const { execSync } = require('child_process');

console.log('Setting up Google Workspace MCP Server...');

// Create KV namespaces
console.log('Creating KV namespaces...');
try {
  execSync('wrangler kv:namespace create "OAUTH_TOKENS"');
  execSync('wrangler kv:namespace create "RATE_LIMITS"');
  console.log('✓ KV namespaces created');
} catch (e) {
  console.log('KV namespaces may already exist');
}

// Set up secrets
console.log('\nPlease set the following secrets:');
console.log('wrangler secret put GOOGLE_CLIENT_ID');
console.log('wrangler secret put GOOGLE_CLIENT_SECRET');
console.log('wrangler secret put ENCRYPTION_KEY');

console.log('\nSetup complete!');
```

## Common Pitfalls and Solutions

### 1. Token Expiration Handling
- Always check token expiration before making API calls
- Implement automatic refresh with retry logic
- Handle refresh token expiration gracefully

### 2. SSE Connection Management
- Implement heartbeat to keep connections alive
- Handle client disconnections properly
- Clean up resources on connection close

### 3. Rate Limiting
- Implement both per-user and global rate limits
- Use exponential backoff for API calls
- Cache frequently accessed data

### 4. Error Handling
- Provide meaningful error messages to clients
- Log errors for debugging
- Implement retry logic for transient failures

### 5. Security
- Validate all input parameters
- Encrypt sensitive data at rest
- Use secure random values for state parameters
- Implement CSRF protection

## Next Steps

1. Implement remaining tool handlers
2. Add comprehensive error handling
3. Set up monitoring and logging
4. Create integration tests
5. Deploy to production
6. Configure MCP client connection