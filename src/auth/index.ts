/**
 * Authentication Module
 * Exports para Auth
 */

export { loadAzureADConfig, getAzureADUrls, generateAuthState } from "./config.js";
export type { AzureADConfig, OAuthToken, UserSession, AuthError } from "./config.js";

export { OAuth2Controller } from "./oauth2.js";

export { SessionManager } from "./session.js";
export type { JWTPayload } from "./session.js";

export { AuthMiddleware } from "./middleware.js";
export type { AuthenticatedRequest } from "./middleware.js";

export { AuthController } from "./controller.js";
