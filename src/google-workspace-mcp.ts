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
        
        // Persist the updated tokens back to Durable Objects storage
        try {
          await this.updateProps({
            googleTokens: this.props.googleTokens
          });
          console.log('Successfully persisted updated tokens to Durable Objects');
        } catch (error) {
          console.error('Failed to persist tokens:', error);
        }
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

    // Get message details
    this.server.tool(
      "gmail_get_message",
      "Get full details of a specific email message",
      {
        email: z.string().describe("Email address of the Gmail account"),
        messageId: z.string().describe("ID of the message to retrieve"),
        format: z.enum(["minimal", "full", "raw", "metadata"]).optional().default("full")
      },
      async ({ email, messageId, format }) => {
        try {
          const response = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to get message: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Trash/untrash messages
    this.server.tool(
      "gmail_trash_message",
      "Move a message to trash",
      {
        email: z.string().describe("Email address of the Gmail account"),
        messageId: z.string().describe("ID of the message to trash")
      },
      async ({ email, messageId }) => {
        try {
          const response = await gmail.users.messages.trash({
            userId: 'me',
            id: messageId
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: response.data.id,
                labelIds: response.data.labelIds
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to trash message: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    this.server.tool(
      "gmail_untrash_message",
      "Recover a message from trash",
      {
        email: z.string().describe("Email address of the Gmail account"),
        messageId: z.string().describe("ID of the message to untrash")
      },
      async ({ email, messageId }) => {
        try {
          const response = await gmail.users.messages.untrash({
            userId: 'me',
            id: messageId
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: response.data.id,
                labelIds: response.data.labelIds
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to untrash message: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Draft management
    this.server.tool(
      "draft_manage",
      "Manage Gmail drafts with CRUD operations and sending",
      {
        email: z.string().describe("Email address of the Gmail account"),
        action: z.enum(["create", "read", "update", "delete", "send"]).describe("Operation to perform"),
        draftId: z.string().optional().describe("Draft ID (required for read/update/delete/send)"),
        data: z.object({
          to: z.array(z.string()).optional(),
          subject: z.string().optional(),
          body: z.string().optional(),
          cc: z.array(z.string()).optional(),
          bcc: z.array(z.string()).optional(),
          replyToMessageId: z.string().optional(),
          threadId: z.string().optional()
        }).optional()
      },
      async ({ email, action, draftId, data }) => {
        try {
          switch (action) {
            case "create": {
              const message = [
                'Content-Type: text/plain; charset="UTF-8"',
                'MIME-Version: 1.0',
                data?.to ? `To: ${data.to.join(', ')}` : '',
                data?.subject ? `Subject: ${data.subject}` : '',
                data?.cc ? `Cc: ${data.cc.join(', ')}` : '',
                data?.bcc ? `Bcc: ${data.bcc.join(', ')}` : '',
                data?.replyToMessageId ? `In-Reply-To: ${data.replyToMessageId}` : '',
                data?.replyToMessageId ? `References: ${data.replyToMessageId}` : '',
                '',
                data?.body || ''
              ].filter(line => line).join('\r\n');

              const encodedMessage = Buffer.from(message).toString('base64')
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

              const response = await gmail.users.drafts.create({
                userId: 'me',
                requestBody: {
                  message: {
                    raw: encodedMessage,
                    threadId: data?.threadId
                  }
                }
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    draftId: response.data.id,
                    message: response.data.message
                  }, null, 2)
                }]
              };
            }

            case "read": {
              if (!draftId) {
                // List all drafts
                const response = await gmail.users.drafts.list({
                  userId: 'me',
                  maxResults: 20
                });

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify(response.data, null, 2)
                  }]
                };
              } else {
                // Get specific draft
                const response = await gmail.users.drafts.get({
                  userId: 'me',
                  id: draftId
                });

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify(response.data, null, 2)
                  }]
                };
              }
            }

            case "update": {
              if (!draftId) throw new Error("draftId required for update");
              
              const message = [
                'Content-Type: text/plain; charset="UTF-8"',
                'MIME-Version: 1.0',
                data?.to ? `To: ${data.to.join(', ')}` : '',
                data?.subject ? `Subject: ${data.subject}` : '',
                data?.cc ? `Cc: ${data.cc.join(', ')}` : '',
                data?.bcc ? `Bcc: ${data.bcc.join(', ')}` : '',
                '',
                data?.body || ''
              ].filter(line => line).join('\r\n');

              const encodedMessage = Buffer.from(message).toString('base64')
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

              const response = await gmail.users.drafts.update({
                userId: 'me',
                id: draftId,
                requestBody: {
                  message: {
                    raw: encodedMessage,
                    threadId: data?.threadId
                  }
                }
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response.data, null, 2)
                }]
              };
            }

            case "delete": {
              if (!draftId) throw new Error("draftId required for delete");
              
              await gmail.users.drafts.delete({
                userId: 'me',
                id: draftId
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, deleted: draftId }, null, 2)
                }]
              };
            }

            case "send": {
              if (!draftId) throw new Error("draftId required for send");
              
              const response = await gmail.users.drafts.send({
                userId: 'me',
                requestBody: {
                  id: draftId
                }
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
            }

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          throw new Error(`Draft operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Label management
    this.server.tool(
      "label_manage",
      "Manage Gmail labels with CRUD operations",
      {
        email: z.string().describe("Email address of the Gmail account"),
        action: z.enum(["create", "read", "update", "delete"]).describe("Operation to perform"),
        labelId: z.string().optional().describe("Label ID (required for read/update/delete)"),
        data: z.object({
          name: z.string().optional(),
          messageListVisibility: z.enum(["show", "hide"]).optional(),
          labelListVisibility: z.enum(["labelShow", "labelHide", "labelShowIfUnread"]).optional(),
          color: z.object({
            backgroundColor: z.string().optional(),
            textColor: z.string().optional()
          }).optional()
        }).optional()
      },
      async ({ email, action, labelId, data }) => {
        try {
          switch (action) {
            case "create": {
              if (!data?.name) throw new Error("Label name required");
              
              const response = await gmail.users.labels.create({
                userId: 'me',
                requestBody: {
                  name: data.name,
                  messageListVisibility: data.messageListVisibility,
                  labelListVisibility: data.labelListVisibility,
                  color: data.color
                }
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response.data, null, 2)
                }]
              };
            }

            case "read": {
              if (!labelId) {
                // List all labels
                const response = await gmail.users.labels.list({
                  userId: 'me'
                });

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify(response.data, null, 2)
                  }]
                };
              } else {
                // Get specific label
                const response = await gmail.users.labels.get({
                  userId: 'me',
                  id: labelId
                });

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify(response.data, null, 2)
                  }]
                };
              }
            }

            case "update": {
              if (!labelId) throw new Error("labelId required for update");
              
              const response = await gmail.users.labels.update({
                userId: 'me',
                id: labelId,
                requestBody: {
                  name: data?.name,
                  messageListVisibility: data?.messageListVisibility,
                  labelListVisibility: data?.labelListVisibility,
                  color: data?.color
                }
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response.data, null, 2)
                }]
              };
            }

            case "delete": {
              if (!labelId) throw new Error("labelId required for delete");
              
              await gmail.users.labels.delete({
                userId: 'me',
                id: labelId
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, deleted: labelId }, null, 2)
                }]
              };
            }

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          throw new Error(`Label operation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Label assignment
    this.server.tool(
      "label_assign",
      "Manage label assignments for Gmail messages",
      {
        email: z.string().describe("Email address of the Gmail account"),
        action: z.enum(["add", "remove"]).describe("Whether to add or remove labels"),
        messageId: z.string().describe("ID of the message to modify"),
        labelIds: z.array(z.string()).describe("Array of label IDs to add or remove")
      },
      async ({ email, action, messageId, labelIds }) => {
        try {
          const response = await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
              addLabelIds: action === 'add' ? labelIds : undefined,
              removeLabelIds: action === 'remove' ? labelIds : undefined
            }
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: response.data.id,
                labelIds: response.data.labelIds
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to ${action} labels: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );
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

    // Get specific event
    this.server.tool(
      "calendar_event_get",
      "Get a single calendar event by ID",
      {
        email: z.string().describe("Email address of the calendar owner"),
        eventId: z.string().describe("Unique identifier of the event to retrieve")
      },
      async ({ email, eventId }) => {
        try {
          const response = await calendar.events.get({
            calendarId: 'primary',
            eventId
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to get event: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Update event
    this.server.tool(
      "calendar_event_update",
      "Update an existing calendar event",
      {
        email: z.string().describe("Email address of the calendar owner"),
        eventId: z.string().describe("ID of the event to update"),
        summary: z.string().optional().describe("Event title"),
        start: z.object({
          dateTime: z.string().describe("Event start time (ISO date string)"),
          timeZone: z.string().optional().describe("Timezone for start time")
        }).optional(),
        end: z.object({
          dateTime: z.string().describe("Event end time (ISO date string)"),
          timeZone: z.string().optional().describe("Timezone for end time")
        }).optional(),
        description: z.string().optional().describe("Event description"),
        attendees: z.array(z.object({
          email: z.string().describe("Attendee email address")
        })).optional().describe("List of event attendees"),
        recurrence: z.array(z.string()).optional().describe("RRULE strings for recurring events")
      },
      async ({ email, eventId, ...updateData }) => {
        try {
          // Get current event first
          const currentEvent = await calendar.events.get({
            calendarId: 'primary',
            eventId
          });

          // Merge update data with current event
          const updatedEvent = {
            ...currentEvent.data,
            ...updateData
          };

          const response = await calendar.events.update({
            calendarId: 'primary',
            eventId,
            requestBody: updatedEvent,
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
          throw new Error(`Failed to update event: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Delete event
    this.server.tool(
      "calendar_event_delete",
      "Delete a calendar event",
      {
        email: z.string().describe("Email address of the calendar owner"),
        eventId: z.string().describe("ID of the event to delete"),
        sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().describe("Whether to send update notifications")
      },
      async ({ email, eventId, sendUpdates }) => {
        try {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId,
            sendUpdates: sendUpdates || 'all'
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                deleted: eventId
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to delete event: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Manage event responses
    this.server.tool(
      "calendar_event_manage",
      "Manage calendar event responses and updates including accept/decline",
      {
        email: z.string().describe("Email address of the calendar owner"),
        eventId: z.string().describe("ID of the event to manage"),
        action: z.enum(["accept", "decline", "tentative"]).describe("Action to perform on the event"),
        comment: z.string().optional().describe("Optional comment to include with the response")
      },
      async ({ email, eventId, action, comment }) => {
        try {
          // First get the event
          const event = await calendar.events.get({
            calendarId: 'primary',
            eventId
          });

          // Find the current user in attendees
          const attendeeIndex = event.data.attendees?.findIndex(
            attendee => attendee.email === email || attendee.self
          );

          if (attendeeIndex === undefined || attendeeIndex < 0) {
            throw new Error("You are not an attendee of this event");
          }

          // Update attendee response
          const attendees = [...(event.data.attendees || [])];
          attendees[attendeeIndex] = {
            ...attendees[attendeeIndex],
            responseStatus: action === 'accept' ? 'accepted' : 
                          action === 'decline' ? 'declined' : 'tentative',
            comment: comment
          };

          // Update the event
          const response = await calendar.events.update({
            calendarId: 'primary',
            eventId,
            requestBody: {
              ...event.data,
              attendees
            },
            sendNotifications: true
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                eventId: response.data.id,
                responseStatus: action,
                comment: comment
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to manage event: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );
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

    // Search files
    this.server.tool(
      "drive_files_search",
      "Search for files in Google Drive with advanced filtering",
      {
        email: z.string().describe("Email address of the Drive account"),
        options: z.object({
          fullText: z.string().optional().describe("Full text search query"),
          mimeType: z.string().optional().describe("Filter by MIME type"),
          folderId: z.string().optional().describe("Filter by parent folder ID"),
          trashed: z.boolean().optional().describe("Include trashed files"),
          pageSize: z.number().optional().describe("Maximum number of files to return"),
          query: z.string().optional().describe("Additional query string")
        })
      },
      async ({ email, options }) => {
        try {
          let query = '';
          
          if (options.fullText) {
            query += `fullText contains '${options.fullText}'`;
          }
          
          if (options.mimeType) {
            query += (query ? ' and ' : '') + `mimeType = '${options.mimeType}'`;
          }
          
          if (options.folderId) {
            query += (query ? ' and ' : '') + `'${options.folderId}' in parents`;
          }
          
          if (options.trashed !== undefined) {
            query += (query ? ' and ' : '') + `trashed = ${options.trashed}`;
          }
          
          if (options.query) {
            query += (query ? ' and ' : '') + options.query;
          }

          const response = await drive.files.list({
            q: query || undefined,
            pageSize: options.pageSize || 100,
            fields: 'files(id, name, mimeType, modifiedTime, size, parents, webViewLink, webContentLink)'
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
          throw new Error(`Failed to search files: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Download file
    this.server.tool(
      "drive_file_download",
      "Download a file from Google Drive",
      {
        email: z.string().describe("Email address of the Drive account"),
        fileId: z.string().describe("ID of the file to download"),
        mimeType: z.string().optional().describe("Optional MIME type for export format")
      },
      async ({ email, fileId, mimeType }) => {
        try {
          // First get file metadata
          const metadataResponse = await drive.files.get({
            fileId,
            fields: 'id, name, mimeType, size'
          });

          const file = metadataResponse.data;
          
          // For Google Workspace files, we need to export them
          const isGoogleDoc = file.mimeType?.startsWith('application/vnd.google-apps.');
          
          if (isGoogleDoc && !mimeType) {
            // Set default export mime types
            const exportMimeTypes: Record<string, string> = {
              'application/vnd.google-apps.document': 'text/plain',
              'application/vnd.google-apps.spreadsheet': 'text/csv',
              'application/vnd.google-apps.presentation': 'application/pdf',
              'application/vnd.google-apps.drawing': 'image/png'
            };
            mimeType = exportMimeTypes[file.mimeType!] || 'application/pdf';
          }

          let content: string;
          
          if (isGoogleDoc) {
            // Export Google Workspace file
            const response = await drive.files.export({
              fileId,
              mimeType: mimeType!
            }, { responseType: 'text' });
            
            content = response.data as string;
          } else {
            // Download regular file
            const response = await drive.files.get({
              fileId,
              alt: 'media'
            }, { responseType: 'text' });
            
            content = response.data as string;
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                fileId: file.id,
                fileName: file.name,
                mimeType: mimeType || file.mimeType,
                content: content,
                size: content.length
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to download file: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Create folder
    this.server.tool(
      "drive_folder_create",
      "Create a new folder in Google Drive",
      {
        email: z.string().describe("Email address of the Drive account"),
        name: z.string().describe("Name for the new folder"),
        parentId: z.string().optional().describe("Optional parent folder ID")
      },
      async ({ email, name, parentId }) => {
        try {
          const fileMetadata = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : undefined
          };

          const response = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id, name, webViewLink'
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                folderId: response.data.id,
                folderName: response.data.name,
                webViewLink: response.data.webViewLink
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to create folder: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Update permissions
    this.server.tool(
      "drive_permissions_update",
      "Update sharing permissions for a Drive file or folder",
      {
        email: z.string().describe("Email address of the Drive account"),
        options: z.object({
          fileId: z.string().describe("ID of file/folder to update"),
          role: z.enum(["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"]),
          type: z.enum(["user", "group", "domain", "anyone"]),
          emailAddress: z.string().optional().describe("Email address for user/group sharing"),
          domain: z.string().optional().describe("Domain for domain sharing"),
          allowFileDiscovery: z.boolean().optional().describe("Allow file discovery for anyone sharing")
        })
      },
      async ({ email, options }) => {
        try {
          const permission: any = {
            type: options.type,
            role: options.role
          };

          if (options.type === 'user' || options.type === 'group') {
            if (!options.emailAddress) {
              throw new Error("emailAddress required for user/group sharing");
            }
            permission.emailAddress = options.emailAddress;
          }

          if (options.type === 'domain') {
            if (!options.domain) {
              throw new Error("domain required for domain sharing");
            }
            permission.domain = options.domain;
          }

          if (options.type === 'anyone') {
            permission.allowFileDiscovery = options.allowFileDiscovery;
          }

          const response = await drive.permissions.create({
            fileId: options.fileId,
            requestBody: permission,
            sendNotificationEmail: true
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                permissionId: response.data.id,
                role: response.data.role,
                type: response.data.type
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to update permissions: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );

    // Delete file
    this.server.tool(
      "drive_file_delete",
      "Delete a file or folder from Google Drive",
      {
        email: z.string().describe("Email address of the Drive account"),
        fileId: z.string().describe("ID of the file/folder to delete")
      },
      async ({ email, fileId }) => {
        try {
          await drive.files.delete({
            fileId
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                deleted: fileId
              }, null, 2)
            }]
          };
        } catch (error) {
          throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );
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

