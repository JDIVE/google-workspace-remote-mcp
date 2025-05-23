import { Env } from "../index";
import { Logger } from "../utils/logger";

export async function createState(
  env: Env,
  userId: string,
  clientIp: string,
): Promise<string | null> {
  // Rate limiting for state generation
  const rateLimitKey = `state:${clientIp}`;
  const stateCount = await env.RATE_LIMITS.get(rateLimitKey);
  if (stateCount && parseInt(stateCount) > 10) {
    return null; // Too many auth attempts
  }

  // Increment counter
  const newCount = (parseInt(stateCount || "0") + 1).toString();
  await env.RATE_LIMITS.put(rateLimitKey, newCount, { expirationTtl: 300 });

  const state = crypto.randomUUID();
  await env.OAUTH_STATE.put(state, userId, { expirationTtl: 300 });
  return state;
}

export async function consumeState(
  env: Env,
  state: string | null,
  requestId: string,
): Promise<string | null> {
  const logger = new Logger("google-workspace-mcp");

  if (!state) {
    logger.warn({
      requestId,
      method: "consumeState",
      metadata: { reason: "CSRF validation failed: no state provided" },
    });
    return null;
  }

  const userId = await env.OAUTH_STATE.get(state);
  if (!userId) {
    logger.warn({
      requestId,
      method: "consumeState",
      metadata: {
        reason: "CSRF validation failed: invalid state token",
        providedState: state.substring(0, 8) + "...", // Log partial state for debugging
      },
    });
    return null;
  }

  await env.OAUTH_STATE.delete(state);
  return userId;
}
