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
}