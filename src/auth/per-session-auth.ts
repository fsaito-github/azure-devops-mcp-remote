/**
 * Per-Session Authenticator Factory
 * Creates a token provider bound to a specific user session,
 * returning the user's delegated Azure DevOps token.
 */

import { SessionManager } from "./session.js";
import { OBOTokenService } from "./obo.js";
import { logger } from "../logger.js";

/**
 * Creates a token provider function for a specific authenticated user session.
 * The returned function follows the same signature as createAuthenticator() in auth.ts:
 * () => Promise<string>
 *
 * On each call it:
 * 1. Checks the session for a cached ADO token
 * 2. If missing/expired, performs an OBO exchange using the user's Azure AD token
 * 3. Stores the refreshed token in the session
 * 4. Returns the access token string
 */
export function createPerSessionAuthenticator(
  sessionId: string,
  userId: string,
  sessionManager: SessionManager,
  oboService: OBOTokenService,
): () => Promise<string> {
  return async () => {
    logger.debug(`Per-session auth: resolving ADO token for session=${sessionId}, user=${userId}`);

    // Try cached ADO token from session first
    const cachedToken = sessionManager.getAdoToken(sessionId);
    if (cachedToken) {
      logger.debug(`Per-session auth: using cached ADO token for session=${sessionId}`);
      return cachedToken.accessToken;
    }

    // Token expired or not found — need to re-acquire via OBO
    const userAccessToken = sessionManager.getUserAccessToken(sessionId);
    if (!userAccessToken) {
      const msg = `Per-session auth: no user access token found for session=${sessionId}. User must re-authenticate.`;
      logger.error(msg);
      throw new Error("Session expired or invalid. Please login again via /auth/login.");
    }

    logger.debug(`Per-session auth: performing OBO exchange for session=${sessionId}`);
    const adoToken = await oboService.getOrExchangeToken(userId, userAccessToken);

    // Store refreshed token in session
    sessionManager.storeAdoToken(sessionId, adoToken);
    logger.debug(`Per-session auth: OBO exchange successful for session=${sessionId}`);

    return adoToken.accessToken;
  };
}
