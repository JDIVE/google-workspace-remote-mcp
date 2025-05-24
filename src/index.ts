import { MCPServer } from "./mcp/server";
import { SSETransport } from "./mcp/transport";
import { MCPRequest } from "./mcp/types";
import { GoogleOAuth } from "./auth/oauth";
import { TokenStorage } from "./auth/storage";
import { validateRequest } from "./utils/validation";
import { createJWT } from "./utils/jwt";
import { RateLimiter } from "./utils/rate-limit";
import { Logger } from "./utils/logger";
import { createState, consumeState } from "./auth/state";

export interface Env {
  OAUTH_TOKENS: KVNamespace;
  OAUTH_STATE: KVNamespace;
  RATE_LIMITS: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ENCRYPTION_KEY: string;
  JWT_SECRET: string;
  ALLOWED_ORIGINS: string;
  ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const logger = new Logger("google-workspace-mcp");

    // CORS headers
    const origin = request.headers.get("Origin");
    const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (origin && allowedOrigins.includes(origin)) {
      corsHeaders["Access-Control-Allow-Origin"] = origin;
    }

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Security headers
    const securityHeaders = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": "default-src 'self'",
      ...corsHeaders,
    };

    try {
      const url = new URL(request.url);

      // OAuth callback handler
      if (url.pathname === "/oauth/callback") {
        return handleOAuthCallback(request, env, requestId, logger);
      }

      // OAuth authorization endpoint
      if (url.pathname === "/oauth/authorize") {
        return handleOAuthAuthorize(request, env, requestId, logger);
      }

      // MCP SSE endpoint
      if (url.pathname === "/mcp" && request.method === "POST") {
        return handleMCPRequest(request, env, corsHeaders, requestId, logger);
      }

      // Health check
      if (url.pathname === "/health") {
        return new Response("OK", { status: 200, headers: securityHeaders });
      }

      return new Response("Not Found", {
        status: 404,
        headers: securityHeaders,
      });
    } catch (error) {
      logger.error({
        requestId,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          stack: env.ENVIRONMENT === 'development' && error instanceof Error ? error.stack : undefined,
        },
      });

      return new Response("Internal Server Error", {
        status: 500,
        headers: securityHeaders,
      });
    }
  },
};

async function handleOAuthAuthorize(
  request: Request,
  env: Env,
  requestId: string,
  logger: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

  if (!userId) {
    return new Response("Missing user_id parameter", { status: 400 });
  }

  const state = await createState(env, userId, clientIp);
  if (!state) {
    logger.warn({
      requestId,
      method: "handleOAuthAuthorize",
      metadata: { reason: "Rate limit exceeded for state generation" },
    });
    return new Response("Too many authorization attempts", { status: 429 });
  }

  const oauth = new GoogleOAuth({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${url.origin}/oauth/callback`,
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/contacts.readonly",
    ],
  });

  const authUrl = oauth.getAuthorizationUrl(state);

  logger.info({
    requestId,
    userId,
    method: "handleOAuthAuthorize",
    metadata: { redirecting: true },
  });

  return Response.redirect(authUrl, 302);
}

async function handleOAuthCallback(
  request: Request,
  env: Env,
  requestId: string,
  logger: Logger,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const userId = await consumeState(env, state, requestId);
  if (!code || !userId) {
    logger.warn({
      requestId,
      method: "handleOAuthCallback",
      metadata: { hasCode: !!code, hasValidState: !!userId },
    });
    return new Response("Invalid state parameter", { status: 400 });
  }

  const oauth = new GoogleOAuth({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${url.origin}/oauth/callback`,
    scopes: [],
  });

  try {
    const tokens = await oauth.exchangeCodeForTokens(code);

    const storage = new TokenStorage(env.OAUTH_TOKENS, env.ENCRYPTION_KEY);
    await storage.storeTokens(userId, {
      ...tokens,
      expires_at: Date.now() + tokens.expires_in * 1000,
    });

    logger.info({
      requestId,
      userId,
      method: "handleOAuthCallback",
      metadata: { success: true },
    });

    const jwt = await createJWT(userId, env.JWT_SECRET, 3600);

    return new Response(JSON.stringify({ token: jwt }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logger.error({
      requestId,
      userId,
      method: "handleOAuthCallback",
      error: {
        code: "OAUTH_EXCHANGE_FAILED",
        message:
          error instanceof Error ? error.message : "Token exchange failed",
      },
    });

    return new Response("Authorization failed", { status: 500 });
  }
}

async function handleMCPRequest(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  requestId: string,
  logger: Logger,
): Promise<Response> {
  const startTime = Date.now();

  // Parse request body first to check method
  let body: MCPRequest;
  try {
    body = (await request.json()) as MCPRequest;
  } catch {
    logger.error({
      requestId,
      method: "handleMCPRequest",
      error: {
        code: "INVALID_JSON",
        message: "Failed to parse request body as JSON",
      },
    });

    return new Response("Invalid JSON in request body", {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Allow unauthenticated access for initialize and tools/list
  const authHeader = request.headers.get("Authorization");
  const isAuthRequired = body.method !== "initialize" && body.method !== "tools/list";
  
  let userId: string | null = null;
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    userId = await validateRequest(authHeader, env.JWT_SECRET);
  }

  // For methods that require auth, check if we have valid auth
  if (isAuthRequired && !userId) {
    // Generate a temporary session ID for unauthenticated users
    const sessionId = crypto.randomUUID();
    const transport = new SSETransport();
    const server = new MCPServer(transport, env, sessionId, logger, true); // true = unauthenticated mode
    await server.initialize();
    await server.handleRequest(body);
    
    return transport.getResponse(corsHeaders);
  }

  // For authenticated requests or allowed unauthenticated methods
  const effectiveUserId = userId || crypto.randomUUID();
  
  try {
    // Rate limiting only for authenticated requests
    if (userId) {
      const rateLimiter = new RateLimiter(env.RATE_LIMITS);
      const allowed = await rateLimiter.checkLimit(userId);

      if (!allowed) {
        logger.warn({
          requestId,
          userId,
          method: "handleMCPRequest",
          metadata: { reason: "Rate limit exceeded" },
        });

        return new Response("Rate limit exceeded", {
          status: 429,
          headers: {
            ...corsHeaders,
            "Retry-After": "60",
          },
        });
      }
    }

    // Create SSE transport
    const transport = new SSETransport();
    const server = new MCPServer(transport, env, effectiveUserId, logger, !userId);

    // Initialize server
    await server.initialize();

    // Process request
    await server.handleRequest(body);

    logger.info({
      requestId,
      userId: effectiveUserId,
      method: "handleMCPRequest",
      duration: Date.now() - startTime,
      metadata: {
        method: body.method,
        success: true,
        authenticated: !!userId,
      },
    });

    // Include security headers in SSE response
    const sseHeaders = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      ...corsHeaders,
    };

    return transport.getResponse(sseHeaders);
  } catch (error) {
    logger.error({
      requestId,
      method: "handleMCPRequest",
      duration: Date.now() - startTime,
      error: {
        code: "MCP_REQUEST_FAILED",
        message:
          error instanceof Error ? error.message : "Request processing failed",
      },
    });

    return new Response("Internal server error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
