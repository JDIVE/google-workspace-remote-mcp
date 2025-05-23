import { Env } from "../../index";
import { TokenManager } from "../../auth/tokens";
import { Logger } from "../../utils/logger";
import { handleGmailTool } from "./gmail";
import { handleCalendarTool } from "./calendar";
import { handleDriveTool } from "./drive";
import { handleContactsTool } from "./contacts";

export interface ToolContext {
  env: Env;
  userId: string;
  tokenManager: TokenManager;
  logger: Logger;
  requestId: string;
}

export async function handleToolCall(
  toolName: string,
  params: any,
  context: ToolContext,
): Promise<any> {
  // Route to appropriate handler based on tool prefix
  if (toolName.startsWith("gmail_")) {
    return handleGmailTool(toolName, params, context);
  } else if (toolName.startsWith("calendar_")) {
    return handleCalendarTool(toolName, params, context);
  } else if (toolName.startsWith("drive_")) {
    return handleDriveTool(toolName, params, context);
  } else if (toolName.startsWith("contacts_")) {
    return handleContactsTool(toolName, params, context);
  } else {
    throw new Error(`Unknown tool: ${toolName}`);
  }
}
