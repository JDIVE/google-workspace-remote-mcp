import type { IRequestContext } from "@cloudflare/workers-oauth-provider";
import { google } from "googleapis";
import { getUpstreamAuthorizeUrl, fetchUpstreamAuthToken } from "./utils.js";
import { clientIdAlreadyApproved, renderApprovalDialog, parseRedirectApproval } from "./workers-oauth-utils.js";

export async function GitHubHandler(request: Request, ctx: IRequestContext): Promise<Response> {
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const path = url.pathname;
  console.log("GitHubHandler path:", path);

  // OAuth metadata endpoint
  if (path === "/.well-known/oauth-authorization-server") {
    return new Response(JSON.stringify({
      issuer: ctx.env.WORKER_URL,
      authorization_endpoint: `${ctx.env.WORKER_URL}/authorize`,
      token_endpoint: `${ctx.env.WORKER_URL}/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Handle GitHub OAuth callback (initial authentication)
  if (path === "/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    
    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    console.log("Received GitHub callback with code");

    try {
      // Exchange code for GitHub access token
      const [githubToken, tokenError] = await fetchUpstreamAuthToken({
        code,
        upstream_url: "https://github.com/login/oauth/access_token",
        client_secret: ctx.env.GITHUB_CLIENT_SECRET,
        redirect_uri: `${ctx.env.WORKER_URL}/callback`,
        client_id: ctx.env.GITHUB_CLIENT_ID,
      });

      if (tokenError) {
        console.error("Error fetching GitHub token:", tokenError);
        return tokenError;
      }

      console.log("Successfully obtained GitHub access token");

      // Fetch user info from GitHub
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!userResponse.ok) {
        throw new Error(`Failed to fetch user info: ${userResponse.statusText}`);
      }

      const userData = await userResponse.json() as any;
      console.log("GitHub user:", userData.login);

      // Store the GitHub auth info in session
      ctx.oauthSession.login = userData.login;
      ctx.oauthSession.name = userData.name || userData.login;
      ctx.oauthSession.email = userData.email || "";
      ctx.oauthSession.accessToken = githubToken;
      ctx.oauthSession.refreshToken = ""; // GitHub doesn't provide refresh tokens

      // Now redirect to Google OAuth
      return Response.redirect(`${ctx.env.WORKER_URL}/google-auth?state=${state}`);
    } catch (error) {
      console.error("GitHub OAuth error:", error);
      return new Response("Authentication failed", { status: 500 });
    }
  }

  // Handle Google OAuth initiation
  if (path === "/google-auth") {
    const state = url.searchParams.get("state");
    
    // Create Google OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      ctx.env.GOOGLE_CLIENT_ID,
      ctx.env.GOOGLE_CLIENT_SECRET,
      `${ctx.env.WORKER_URL}/google-callback`
    );

    // Generate Google auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Force consent to get refresh token
      scope: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      state: state || ctx.oauthSession.state
    });

    console.log("Redirecting to Google OAuth");
    return Response.redirect(authUrl);
  }

  // Handle Google OAuth callback
  if (path === "/google-callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("Google OAuth error:", error);
      return new Response(`Authentication failed: ${error}`, { status: 400 });
    }

    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    console.log("Received Google callback with code");

    try {
      // Create Google OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        ctx.env.GOOGLE_CLIENT_ID,
        ctx.env.GOOGLE_CLIENT_SECRET,
        `${ctx.env.WORKER_URL}/google-callback`
      );

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      console.log("Successfully obtained Google tokens");

      // Set credentials to fetch user info
      oauth2Client.setCredentials(tokens);

      // Get user info
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();
      
      console.log("Google user email:", userInfo.email);

      // Store Google tokens in session
      ctx.oauthSession.googleTokens = {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token!,
        expires_at: tokens.expiry_date || Date.now() + 3600000
      };

      // Update email if not already set
      if (!ctx.oauthSession.email && userInfo.email) {
        ctx.oauthSession.email = userInfo.email;
      }

      // Complete the OAuth flow
      console.log("Authentication complete, returning to authorize endpoint");
      
      // Redirect back to complete the authorization
      const redirectUrl = new URL(`${ctx.env.WORKER_URL}/authorize`);
      redirectUrl.searchParams.set("state", state || "");
      redirectUrl.searchParams.set("authenticated", "true");
      
      return Response.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("Google OAuth error:", error);
      return new Response("Google authentication failed", { status: 500 });
    }
  }

  // Handle approval dialog
  if (path === "/approve" && ctx.oauthReqInfo) {
    // Check if client is already approved
    const clientApproved = await clientIdAlreadyApproved(
      request,
      ctx.oauthReqInfo.clientId,
      ctx.env.COOKIE_ENCRYPTION_KEY || "default-secret-key"
    );

    if (clientApproved) {
      console.log("Client already approved, skipping dialog");
      return new Response(null, { status: 302, headers: { Location: "/authorize" } });
    }

    // Handle form submission
    if (request.method === "POST") {
      try {
        const { state, headers } = await parseRedirectApproval(
          request,
          ctx.env.COOKIE_ENCRYPTION_KEY || "default-secret-key"
        );
        
        console.log("Approval granted, redirecting to authorize");
        
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/authorize",
            ...headers
          }
        });
      } catch (error) {
        console.error("Error parsing approval:", error);
        return new Response("Invalid approval request", { status: 400 });
      }
    }

    // Show approval dialog
    return renderApprovalDialog(request, {
      client: ctx.clientInfo,
      server: {
        name: "Google Workspace MCP Server",
        description: "Access your Gmail, Calendar, Drive, and Contacts",
        logo: "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png"
      },
      state: {
        oauthReqInfo: ctx.oauthReqInfo
      },
      cookieSecret: ctx.env.COOKIE_ENCRYPTION_KEY || "default-secret-key"
    });
  }

  // Default response
  return new Response("Not found", { status: 404 });
}