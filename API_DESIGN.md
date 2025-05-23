# API Design

Complete tool definitions and API structure for the Google Workspace MCP Server.

## Tool Naming Convention

All tools follow the pattern: `{service}_{action}_{object}`

Examples:
- `gmail_search_messages`
- `calendar_create_event`
- `drive_upload_file`
- `contacts_get_person`

## Gmail Tools

### gmail_search_messages
Search for emails matching specific criteria.

```typescript
{
  name: "gmail_search_messages",
  description: "Search emails in Gmail with advanced filtering",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Gmail search query (e.g., 'from:user@example.com subject:meeting')"
      },
      maxResults: {
        type: "number",
        description: "Maximum number of messages to return",
        default: 10,
        minimum: 1,
        maximum: 500
      },
      pageToken: {
        type: "string",
        description: "Token for pagination"
      },
      includeSpamTrash: {
        type: "boolean",
        description: "Include messages from SPAM and TRASH",
        default: false
      },
      labelIds: {
        type: "array",
        items: { type: "string" },
        description: "Filter by label IDs"
      }
    },
    required: ["query"]
  }
}
```

### gmail_get_message
Get a specific email by ID with full content.

```typescript
{
  name: "gmail_get_message",
  description: "Get a specific email message with full content",
  parameters: {
    type: "object",
    properties: {
      messageId: {
        type: "string",
        description: "The ID of the message to retrieve"
      },
      format: {
        type: "string",
        enum: ["minimal", "full", "raw", "metadata"],
        description: "Format of the message",
        default: "full"
      },
      metadataHeaders: {
        type: "array",
        items: { type: "string" },
        description: "Headers to include when format is metadata"
      }
    },
    required: ["messageId"]
  }
}
```

### gmail_send_message
Send a new email message.

```typescript
{
  name: "gmail_send_message",
  description: "Send an email message",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "array",
        items: { type: "string" },
        description: "Recipient email addresses"
      },
      subject: {
        type: "string",
        description: "Email subject line"
      },
      body: {
        type: "string",
        description: "Email body content (plain text or HTML)"
      },
      cc: {
        type: "array",
        items: { type: "string" },
        description: "CC recipients"
      },
      bcc: {
        type: "array",
        items: { type: "string" },
        description: "BCC recipients"
      },
      bodyType: {
        type: "string",
        enum: ["text", "html"],
        description: "Type of body content",
        default: "text"
      },
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            filename: { type: "string" },
            mimeType: { type: "string" },
            data: { type: "string", description: "Base64 encoded data" }
          },
          required: ["filename", "mimeType", "data"]
        },
        description: "File attachments"
      },
      threadId: {
        type: "string",
        description: "Thread ID to reply to"
      }
    },
    required: ["to", "subject", "body"]
  }
}
```

### gmail_modify_labels
Add or remove labels from messages.

```typescript
{
  name: "gmail_modify_labels",
  description: "Add or remove labels from email messages",
  parameters: {
    type: "object",
    properties: {
      messageIds: {
        type: "array",
        items: { type: "string" },
        description: "IDs of messages to modify"
      },
      addLabelIds: {
        type: "array",
        items: { type: "string" },
        description: "Label IDs to add"
      },
      removeLabelIds: {
        type: "array",
        items: { type: "string" },
        description: "Label IDs to remove"
      }
    },
    required: ["messageIds"]
  }
}
```

### gmail_create_draft
Create a new email draft.

```typescript
{
  name: "gmail_create_draft",
  description: "Create a new email draft",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "array",
        items: { type: "string" },
        description: "Recipient email addresses"
      },
      subject: {
        type: "string",
        description: "Email subject"
      },
      body: {
        type: "string",
        description: "Email body content"
      },
      cc: {
        type: "array",
        items: { type: "string" },
        description: "CC recipients"
      },
      bcc: {
        type: "array",
        items: { type: "string" },
        description: "BCC recipients"
      },
      threadId: {
        type: "string",
        description: "Thread ID for reply drafts"
      }
    },
    required: ["subject", "body"]
  }
}
```

### gmail_list_labels
List all labels in the Gmail account.

