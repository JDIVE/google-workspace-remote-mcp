import { google } from "googleapis";
import { ToolContext } from "./index";

export async function handleCalendarTool(
  toolName: string,
  params: any,
  context: ToolContext,
): Promise<any> {
  const auth = await context.tokenManager.getAuthClient(context.userId);
  const calendar = google.calendar({ version: "v3", auth });

  switch (toolName) {
    case "calendar_list_events":
      return listEvents(calendar, params);

    case "calendar_get_event":
      return getEvent(calendar, params);

    case "calendar_create_event":
      return createEvent(calendar, params);

    case "calendar_update_event":
      return updateEvent(calendar, params);

    case "calendar_delete_event":
      return deleteEvent(calendar, params);

    case "calendar_quick_add":
      return quickAdd(calendar, params);

    default:
      throw new Error(`Unknown Calendar tool: ${toolName}`);
  }
}

async function listEvents(calendar: any, params: any) {
  const response = await calendar.events.list({
    calendarId: params.calendarId || "primary",
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    maxResults: params.maxResults || 10,
    singleEvents: params.singleEvents !== false,
    orderBy: params.orderBy || "startTime",
  });

  return { events: response.data.items || [] };
}

async function getEvent(calendar: any, params: any) {
  const response = await calendar.events.get({
    calendarId: params.calendarId || "primary",
    eventId: params.eventId,
  });

  return response.data;
}

async function createEvent(calendar: any, params: any) {
  const event: any = {
    summary: params.summary,
    description: params.description,
    start: params.start,
    end: params.end,
  };

  if (params.location) {event.location = params.location;}
  if (params.attendees) {event.attendees = params.attendees;}
  if (params.recurrence) {event.recurrence = params.recurrence;}

  const response = await calendar.events.insert({
    calendarId: params.calendarId || "primary",
    requestBody: event,
  });

  return response.data;
}

async function updateEvent(calendar: any, params: any) {
  const updates: any = {};

  if (params.summary !== undefined) {updates.summary = params.summary;}
  if (params.description !== undefined)
    {updates.description = params.description;}
  if (params.start !== undefined) {updates.start = params.start;}
  if (params.end !== undefined) {updates.end = params.end;}
  if (params.location !== undefined) {updates.location = params.location;}
  if (params.attendees !== undefined) {updates.attendees = params.attendees;}

  const response = await calendar.events.patch({
    calendarId: params.calendarId || "primary",
    eventId: params.eventId,
    requestBody: updates,
  });

  return response.data;
}

async function deleteEvent(calendar: any, params: any) {
  await calendar.events.delete({
    calendarId: params.calendarId || "primary",
    eventId: params.eventId,
    sendNotifications: params.sendNotifications,
  });

  return { success: true };
}

async function quickAdd(calendar: any, params: any) {
  const response = await calendar.events.quickAdd({
    calendarId: params.calendarId || "primary",
    text: params.text,
  });

  return response.data;
}
