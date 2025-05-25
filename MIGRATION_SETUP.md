# Google Workspace MCP Server - Migration Setup Guide

This guide covers the setup and deployment of the migrated Google Workspace MCP Server using the agents/workers-mcp pattern.

## Migration Status

The migration from the traditional SSE implementation to the agents pattern is complete. This resolves the Cloudflare Workers timeout issues and enables persistent connections with Claude Web UI.

## Prerequisites

1. Node.js 18+ and npm
2. Cloudflare account with Workers enabled
3. Google Cloud Console project with OAuth 2.0 credentials
4. GitHub OAuth App for authentication

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example file and update with your credentials:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your actual values:

```env
# OAuth credentials from Google Cloud Console
GOOGLE_CLIENT_ID=your_actual_google_client_id
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret

# GitHub OAuth App credentials
GITHUB_CLIENT_ID=your_github_oauth_app_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret

# Worker URL (update after deployment)
WORKER_URL=http://localhost:8787

# Generate secure key with: openssl rand -base64 32
COOKIE_ENCRYPTION_KEY=your_generated_secure_key_here
```

### 3. Google OAuth Setup

In Google Cloud Console:

1. Go to APIs & Services > Credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `http://localhost:8787/google-callback` (for local dev)
   - `https://your-worker.workers.dev/google-callback` (for production)
4. Enable required APIs:
   - Gmail API
   - Google Calendar API
   - Google Drive API
   - Google People API

### 4. GitHub OAuth App Setup

In GitHub Settings > Developer settings > OAuth Apps:

1. Create a new OAuth App
2. Set Authorization callback URL:
   - `http://localhost:8787/callback` (for local dev)
   - `https://your-worker.workers.dev/callback` (for production)
3. Note the Client ID and Client Secret

### 5. Run Local Development Server

```bash
npm run dev
```

The server will start at `http://localhost:8787`

## Testing the OAuth Flow

1. Visit `http://localhost:8787/authorize?client_id=test&redirect_uri=http://localhost:3000&state=test`
2. You'll be redirected to GitHub for authentication
3. After GitHub auth, you'll be redirected to Google OAuth
4. After granting permissions, you'll be redirected back with an authorization code

## Deployment

### 1. Update Worker URL

Edit `.dev.vars` and change `WORKER_URL` to your production URL:

```env
WORKER_URL=https://google-workspace-mcp.your-domain.workers.dev
```

### 2. Deploy to Cloudflare Workers

```bash
npm run deploy
```

### 3. Set Production Secrets

After deployment, set your production secrets:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY
```

## Integration with Claude Web UI

1. In Claude Web UI, add a new MCP server
2. Use your deployed worker URL as the server endpoint
3. The OAuth flow will automatically handle authentication
4. Once connected, all Google Workspace tools will be available

## Available Tools

The server provides comprehensive Google Workspace integration:

### Gmail Tools
- `emails_search` - Advanced email search with filters
- `email_send` - Send emails
- `gmail_get_message` - Get full message details
- `gmail_trash_message` / `gmail_untrash_message` - Manage trash
- `draft_manage` - Create, read, update, delete, and send drafts
- `label_manage` - CRUD operations for labels
- `label_assign` - Add/remove labels from messages

### Calendar Tools
- `calendar_events_list` - List events with filtering
- `calendar_event_create` - Create new events
- `calendar_event_get` - Get specific event details
- `calendar_event_update` - Update existing events
- `calendar_event_delete` - Delete events
- `calendar_event_manage` - Accept/decline invitations

### Drive Tools
- `drive_files_list` - List files with filtering
- `drive_files_search` - Advanced file search
- `drive_file_upload` - Upload new files
- `drive_file_download` - Download file content
- `drive_folder_create` - Create folders
- `drive_permissions_update` - Manage sharing
- `drive_file_delete` - Delete files/folders

### Contacts Tools
- `contacts_get` - Retrieve contacts with field selection

### System Tools
- `accounts_list` - List authenticated accounts and status

## Troubleshooting

### TypeScript Errors
Some TypeScript errors may remain in the auth utilities. These don't affect runtime but can be addressed by:
- Ensuring all KV namespaces are defined in wrangler.jsonc
- Making optional environment variables required if always provided

### Connection Issues
If Claude Web UI shows "connected" but immediately disconnects:
- Verify all environment variables are set correctly
- Check that the worker URL matches in all configurations
- Ensure KV namespace IDs in wrangler.jsonc are correct

### OAuth Errors
If OAuth flow fails:
- Verify redirect URIs match exactly in Google/GitHub configurations
- Check that all required scopes are enabled in Google Cloud Console
- Ensure COOKIE_ENCRYPTION_KEY is properly generated and set

## Migration Benefits

This migration provides:
- ✅ Persistent SSE connections with Claude Web UI
- ✅ Automatic token refresh with persistence
- ✅ Proper Durable Objects integration
- ✅ All original functionality preserved
- ✅ Better error handling and logging
- ✅ Simplified tool registration pattern

## Next Steps

1. Complete any remaining TypeScript strict mode fixes
2. Add comprehensive error handling for edge cases
3. Implement rate limiting using the RATE_LIMITS KV namespace
4. Add monitoring and logging for production use
5. Consider adding more Google Workspace APIs (Sheets, Docs, etc.)