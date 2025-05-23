import { Tool } from "../mcp/types";

export function getCalendarTools(): Tool[] {
  return [
    {
      name: "calendar_list_events",
      description: "List calendar events within a time range",
      parameters: {
        type: "object",
        properties: {
          calendarId: {
            type: "string",
            description: "Calendar ID (use 'primary' for the main calendar)",
          },
          timeMin: {
            type: "string",
            description:
              "Start time in ISO 8601 format (e.g., '2024-01-01T00:00:00Z')",
          },
          timeMax: {
            type: "string",
            description: "End time in ISO 8601 format",
          },
          maxResults: {
            type: "number",
            description:
              "Maximum number of events to return (default: 10, max: 250)",
            minimum: 1,
            maximum: 250,
          },
          orderBy: {
            type: "string",
            enum: ["startTime", "updated"],
            description: "Order events by start time or last modification time",
          },
          singleEvents: {
            type: "boolean",
            description: "Whether to expand recurring events into instances",
          },
        },
        required: ["timeMin", "timeMax"],
      },
    },
    {
      name: "calendar_get_event",
      description: "Get details of a specific calendar event",
      parameters: {
        type: "object",
        properties: {
          calendarId: {
            type: "string",
            description: "Calendar ID (use 'primary' for the main calendar)",
          },
          eventId: {
            type: "string",
            description: "Event ID",
          },
        },
        required: ["eventId"],
      },
    },
    {
      name: "calendar_create_event",
      description: "Create a new calendar event",
      parameters: {
        type: "object",
        properties: {
          calendarId: {
            type: "string",
            description: "Calendar ID (use 'primary' for the main calendar)",
          },
          summary: {
            type: "string",
            description: "Event title",
          },
          description: {
            type: "string",
            description: "Event description",
          },
          start: {
            type: "object",
            properties: {
              dateTime: {
                type: "string",
                description: "Start time in ISO 8601 format",
              },
              date: {
                type: "string",
                description: "All-day event start date (YYYY-MM-DD)",
              },
              timeZone: {
                type: "string",
                description: "Time zone (e.g., 'America/New_York')",
              },
            },
          },
          end: {
            type: "object",
            properties: {
              dateTime: {
                type: "string",
                description: "End time in ISO 8601 format",
              },
              date: {
                type: "string",
                description: "All-day event end date (YYYY-MM-DD)",
              },
              timeZone: {
                type: "string",
                description: "Time zone (e.g., 'America/New_York')",
              },
            },
          },
          attendees: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                optional: { type: "boolean" },
              },
              required: ["email"],
            },
          },
          location: {
            type: "string",
            description: "Event location",
          },
          recurrence: {
            type: "array",
            items: { type: "string" },
            description: "Recurrence rules in RRULE format",
          },
        },
        required: ["summary", "start", "end"],
      },
    },
    {
      name: "calendar_update_event",
      description: "Update an existing calendar event",
      parameters: {
        type: "object",
        properties: {
          calendarId: {
            type: "string",
            description: "Calendar ID (use 'primary' for the main calendar)",
          },
          eventId: {
            type: "string",
            description: "Event ID",
          },
          summary: {
            type: "string",
            description: "Event title",
          },
          description: {
            type: "string",
            description: "Event description",
          },
          start: {
            type: "object",
            properties: {
              dateTime: { type: "string" },
              date: { type: "string" },
              timeZone: { type: "string" },
            },
          },
          end: {
            type: "object",
            properties: {
              dateTime: { type: "string" },
              date: { type: "string" },
              timeZone: { type: "string" },
            },
          },
          attendees: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                optional: { type: "boolean" },
              },
            },
          },
          location: {
            type: "string",
          },
        },
        required: ["eventId"],
      },
    },
    {
      name: "calendar_delete_event",
      description: "Delete a calendar event",
      parameters: {
        type: "object",
        properties: {
          calendarId: {
            type: "string",
            description: "Calendar ID (use 'primary' for the main calendar)",
          },
          eventId: {
            type: "string",
            description: "Event ID",
          },
          sendNotifications: {
            type: "boolean",
            description: "Whether to send cancellation notifications",
          },
        },
        required: ["eventId"],
      },
    },
    {
      name: "calendar_quick_add",
      description: "Create an event using natural language",
      parameters: {
        type: "object",
        properties: {
          calendarId: {
            type: "string",
            description: "Calendar ID (use 'primary' for the main calendar)",
          },
          text: {
            type: "string",
            description:
              "Natural language event description (e.g., 'Lunch with John tomorrow at noon')",
          },
        },
        required: ["text"],
      },
    },
  ];
}
