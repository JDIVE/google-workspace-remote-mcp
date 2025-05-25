import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { GoogleWorkspaceMCP } from "./google-workspace-mcp.js";
import { GitHubHandler } from "./github-handler.js";

export { GoogleWorkspaceMCP };

interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  WORKER_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OAUTH_KV: KVNamespace;
  OAUTH_TOKENS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  COOKIE_ENCRYPTION_KEY?: string;
  ENCRYPTION_KEY?: string;
  OAUTH_STATE?: KVNamespace;
}

export type { Env };

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: GoogleWorkspaceMCP.mount("/sse"),
  defaultHandler: GitHubHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});