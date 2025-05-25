import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { Octokit } from 'octokit'
import { google } from 'googleapis'
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, Props } from './utils'
import { clientIdAlreadyApproved, parseRedirectApproval, renderApprovalDialog } from './workers-oauth-utils'

// Create a new Hono app
const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>()

app.get('/authorize', async (c) => {
	console.log("Authorization endpoint accessed");
	try {
		const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
		console.log("OAuth request info:", JSON.stringify(oauthReqInfo));

		const { clientId } = oauthReqInfo
		if (!clientId) {
			console.log("Invalid request: no clientId");
			return c.text('Invalid request - no clientId', 400)
		}

		console.log("Client ID:", clientId);

		// Check if client is already approved
		const isApproved = await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY || "default-secret-key")
		console.log("Client already approved:", isApproved);

		if (isApproved) {
			console.log("Client approved, redirecting to GitHub");
			return redirectToGithub(c.req.raw, oauthReqInfo, {}, c.env)
		}

		console.log("Client not approved, showing approval dialog");
		const client = await c.env.OAUTH_PROVIDER.lookupClient(clientId);
		console.log("Client details:", JSON.stringify(client));

		// Render the approval dialog
		return renderApprovalDialog(c.req.raw, {
			client,
			server: {
				name: "Google Workspace MCP Server",
				logo: "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png",
				description: 'Access your Gmail, Calendar, Drive, and Contacts through the Model Context Protocol.',
			},
			state: { oauthReqInfo }, // arbitrary data that flows through the form submission below
		})
	} catch (error) {
		console.error("Error in authorization endpoint:", error);
		return c.text(`Authorization error: ${error instanceof Error ? error.message : String(error)}`, 500)
	}
})

app.post('/authorize', async (c) => {
	// Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
	const { state, headers } = await parseRedirectApproval(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY || "default-secret-key")
	if (!state.oauthReqInfo) {
		return c.text('Invalid request', 400)
	}

	return redirectToGithub(c.req.raw, state.oauthReqInfo, headers, c.env)
})

