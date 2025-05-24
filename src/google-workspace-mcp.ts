import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

type Props = {
  login: string;
  name: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  googleTokens: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
};

export class GoogleWorkspaceMCP extends McpAgent<Props, Env> {
  server = new McpServer({
    name: "Google Workspace MCP Server",
    version: "1.0.0",
  });

  private oauth2Client!: OAuth2Client;

  async init() {
    console.log("Initializing GoogleWorkspaceMCP server");
    
    try {
      // Initialize Google OAuth client
      this.oauth2Client = new google.auth.OAuth2(
        this.env.GOOGLE_CLIENT_ID,
        this.env.GOOGLE_CLIENT_SECRET,
        `${this.env.WORKER_URL}/oauth/callback`
      );

      // Set credentials from stored tokens
      this.oauth2Client.setCredentials({
        access_token: this.props.googleTokens.access_token,
        refresh_token: this.props.googleTokens.refresh_token,
        expiry_date: this.props.googleTokens.expires_at
      });

      // Set up automatic token refresh
      this.oauth2Client.on('tokens', async (tokens: any) => {
        console.log('New tokens received:', { hasAccess: !!tokens.access_token, hasRefresh: !!tokens.refresh_token });
        
        // Update the stored tokens in Props
        if (tokens.access_token) {
          this.props.googleTokens.access_token = tokens.access_token;
        }
        if (tokens.refresh_token) {
          this.props.googleTokens.refresh_token = tokens.refresh_token;
        }
        if (tokens.expiry_date) {
          this.props.googleTokens.expires_at = tokens.expiry_date;
        }
        
        // TODO: Persist the updated tokens back to Durable Objects storage
      });

      // Register all Google Workspace tools
      this.registerGmailTools();
      this.registerCalendarTools();
      this.registerDriveTools();
      this.registerContactsTools();
      
      // Register system tools
      this.registerSystemTools();

      console.log("GoogleWorkspaceMCP initialization complete, tools registered");
    } catch (error) {
      console.error("Error initializing GoogleWorkspaceMCP:", error);
      throw error;
    }
  }