```typescript
{
  name: "gmail_list_labels",
  description: "List all labels in the Gmail account",
  parameters: {
    type: "object",
    properties: {},
    required: []
  }
}
```

### gmail_create_label
Create a new label.

```typescript
{
  name: "gmail_create_label",
  description: "Create a new Gmail label",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Label name (use '/' for nested labels)"
      },
      labelListVisibility: {
        type: "string",
        enum: ["labelShow", "labelShowIfUnread", "labelHide"],
        description: "Visibility in label list",
        default: "labelShow"
      },
      messageListVisibility: {
        type: "string",
        enum: ["show", "hide"],
        description: "Visibility in message list",
        default: "show"
      },
      color: {
        type: "object",
        properties: {
          textColor: { type: "string" },
          backgroundColor: { type: "string" }
        },
        description: "Label colors in hex format"
      }
    },
    required: ["name"]
  }
}
```

## Calendar Tools

### calendar_list_events
List calendar events within a time range.

```typescript
{
  name: "calendar_list_events",
  description: "List calendar events within a specified time range",
  parameters: {
    type: "object",
    properties: {
      calendarId: {
        type: "string",
        description: "Calendar ID (use 'primary' for main calendar)",
        default: "primary"
      },
      timeMin: {
        type: "string",
        description: "Start time (ISO 8601 format)"
      },
      timeMax: {
        type: "string",
        description: "End time (ISO 8601 format)"
      },
      maxResults: {
        type: "number",
        description: "Maximum number of events",
        default: 10,
        minimum: 1,
        maximum: 2500
      },
      singleEvents: {
        type: "boolean",
        description: "Expand recurring events",
        default: true
      },
      orderBy: {
        type: "string",
        enum: ["startTime", "updated"],
        description: "Order results by",
        default: "startTime"
      },
      q: {
        type: "string",
        description: "Free text search query"
      }
    },
    required: []
  }
}
```

### calendar_get_event
Get a specific calendar event.

```typescript
{
  name: "calendar_get_event",
  description: "Get details of a specific calendar event",
  parameters: {
    type: "object",
    properties: {
      calendarId: {
        type: "string",
        description: "Calendar ID",
        default: "primary"
      },
      eventId: {
        type: "string",
        description: "Event ID"
      }
    },
    required: ["eventId"]
  }
}
```

### calendar_create_event
Create a new calendar event.

```typescript
{
  name: "calendar_create_event",
  description: "Create a new calendar event",
  parameters: {
    type: "object",
    properties: {
      calendarId: {
        type: "string",
        description: "Calendar ID",
        default: "primary"
      },
      summary: {
        type: "string",
        description: "Event title"
      },
      description: {
        type: "string",
        description: "Event description"
      },
      location: {
        type: "string",
        description: "Event location"
      },
      start: {
        type: "object",
        properties: {
          dateTime: {
            type: "string",
            description: "Start time (ISO 8601)"
          },
          date: {
            type: "string",
            description: "Start date for all-day events (YYYY-MM-DD)"
          },
          timeZone: {
            type: "string",
            description: "Time zone (e.g., 'America/New_York')"
          }
        }
      },
      end: {
        type: "object",
        properties: {
          dateTime: {
            type: "string",
            description: "End time (ISO 8601)"
          },
          date: {
            type: "string",
            description: "End date for all-day events"
          },
          timeZone: {
            type: "string",
            description: "Time zone"
          }
        }
      },
      attendees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            email: { type: "string" },
            displayName: { type: "string" },
            optional: { type: "boolean" },
            responseStatus: {
              type: "string",
              enum: ["needsAction", "declined", "tentative", "accepted"]
            }
          },
          required: ["email"]
        },
        description: "Event attendees"
      },
      reminders: {
        type: "object",
        properties: {
          useDefault: { type: "boolean" },
          overrides: {
            type: "array",
            items: {
              type: "object",
              properties: {
                method: {
                  type: "string",
                  enum: ["email", "popup"]
                },
                minutes: { type: "number" }
              }
            }
          }
        }
      },
      recurrence: {
        type: "array",
        items: { type: "string" },
        description: "RRULE strings for recurring events"
      },
      visibility: {
        type: "string",
        enum: ["default", "public", "private", "confidential"],
        default: "default"
      },
      guestsCanModify: {
        type: "boolean",
        default: false
      },
      guestsCanInviteOthers: {
        type: "boolean",
        default: true
      },
      guestsCanSeeOtherGuests: {
        type: "boolean",
        default: true
      }
    },
    required: ["summary", "start", "end"]
  }
}
```

