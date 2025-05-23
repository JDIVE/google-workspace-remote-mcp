import { Tool } from '../mcp/types';

export function getDriveTools(): Tool[] {
  return [
    {
      name: "drive_list_files",
      description: "List files and folders in Google Drive",
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description: "Search query (e.g., \"name contains 'report'\", \"mimeType='application/pdf'\")"
          },
          pageSize: {
            type: "number",
            description: "Number of files to return (default: 10, max: 100)",
            minimum: 1,
            maximum: 100
          },
          orderBy: {
            type: "string",
            description: "Sort order (e.g., 'name', 'modifiedTime desc')"
          },
          fields: {
            type: "string",
            description: "Specific fields to include in the response"
          }
        }
      }
    },
    {
      name: "drive_get_file",
      description: "Get metadata for a specific file",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "The ID of the file"
          },
          fields: {
            type: "string",
            description: "Specific fields to include in the response"
          }
        },
        required: ["fileId"]
      }
    },
    {
      name: "drive_download_file",
      description: "Download file content",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "The ID of the file to download"
          },
          mimeType: {
            type: "string",
            description: "Export MIME type for Google Workspace files"
          }
        },
        required: ["fileId"]
      }
    },
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
          mimeType: {
            type: "string",
            description: "MIME type of the file"
          },
          content: {
            type: "string",
            description: "Base64 encoded file content"
          },
          parents: {
            type: "array",
            items: { type: "string" },
            description: "Parent folder IDs"
          },
          description: {
            type: "string",
            description: "File description"
          }
        },
        required: ["name", "content"]
      }
    },
    {
      name: "drive_update_file",
      description: "Update file content or metadata",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "The ID of the file to update"
          },
          name: {
            type: "string",
            description: "New file name"
          },
          content: {
            type: "string",
            description: "Base64 encoded new file content"
          },
          mimeType: {
            type: "string",
            description: "MIME type of the new content"
          },
          addParents: {
            type: "array",
            items: { type: "string" },
            description: "Parent folder IDs to add"
          },
          removeParents: {
            type: "array",
            items: { type: "string" },
            description: "Parent folder IDs to remove"
          }
        },
        required: ["fileId"]
      }
    },
    {
      name: "drive_delete_file",
      description: "Move a file to trash or permanently delete it",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "The ID of the file to delete"
          },
          permanent: {
            type: "boolean",
            description: "Permanently delete instead of moving to trash"
          }
        },
        required: ["fileId"]
      }
    },
    {
      name: "drive_create_folder",
      description: "Create a new folder",
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
    },
    {
      name: "drive_share_file",
      description: "Update sharing permissions for a file",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "The ID of the file to share"
          },
          role: {
            type: "string",
            enum: ["reader", "writer", "commenter"],
            description: "Permission role"
          },
          type: {
            type: "string",
            enum: ["user", "group", "domain", "anyone"],
            description: "Permission type"
          },
          emailAddress: {
            type: "string",
            description: "Email address for user or group permissions"
          },
          domain: {
            type: "string",
            description: "Domain for domain-wide permissions"
          },
          sendNotificationEmail: {
            type: "boolean",
            description: "Send notification email to the user"
          }
        },
        required: ["fileId", "role", "type"]
      }
    }
  ];
}