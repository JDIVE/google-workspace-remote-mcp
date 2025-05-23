import { Tool } from "../mcp/types";

export function getContactsTools(): Tool[] {
  return [
    {
      name: "contacts_list_people",
      description: "List contacts from Google Contacts",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "number",
            description: "Number of contacts to return (default: 10, max: 100)",
            minimum: 1,
            maximum: 100,
          },
          personFields: {
            type: "array",
            items: { type: "string" },
            description:
              "Fields to include (e.g., 'names', 'emailAddresses', 'phoneNumbers')",
          },
          sortOrder: {
            type: "string",
            enum: [
              "FIRST_NAME_ASCENDING",
              "LAST_NAME_ASCENDING",
              "LAST_MODIFIED_DESCENDING",
            ],
            description: "Sort order for results",
          },
          resourceName: {
            type: "string",
            description: "Resource name to list (default: 'people/me')",
          },
        },
      },
    },
    {
      name: "contacts_get_person",
      description: "Get details for a specific contact",
      parameters: {
        type: "object",
        properties: {
          resourceName: {
            type: "string",
            description:
              "Resource name of the person (e.g., 'people/c1234567890')",
          },
          personFields: {
            type: "array",
            items: { type: "string" },
            description:
              "Fields to include (e.g., 'names', 'emailAddresses', 'phoneNumbers', 'organizations')",
          },
        },
        required: ["resourceName"],
      },
    },
    {
      name: "contacts_search_people",
      description: "Search for contacts by name, email, or phone",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query string",
          },
          pageSize: {
            type: "number",
            description: "Number of results to return (default: 10, max: 100)",
            minimum: 1,
            maximum: 100,
          },
          readMask: {
            type: "array",
            items: { type: "string" },
            description: "Fields to include in results",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "contacts_create_contact",
      description: "Create a new contact",
      parameters: {
        type: "object",
        properties: {
          givenName: {
            type: "string",
            description: "First name",
          },
          familyName: {
            type: "string",
            description: "Last name",
          },
          emailAddresses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                type: { type: "string", enum: ["home", "work", "other"] },
              },
              required: ["value"],
            },
          },
          phoneNumbers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                type: {
                  type: "string",
                  enum: ["home", "work", "mobile", "other"],
                },
              },
              required: ["value"],
            },
          },
          organizations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                title: { type: "string" },
              },
            },
          },
        },
        required: ["givenName"],
      },
    },
    {
      name: "contacts_update_contact",
      description: "Update an existing contact",
      parameters: {
        type: "object",
        properties: {
          resourceName: {
            type: "string",
            description: "Resource name of the person to update",
          },
          givenName: {
            type: "string",
            description: "First name",
          },
          familyName: {
            type: "string",
            description: "Last name",
          },
          emailAddresses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                type: { type: "string" },
              },
            },
          },
          phoneNumbers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                type: { type: "string" },
              },
            },
          },
          updatePersonFields: {
            type: "array",
            items: { type: "string" },
            description: "Fields to update",
          },
        },
        required: ["resourceName"],
      },
    },
    {
      name: "contacts_delete_contact",
      description: "Delete a contact",
      parameters: {
        type: "object",
        properties: {
          resourceName: {
            type: "string",
            description: "Resource name of the person to delete",
          },
        },
        required: ["resourceName"],
      },
    },
  ];
}