  private registerSystemTools() {
    this.server.tool(
      "accounts_list",
      "List all configured Google workspace accounts and their authentication status",
      {},
      async () => {
        try {
          // For now, return info about the current authenticated account
          const tokenInfo = await this.oauth2Client.getTokenInfo(this.props.googleTokens.access_token) as any;
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                accounts: [{
                  email: tokenInfo.email || this.props.email,
                  status: "authenticated",
                  scopes: tokenInfo.scopes || [],
                  expiresAt: new Date(this.props.googleTokens.expires_at).toISOString()
                }]
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to list accounts: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );
  }

  private registerGmailTools() {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    this.server.tool(
      "emails_search",
      "Search emails in a Gmail account with advanced filtering capabilities",
      {
        email: z.string().describe("Email address of the Gmail account"),
        search: z.object({
          query: z.string().optional().describe("Complex Gmail search query"),
          from: z.union([z.string(), z.array(z.string())]).optional(),
          to: z.union([z.string(), z.array(z.string())]).optional(),
          subject: z.string().optional(),
          labels: z.array(z.string()).optional(),
          hasAttachment: z.boolean().optional(),
          isUnread: z.boolean().optional(),
          after: z.string().optional().describe("Search emails after this date in YYYY-MM-DD format"),
          before: z.string().optional().describe("Search emails before this date in YYYY-MM-DD format"),
          includeSpam: z.boolean().optional().default(false),
          excludeLabels: z.array(z.string()).optional()
        }).optional(),
        maxResults: z.number().optional().default(10).describe("Maximum number of emails to return")
      },
      async ({ email, search = {}, maxResults }) => {
        try {
          // Build the search query
          let query = search.query || '';
          
          if (search.from) {
            const fromAddresses = Array.isArray(search.from) ? search.from : [search.from];
            query += ' ' + fromAddresses.map((addr: string) => `from:(${addr})`).join(' OR ');
          }
          
          if (search.to) {
            const toAddresses = Array.isArray(search.to) ? search.to : [search.to];
            query += ' ' + toAddresses.map((addr: string) => `to:(${addr})`).join(' OR ');
          }
          
          if (search.subject) {
            query += ` subject:"${search.subject}"`;
          }
          
          if (search.hasAttachment !== undefined) {
            query += search.hasAttachment ? ' has:attachment' : ' -has:attachment';
          }
          
          if (search.isUnread !== undefined) {
            query += search.isUnread ? ' is:unread' : ' is:read';
          }
          
          if (search.after) {
            query += ` after:${search.after}`;
          }
          
          if (search.before) {
            query += ` before:${search.before}`;
          }
          
          if (!search.includeSpam) {
            query += ' -in:spam -in:trash';
          }
          
          if (search.labels && search.labels.length > 0) {
            query += ' ' + search.labels.map((label: string) => `label:${label}`).join(' ');
          }
          
          if (search.excludeLabels && search.excludeLabels.length > 0) {
            query += ' ' + search.excludeLabels.map((label: string) => `-label:${label}`).join(' ');
          }

          const response = await gmail.users.messages.list({
            userId: 'me',
            q: query.trim(),
            maxResults,
          });

          const messages = response.data.messages || [];
          
          // Fetch details for each message
          const messageDetails = await Promise.all(
            messages.map(async (msg) => {
              const detail = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Subject', 'Date']
              });
              
              return {
                id: detail.data.id,
                threadId: detail.data.threadId,
                labels: detail.data.labelIds,
                snippet: detail.data.snippet,
                headers: detail.data.payload?.headers?.reduce((acc, header) => {
                  if (header.name && header.value) {
                    acc[header.name] = header.value;
                  }
                  return acc;
                }, {} as Record<string, string>)
              };
            })
          );

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                resultSizeEstimate: response.data.resultSizeEstimate,
                messages: messageDetails
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Gmail search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    this.server.tool(
      "email_send",
      "Send an email from a Gmail account",
      {
        email: z.string().describe("Email address to send from"),
        to: z.array(z.string()).describe("List of recipient email addresses"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body content"),
        cc: z.array(z.string()).optional().describe("List of CC recipient email addresses"),
        bcc: z.array(z.string()).optional().describe("List of BCC recipient email addresses")
      },
      async ({ email, to, subject, body, cc, bcc }) => {
        try {
          // Construct the email message
          const message = [
            'Content-Type: text/plain; charset="UTF-8"',
            'MIME-Version: 1.0',
            `To: ${to.join(', ')}`,
            `Subject: ${subject}`,
          ];
          
          if (cc && cc.length > 0) {
            message.push(`Cc: ${cc.join(', ')}`);
          }
          
          if (bcc && bcc.length > 0) {
            message.push(`Bcc: ${bcc.join(', ')}`);
          }
          
          message.push('', body);
          
          const encodedMessage = Buffer.from(message.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          
          const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
              raw: encodedMessage,
            },
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: response.data.id,
                threadId: response.data.threadId
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Add more Gmail tools here...
  }

  private registerCalendarTools() {
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

    this.server.tool(
      "calendar_events_list",
      "Get calendar events with optional filtering",
      {
        email: z.string().describe("Email address of the calendar owner"),
        timeMin: z.string().optional().describe("Start of time range to search (ISO date string)"),
        timeMax: z.string().optional().describe("End of time range to search (ISO date string)"),
        query: z.string().optional().describe("Optional text search within events"),
        maxResults: z.number().optional().default(10).describe("Maximum number of events to return")
      },
      async ({ email, timeMin, timeMax, query, maxResults }) => {
        try {
          const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin || new Date().toISOString(),
            timeMax: timeMax,
            maxResults,
            singleEvents: true,
            orderBy: 'startTime',
            q: query
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                events: response.data.items,
                nextPageToken: response.data.nextPageToken
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to list calendar events: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    this.server.tool(
      "calendar_event_create",
      "Create a new calendar event",
      {
        email: z.string().describe("Email address of the calendar owner"),
        summary: z.string().describe("Event title"),
        start: z.object({
          dateTime: z.string().describe("Event start time (ISO date string)"),
          timeZone: z.string().optional().describe("Timezone for start time")
        }),
        end: z.object({
          dateTime: z.string().describe("Event end time (ISO date string)"),
          timeZone: z.string().optional().describe("Timezone for end time")
        }),
        description: z.string().optional().describe("Optional event description"),
        attendees: z.array(z.object({
          email: z.string().describe("Attendee email address")
        })).optional().describe("Optional list of event attendees"),
        recurrence: z.array(z.string()).optional().describe("RRULE strings for recurring events")
      },
      async ({ email, summary, start, end, description, attendees, recurrence }) => {
        try {
          const event = {
            summary,
            description,
            start,
            end,
            attendees,
            recurrence,
            reminders: {
              useDefault: true
            }
          };

          const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
            sendNotifications: true
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                eventId: response.data.id,
                htmlLink: response.data.htmlLink,
                status: response.data.status
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to create calendar event: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Add more calendar tools here...
  }

  private registerDriveTools() {
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    this.server.tool(
      "drive_files_list",
      "List files in a Google Drive account with optional filtering",
      {
        email: z.string().describe("Email address of the Drive account"),
        options: z.object({
          folderId: z.string().optional().describe("Optional folder ID to list contents of"),
          query: z.string().optional().describe("Custom query string for filtering"),
          pageSize: z.number().optional().describe("Maximum number of files to return"),
          fields: z.array(z.string()).optional().describe("Fields to include in response"),
          orderBy: z.array(z.string()).optional().describe("Sort order fields")
        }).optional()
      },
      async ({ email, options = {} }) => {
        try {
          let query = options.query || '';
          
          if (options.folderId) {
            query = `'${options.folderId}' in parents` + (query ? ` and ${query}` : '');
          }

          const response = await drive.files.list({
            q: query,
            pageSize: options.pageSize || 100,
            fields: options.fields ? options.fields.join(',') : 'files(id, name, mimeType, modifiedTime, size, parents)',
            orderBy: options.orderBy ? options.orderBy.join(',') : undefined
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                files: response.data.files,
                nextPageToken: response.data.nextPageToken
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to list Drive files: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    this.server.tool(
      "drive_file_upload",
      "Upload a file to Google Drive",
      {
        email: z.string().describe("Email address of the Drive account"),
        options: z.object({
          name: z.string().describe("Name for the uploaded file"),
          content: z.string().describe("File content (string or base64)"),
          mimeType: z.string().optional().describe("MIME type of the file"),
          parents: z.array(z.string()).optional().describe("Parent folder IDs")
        })
      },
      async ({ email, options }) => {
        try {
          const fileMetadata = {
            name: options.name,
            parents: options.parents
          };

          const media = {
            mimeType: options.mimeType || 'text/plain',
            body: options.content
          };

          const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink'
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                fileId: response.data.id,
                fileName: response.data.name,
                webViewLink: response.data.webViewLink
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Add more Drive tools here...
  }

  private registerContactsTools() {
    const people = google.people({ version: 'v1', auth: this.oauth2Client });

    this.server.tool(
      "contacts_get",
      "Retrieve contacts from a Google account",
      {
        email: z.string().describe("Email address of the Google account"),
        personFields: z.string().describe("Comma-separated fields to include in the response"),
        pageSize: z.number().optional().default(100).describe("Maximum number of contacts to return"),
        pageToken: z.string().optional().describe("Page token from a previous response")
      },
      async ({ email, personFields, pageSize, pageToken }) => {
        try {
          const response = await people.people.connections.list({
            resourceName: 'people/me',
            personFields,
            pageSize,
            pageToken
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                connections: response.data.connections,
                nextPageToken: response.data.nextPageToken,
                totalPeople: response.data.totalPeople
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to retrieve contacts: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Add more contacts tools here...
  }
}