### calendar_update_event
Update an existing calendar event.

```typescript
{
  name: "calendar_update_event",
  description: "Update an existing calendar event",
  parameters: {
    type: "object",
    properties: {
      calendarId: {
        type: "string",
        description: "Calendar ID",
        default: "primary"
      },
      eventId: {
        type: "string",
        description: "Event ID to update"
      },
      // Same properties as create_event except all optional
      summary: { type: "string" },
      description: { type: "string" },
      location: { type: "string" },
      // ... other properties
      sendUpdates: {
        type: "string",
        enum: ["all", "externalOnly", "none"],
        description: "Who to send notifications to",
        default: "all"
      }
    },
    required: ["eventId"]
  }
}
```

### calendar_delete_event
Delete a calendar event.

```typescript
{
  name: "calendar_delete_event",
  description: "Delete a calendar event",
  parameters: {
    type: "object",
    properties: {
      calendarId: {
        type: "string",
        description: "Calendar ID",
        default: "primary"
      },
      eventId: {
        type: "string",
        description: "Event ID to delete"
      },
      sendUpdates: {
        type: "string",
        enum: ["all", "externalOnly", "none"],
        description: "Who to notify about cancellation",
        default: "all"
      }
    },
    required: ["eventId"]
  }
}
```

### calendar_quick_add
Create an event using natural language.

```typescript
{
  name: "calendar_quick_add",
  description: "Create an event using natural language",
  parameters: {
    type: "object",
    properties: {
      calendarId: {
        type: "string",
        description: "Calendar ID",
        default: "primary"
      },
      text: {
        type: "string",
        description: "Natural language event description (e.g., 'Dinner with John tomorrow at 7pm')"
      }
    },
    required: ["text"]
  }
}
```

## Drive Tools

### drive_list_files
List files and folders in Google Drive.

```typescript
{
  name: "drive_list_files",
  description: "List files and folders in Google Drive",
  parameters: {
    type: "object",
    properties: {
      q: {
        type: "string",
        description: "Search query (Drive API query format)"
      },
      pageSize: {
        type: "number",
        description: "Number of files to return",
        default: 10,
        minimum: 1,
        maximum: 1000
      },
      pageToken: {
        type: "string",
        description: "Token for pagination"
      },
      orderBy: {
        type: "string",
        description: "Sort order (e.g., 'modifiedTime desc')"
      },
      fields: {
        type: "string",
        description: "Fields to include in response",
        default: "files(id,name,mimeType,size,modifiedTime,parents)"
      },
      spaces: {
        type: "string",
        description: "Comma-separated list of spaces to query",
        default: "drive"
      },
      includeItemsFromAllDrives: {
        type: "boolean",
        description: "Include shared drive items",
        default: false
      }
    },
    required: []
  }
}
```

### drive_get_file
Get metadata for a specific file.

```typescript
{
  name: "drive_get_file",
  description: "Get metadata for a specific file",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "File ID"
      },
      fields: {
        type: "string",
        description: "Fields to include in response",
        default: "*"
      }
    },
    required: ["fileId"]
  }
}
```

### drive_download_file
Download file content from Google Drive.

```typescript
{
  name: "drive_download_file",
  description: "Download file content from Google Drive",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "File ID to download"
      },
      mimeType: {
        type: "string",
        description: "Export MIME type for Google Workspace files"
      }
    },
    required: ["fileId"]
  }
}
```

### drive_upload_file
Upload a file to Google Drive.

```typescript
{
  name: "drive_upload_file",
  description: "Upload a file to Google Drive",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "File name"
      },
      content: {
        type: "string",
        description: "File content (base64 encoded for binary files)"
      },
      mimeType: {
        type: "string",
        description: "MIME type of the file"
      },
      parents: {
        type: "array",
        items: { type: "string" },
        description: "Parent folder IDs"
      },
      description: {
        type: "string",
        description: "File description"
      },
      isBase64: {
        type: "boolean",
        description: "Whether content is base64 encoded",
        default: false
      }
    },
    required: ["name", "content", "mimeType"]
  }
}
```

