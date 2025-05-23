import { Tool } from "../mcp/types";

export function getGmailTools(): Tool[] {
  return [
    {
      name: "gmail_search_messages",
      description: "Search for email messages in Gmail",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Gmail search query (e.g., 'from:example@gmail.com', 'subject:invoice', 'has:attachment')",
          },
          maxResults: {
            type: "number",
            description:
              "Maximum number of results to return (default: 10, max: 100)",
            minimum: 1,
            maximum: 100,
          },
          includeSpamTrash: {
            type: "boolean",
            description:
              "Include messages from SPAM and TRASH (default: false)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "gmail_get_message",
      description: "Get a specific email message by ID",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The ID of the message to retrieve",
          },
          format: {
            type: "string",
            enum: ["full", "metadata", "minimal"],
            description: "The format to return the message in (default: full)",
          },
        },
        required: ["messageId"],
      },
    },
    {
      name: "gmail_send_message",
      description: "Send an email message",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: { type: "string" },
            description: "Recipient email addresses",
          },
          subject: {
            type: "string",
            description: "Email subject",
          },
          body: {
            type: "string",
            description: "Email body (plain text or HTML)",
          },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "CC recipients",
          },
          bcc: {
            type: "array",
            items: { type: "string" },
            description: "BCC recipients",
          },
          attachments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                filename: { type: "string" },
                mimeType: { type: "string" },
                data: {
                  type: "string",
                  description: "Base64 encoded file data",
                },
              },
              required: ["filename", "mimeType", "data"],
            },
          },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "gmail_modify_labels",
      description: "Add or remove labels from a message",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The ID of the message to modify",
          },
          addLabels: {
            type: "array",
            items: { type: "string" },
            description: "Label IDs to add",
          },
          removeLabels: {
            type: "array",
            items: { type: "string" },
            description: "Label IDs to remove",
          },
        },
        required: ["messageId"],
      },
    },
    {
      name: "gmail_trash_message",
      description: "Move a message to trash",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The ID of the message to trash",
          },
        },
        required: ["messageId"],
      },
    },
    {
      name: "gmail_untrash_message",
      description: "Remove a message from trash",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The ID of the message to untrash",
          },
        },
        required: ["messageId"],
      },
    },
    {
      name: "gmail_create_draft",
      description: "Create a draft email",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: { type: "string" },
            description: "Recipient email addresses",
          },
          subject: {
            type: "string",
            description: "Email subject",
          },
          body: {
            type: "string",
            description: "Email body (plain text or HTML)",
          },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "CC recipients",
          },
          bcc: {
            type: "array",
            items: { type: "string" },
            description: "BCC recipients",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "gmail_list_labels",
      description: "List all labels in the mailbox",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  ];
}
