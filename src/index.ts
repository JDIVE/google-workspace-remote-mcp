import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { GoogleWorkspaceMCP } from "./google-workspace-mcp.js";
import { GitHubHandler } from "./github-handler.js";

export { GoogleWorkspaceMCP };

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: GoogleWorkspaceMCP.mount("/sse"),
  defaultHandler: GitHubHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});