### drive_update_file
Update file content or metadata.

```typescript
{
  name: "drive_update_file",
  description: "Update file content or metadata",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "File ID to update"
      },
      name: {
        type: "string",
        description: "New file name"
      },
      content: {
        type: "string",
        description: "New file content"
      },
      mimeType: {
        type: "string",
        description: "New MIME type"
      },
      addParents: {
        type: "array",
        items: { type: "string" },
        description: "Parent IDs to add"
      },
      removeParents: {
        type: "array",
        items: { type: "string" },
        description: "Parent IDs to remove"
      },
      description: {
        type: "string",
        description: "New description"
      }
    },
    required: ["fileId"]
  }
}
```

### drive_delete_file
Delete a file or folder.

```typescript
{
  name: "drive_delete_file",
  description: "Delete a file or folder",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "File ID to delete"
      }
    },
    required: ["fileId"]
  }
}
```

### drive_create_folder
Create a new folder in Google Drive.

```typescript
{
  name: "drive_create_folder",
  description: "Create a new folder in Google Drive",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Folder name"
      },
      parents: {
        type: "array",
        items: { type: "string" },
        description: "Parent folder IDs"
      },
      description: {
        type: "string",
        description: "Folder description"
      }
    },
    required: ["name"]
  }
}
```

### drive_share_file
Update sharing permissions for a file.

```typescript
{
  name: "drive_share_file",
  description: "Update sharing permissions for a file",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "File ID"
      },
      role: {
        type: "string",
        enum: ["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"],
        description: "Permission role"
      },
      type: {
        type: "string",
        enum: ["user", "group", "domain", "anyone"],
        description: "Permission type"
      },
      emailAddress: {
        type: "string",
        description: "Email for user/group permissions"
      },
      domain: {
        type: "string",
        description: "Domain for domain-wide sharing"
      },
      allowFileDiscovery: {
        type: "boolean",
        description: "Whether file is discoverable",
        default: false
      },
      sendNotificationEmail: {
        type: "boolean",
        description: "Send notification email",
        default: true
      },
      emailMessage: {
        type: "string",
        description: "Custom message for notification"
      }
    },
    required: ["fileId", "role", "type"]
  }
}
```

## People Tools

### contacts_list_people
List contacts from the Google People API.

```typescript
{
  name: "contacts_list_people",
  description: "List contacts from the Google People API",
  parameters: {
    type: "object",
    properties: {
      pageSize: {
        type: "number",
        description: "Number of contacts to return",
        default: 10,
        minimum: 1,
        maximum: 1000
      },
      pageToken: {
        type: "string",
        description: "Token for pagination"
      },
      personFields: {
        type: "string",
        description: "Comma-separated list of fields to include",
        default: "names,emailAddresses,phoneNumbers,organizations"
      },
      sortOrder: {
        type: "string",
        enum: ["LAST_MODIFIED_ASCENDING", "FIRST_NAME_ASCENDING", "LAST_NAME_ASCENDING"],
        description: "Sort order for results"
      },
      sources: {
        type: "array",
        items: {
          type: "string",
          enum: ["READ_SOURCE_TYPE_CONTACT", "READ_SOURCE_TYPE_DOMAIN_CONTACT"]
        },
        description: "Sources to include",
        default: ["READ_SOURCE_TYPE_CONTACT"]
      }
    },
    required: []
  }
}
```

### contacts_get_person
Get details for a specific person.

```typescript
{
  name: "contacts_get_person",
  description: "Get details for a specific person",
  parameters: {
    type: "object",
    properties: {
      resourceName: {
        type: "string",
        description: "Resource name of the person (e.g., 'people/c12345')"
      },
      personFields: {
        type: "string",
        description: "Comma-separated list of fields to include",
        default: "names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,biographies"
      }
    },
    required: ["resourceName"]
  }
}
```

### contacts_search_people
Search for people.

