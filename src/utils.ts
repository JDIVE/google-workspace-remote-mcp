/**
 * Constructs an authorization URL for an upstream service.
 *
 * @param {Object} options
 * @param {string} options.upstream_url - The base URL of the upstream service.
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} [options.state] - The state parameter.
 *
 * @returns {string} The authorization URL.
 */
export function getUpstreamAuthorizeUrl({
	upstream_url,
	client_id,
	scope,
	redirect_uri,
	state,
}: {
	upstream_url: string;
	client_id: string;
	scope: string;
	redirect_uri: string;
	state?: string;
}) {
	const upstream = new URL(upstream_url);
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("scope", scope);
	if (state) upstream.searchParams.set("state", state);
	upstream.searchParams.set("response_type", "code");
	return upstream.href;
}

/**
 * Fetches an authorization token from an upstream service.
 *
 * @param {Object} options
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.client_secret - The client secret of the application.
 * @param {string} options.code - The authorization code.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} options.upstream_url - The token endpoint URL of the upstream service.
 *
 * @returns {Promise<[string, null] | [null, Response]>} A promise that resolves to an array containing the access token or an error response.
 */
export async function fetchUpstreamAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	upstream_url,
}: {
	code: string | undefined;
	upstream_url: string;
	client_secret: string;
	redirect_uri: string;
	client_id: string;
}): Promise<[string, Response | null]> {
	if (!code) {
		return ["", new Response("Missing code", { status: 400 })];
	}

	try {
		console.log("Fetching access token from GitHub with code:", code);
		console.log("Redirect URI:", redirect_uri);

		// GitHub prefers JSON for token requests
		const resp = await fetch(upstream_url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Accept": "application/json"
			},
			body: JSON.stringify({
				client_id,
				client_secret,
				code,
				redirect_uri
			}),
		});

		if (!resp.ok) {
			console.error("Error response from GitHub:", resp.status, resp.statusText);
			const errorText = await resp.text();
			console.error("Error body:", errorText);
			return ["", new Response("Failed to fetch access token: " + errorText, { status: 500 })];
		}

		// GitHub returns JSON
		const data = await resp.json() as any;
		console.log("GitHub token response received");

		if (data.error) {
			console.error("GitHub returned an error:", data.error);
			return ["", new Response(JSON.stringify(data), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			})];
		}

		const accessToken = data.access_token;
		if (!accessToken) {
			console.error("No access token in GitHub response");
			return ["", new Response("Missing access token in GitHub response", { status: 400 })];
		}

		console.log("Successfully obtained access token from GitHub");
		return [accessToken, null];
	} catch (error) {
		console.error("Exception fetching access token:", error);
		return ["", new Response("Error fetching token: " + (error instanceof Error ? error.message : String(error)), { status: 500 })];
	}
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	login: string;
	name: string;
	email: string;
	accessToken: string;
	googleTokens: {
		access_token: string;
		refresh_token: string;
		expires_at: number;
	};
}