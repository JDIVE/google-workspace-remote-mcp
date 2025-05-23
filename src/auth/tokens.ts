import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { TokenStorage, StoredTokens } from "./storage";
import { GoogleOAuth } from "./oauth";
import { Env } from "../index";

export class TokenManager {
  private storage: TokenStorage;
  private oauth: GoogleOAuth;
  private clientId: string;
  private clientSecret: string;

  constructor(env: Env) {
    this.storage = new TokenStorage(env.OAUTH_TOKENS, env.ENCRYPTION_KEY);
    this.clientId = env.GOOGLE_CLIENT_ID;
    this.clientSecret = env.GOOGLE_CLIENT_SECRET;

    this.oauth = new GoogleOAuth({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: "", // Not needed for refresh
      scopes: [],
    });
  }

  async getAuthClient(userId: string): Promise<OAuth2Client> {
    const tokens = await this.getValidTokens(userId);

    const authClient = new google.auth.OAuth2(this.clientId, this.clientSecret);

    authClient.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expiry_date: tokens.expires_at,
    });

    return authClient;
  }

  async getValidTokens(userId: string): Promise<StoredTokens> {
    const tokens = await this.storage.getTokens(userId);

    if (!tokens) {
      throw new Error("No tokens found for user");
    }

    // Check if access token is expired
    const now = Date.now();
    if (tokens.expires_at <= now) {
      // Refresh the token
      if (!tokens.refresh_token) {
        throw new Error("No refresh token available");
      }

      try {
        const newTokens = await this.oauth.refreshAccessToken(
          tokens.refresh_token,
        );

        const updatedTokens: StoredTokens = {
          ...tokens,
          access_token: newTokens.access_token,
          expires_at: now + newTokens.expires_in * 1000,
        };

        await this.storage.storeTokens(userId, updatedTokens);
        return updatedTokens;
      } catch (error) {
        throw new Error("Failed to refresh access token");
      }
    }

    return tokens;
  }

  async revokeTokens(userId: string): Promise<void> {
    const tokens = await this.storage.getTokens(userId);
    if (!tokens) {
      return;
    }

    try {
      // Revoke the refresh token
      if (tokens.refresh_token) {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            token: tokens.refresh_token,
          }),
        });
      }
    } finally {
      // Delete tokens from storage regardless of revocation result
      await this.storage.deleteTokens(userId);
    }
  }
}