async function redirectToGithub(request: Request, oauthReqInfo: AuthRequest, headers: Record<string, string> = {}, env: Env) {
	console.log("Redirecting to GitHub with info:", JSON.stringify(oauthReqInfo));

	const redirectUri = new URL('/callback', request.url).href;
	console.log("Redirect URI:", redirectUri);
	console.log("GitHub Client ID:", env.GITHUB_CLIENT_ID);

	const state = btoa(JSON.stringify({ oauthReqInfo, step: 'github' }));
	console.log("State parameter:", state);

	const authorizeUrl = getUpstreamAuthorizeUrl({
		upstream_url: 'https://github.com/login/oauth/authorize',
		scope: 'read:user',
		client_id: env.GITHUB_CLIENT_ID,
		redirect_uri: redirectUri,
		state,
	});

	console.log("GitHub authorize URL:", authorizeUrl);

	return new Response(null, {
		status: 302,
		headers: {
			...headers,
			location: authorizeUrl,
		},
	})
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles callbacks from both GitHub and Google.
 * For GitHub: exchanges code for token, gets user info, then redirects to Google
 * For Google: exchanges code for tokens, then completes the authorization
 */
app.get("/callback", async (c) => {
	console.log("Callback endpoint accessed");
	try {
		// Get the state parameter
		const stateParam = c.req.query("state");
		console.log("State parameter:", stateParam);

		if (!stateParam) {
			console.error("Missing state parameter");
			return c.text("Missing state parameter", 400);
		}

		// Decode the state
		const stateData = JSON.parse(atob(stateParam)) as { oauthReqInfo?: AuthRequest; step: string; githubUser?: any };
		console.log("Decoded state - step:", stateData.step);

		// Handle GitHub callback
		if (stateData.step === 'github') {
			const oauthReqInfo = stateData.oauthReqInfo!;
			console.log("Processing GitHub callback");

			// Get the code parameter
			const code = c.req.query("code");
			if (!code) {
				console.error("Missing code parameter");
				return c.text("Missing code parameter", 400);
			}

			// Exchange the code for an access token
			console.log("Exchanging GitHub code for access token...");
			const redirectUri = new URL("/callback", c.req.url).href;

			const [accessToken, errResponse] = await fetchUpstreamAuthToken({
				upstream_url: "https://github.com/login/oauth/access_token",
				client_id: c.env.GITHUB_CLIENT_ID,
				client_secret: c.env.GITHUB_CLIENT_SECRET,
				code,
				redirect_uri: redirectUri,
			});

			if (errResponse) {
				console.error("Error fetching access token");
				return errResponse;
			}

			if (!accessToken) {
				console.error("No access token received");
				return c.text("Failed to obtain access token", 500);
			}

			console.log("GitHub access token obtained");

			// Fetch the user info from GitHub
			console.log("Fetching user info from GitHub...");
			const user = await new Octokit({ auth: accessToken }).rest.users.getAuthenticated();
			const { login, name, email } = user.data;
			console.log("GitHub user:", login, name, email ? "(email provided)" : "(no email)");

			// Now redirect to Google OAuth
			const oauth2Client = new google.auth.OAuth2(
				c.env.GOOGLE_CLIENT_ID,
				c.env.GOOGLE_CLIENT_SECRET,
				new URL('/google-callback', c.req.url).href
			);

			// Create state for Google callback
			const googleState = btoa(JSON.stringify({
				oauthReqInfo,
				step: 'google',
				githubUser: {
					login,
					name,
					email,
					accessToken
				}
			}));

			const googleAuthUrl = oauth2Client.generateAuthUrl({
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
				state: googleState
			});

			console.log("Redirecting to Google OAuth");
			return Response.redirect(googleAuthUrl);
		}

		// If we get here with different step, it's an error
		console.error("Invalid callback state");
		return c.text("Invalid callback state", 400);

	} catch (error) {
		console.error("Error in callback handler:", error);
		return c.text(`Callback error: ${error instanceof Error ? error.message : String(error)}`, 500);
	}
});

/**
 * Google OAuth Callback Endpoint
 */
app.get("/google-callback", async (c) => {
	console.log("Google callback endpoint accessed");
	try {
		const code = c.req.query("code");
		const stateParam = c.req.query("state");
		const error = c.req.query("error");

		if (error) {
			console.error("Google OAuth error:", error);
			return c.text(`Authentication failed: ${error}`, 400);
		}

		if (!code || !stateParam) {
			return c.text("Missing required parameters", 400);
		}

		// Decode the state
		const stateData = JSON.parse(atob(stateParam)) as { 
			oauthReqInfo: AuthRequest; 
			step: string; 
			githubUser: { login: string; name: string; email: string; accessToken: string }
		};

		if (stateData.step !== 'google') {
			return c.text("Invalid state", 400);
		}

		console.log("Processing Google callback for GitHub user:", stateData.githubUser.login);

		// Create Google OAuth2 client
		const oauth2Client = new google.auth.OAuth2(
			c.env.GOOGLE_CLIENT_ID,
			c.env.GOOGLE_CLIENT_SECRET,
			new URL('/google-callback', c.req.url).href
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

		// Complete the authorization with both GitHub and Google info
		const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
			request: stateData.oauthReqInfo,
			userId: stateData.githubUser.login,
			metadata: {
				label: stateData.githubUser.name || stateData.githubUser.login,
			},
			scope: stateData.oauthReqInfo.scope,
			// This will be available on this.props inside GoogleWorkspaceMCP
			props: {
				login: stateData.githubUser.login,
				name: stateData.githubUser.name,
				email: userInfo.email || stateData.githubUser.email || "",
				accessToken: stateData.githubUser.accessToken,
				refreshToken: "", // GitHub doesn't provide refresh tokens
				googleTokens: {
					access_token: tokens.access_token!,
					refresh_token: tokens.refresh_token!,
					expires_at: tokens.expiry_date || Date.now() + 3600000
				}
			} as Props,
		});

		console.log("Auth complete, redirecting to:", redirectTo);
		return Response.redirect(redirectTo);

	} catch (error) {
		console.error("Error in Google callback handler:", error);
		return c.text(`Google callback error: ${error instanceof Error ? error.message : String(error)}`, 500);
	}
});

// Well-known OAuth metadata endpoint
app.get("/.well-known/oauth-authorization-server", (c) => {
	return c.json({
		issuer: c.env.WORKER_URL,
		authorization_endpoint: `${c.env.WORKER_URL}/authorize`,
		token_endpoint: `${c.env.WORKER_URL}/token`,
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code"],
		code_challenge_methods_supported: ["S256"],
	});
});

export { app as GitHubHandler }