```typescript
{
  name: "contacts_search_people",
  description: "Search for people by name, email, or phone",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query"
      },
      pageSize: {
        type: "number",
        description: "Number of results",
        default: 10
      },
      readMask: {
        type: "string",
        description: "Fields to include",
        default: "names,emailAddresses,phoneNumbers"
      }
    },
    required: ["query"]
  }
}
```

## Response Formats

### Standard Success Response
```typescript
interface ToolResponse<T = any> {
  success: true;
  data: T;
  metadata?: {
    total?: number;
    pageToken?: string;
    nextPageToken?: string;
  };
}
```

### Standard Error Response
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

### Gmail Message Format
```typescript
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: {
    partId: string;
    mimeType: string;
    filename: string;
    headers: Array<{
      name: string;
      value: string;
    }>;
    body: {
      size: number;
      data?: string;
    };
    parts?: MessagePart[];
  };
  sizeEstimate: number;
  raw?: string;
}
```

### Calendar Event Format
```typescript
interface CalendarEvent {
  kind: "calendar#event";
  etag: string;
  id: string;
  status: string;
  htmlLink: string;
  created: string;
  updated: string;
  summary: string;
  description?: string;
  location?: string;
  creator: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  organizer: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  start: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    organizer?: boolean;
    self?: boolean;
    responseStatus: string;
    optional?: boolean;
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
}
```

### Drive File Format
```typescript
interface DriveFile {
  kind: "drive#file";
  id: string;
  name: string;
  mimeType: string;
  description?: string;
  starred: boolean;
  trashed: boolean;
  parents?: string[];
  properties?: Record<string, string>;
  createdTime: string;
  modifiedTime: string;
  modifiedByMeTime?: string;
  owners?: Array<{
    kind: "drive#user";
    displayName: string;
    emailAddress: string;
    me: boolean;
  }>;
  size?: string;
  webContentLink?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  permissions?: Permission[];
}
```

### Contact Person Format
```typescript
interface Person {
  resourceName: string;
  etag: string;
  metadata: {
    sources: Array<{
      type: string;
      id: string;
      etag: string;
    }>;
  };
  names?: Array<{
    displayName: string;
    familyName?: string;
    givenName?: string;
    middleName?: string;
    displayNameLastFirst?: string;
  }>;
  emailAddresses?: Array<{
    value: string;
    type?: string;
    formattedType?: string;
    displayName?: string;
  }>;
  phoneNumbers?: Array<{
    value: string;
    type?: string;
    formattedType?: string;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
    department?: string;
    type?: string;
    current?: boolean;
  }>;
  addresses?: Array<{
    formattedValue?: string;
    type?: string;
    formattedType?: string;
    poBox?: string;
    streetAddress?: string;
    extendedAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string;
  }>;
}
```

## Rate Limiting

Each tool should implement rate limiting awareness:

```typescript
interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
}

// Include in responses when approaching limits
interface RateLimitedResponse<T> extends ToolResponse<T> {
  rateLimit?: RateLimitInfo;
}
```

## Batch Operations

Some tools support batch operations for efficiency:

### gmail_batch_modify
```typescript
{
  name: "gmail_batch_modify",
  description: "Perform batch operations on multiple messages",
  parameters: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        items: { type: "string" },
        description: "Message IDs to modify"
      },
      addLabelIds: {
        type: "array",
        items: { type: "string" }
      },
      removeLabelIds: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["ids"]
  }
}
```

## Error Codes

Tool-specific error codes:

| Code | Meaning | Example |
|------|---------|---------|
| `GMAIL_001` | Message not found | Invalid message ID |
| `GMAIL_002` | Label already exists | Duplicate label name |
| `CALENDAR_001` | Event not found | Invalid event ID |
| `CALENDAR_002` | Time conflict | Overlapping events |
| `DRIVE_001` | File not found | Invalid file ID |
| `DRIVE_002` | Permission denied | No access to file |
| `CONTACTS_001` | Contact not found | Invalid resource name |
| `AUTH_001` | Token expired | Need refresh |
| `AUTH_002` | Invalid scope | Missing permissions |
| `QUOTA_001` | Rate limit | Too many requests |
| `QUOTA_002` | Storage limit | Drive full |