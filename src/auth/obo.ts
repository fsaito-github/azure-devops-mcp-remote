/**
 * OBO (On-Behalf-Of) Token Exchange Service
 * Exchanges a user's Azure AD access token for an Azure DevOps
 * delegated token using the MSAL OBO flow.
 */

import { ConfidentialClientApplication } from "@azure/msal-node";
import { AzureADConfig, OAuthToken } from "./config.js";
import { logger } from "../logger.js";

/** Azure DevOps default scope for delegated access */
export const ADO_SCOPES = ["499b84ac-1321-427f-aa17-267ca6975798/.default"];

interface CachedToken {
  token: OAuthToken;
  expiresAt: number;
}

/** Buffer time (in ms) before expiration to consider a token stale */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export class OBOTokenService {
  private msalClient: ConfidentialClientApplication;
  private tokenCache: Map<string, CachedToken> = new Map();

  constructor(config: AzureADConfig) {
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });

    logger.debug("OBOTokenService initialized");
  }

  /**
   * Exchanges a user's Azure AD access token for an Azure DevOps token
   * using the MSAL On-Behalf-Of flow.
   */
  async exchangeForAdoToken(userAccessToken: string): Promise<OAuthToken> {
    logger.debug("Starting OBO token exchange for Azure DevOps");

    try {
      const result = await this.msalClient.acquireTokenOnBehalfOf({
        oboAssertion: userAccessToken,
        scopes: ADO_SCOPES,
      });

      if (!result) {
        throw new Error("MSAL acquireTokenOnBehalfOf returned null — no token was issued");
      }

      const token: OAuthToken = {
        accessToken: result.accessToken,
        idToken: result.idToken,
        expiresIn: result.expiresOn
          ? Math.floor((result.expiresOn.getTime() - Date.now()) / 1000)
          : 3600,
        tokenType: "Bearer",
        scope: result.scopes.join(" "),
      };

      logger.debug("OBO token exchange succeeded");
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`OBO token exchange failed: ${message}`);
      throw new Error(`Failed to exchange token via OBO flow: ${message}`);
    }
  }

  /**
   * Returns a cached ADO token for the given user if it exists and
   * is not expired (including a 5-minute safety buffer).
   */
  getCachedAdoToken(userId: string): OAuthToken | null {
    const entry = this.tokenCache.get(userId);
    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt - EXPIRY_BUFFER_MS) {
      logger.debug(`Cached ADO token for user ${userId} is expired or near expiry — discarding`);
      this.tokenCache.delete(userId);
      return null;
    }

    logger.debug(`Returning cached ADO token for user ${userId}`);
    return entry.token;
  }

  /**
   * Stores an ADO token in the in-memory cache for the given user.
   */
  cacheAdoToken(userId: string, token: OAuthToken): void {
    const expiresAt = Date.now() + token.expiresIn * 1000;
    this.tokenCache.set(userId, { token, expiresAt });
    logger.debug(`Cached ADO token for user ${userId} (expires in ${token.expiresIn}s)`);
  }

  /**
   * Clears cached tokens. If a userId is provided, only that user's
   * cache entry is removed; otherwise the entire cache is cleared.
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.tokenCache.delete(userId);
      logger.debug(`Cleared cached ADO token for user ${userId}`);
    } else {
      this.tokenCache.clear();
      logger.debug("Cleared entire ADO token cache");
    }
  }

  /**
   * Returns an ADO token for the given user — from cache if available,
   * otherwise performs an OBO exchange and caches the result.
   */
  async getOrExchangeToken(userId: string, userAccessToken: string): Promise<OAuthToken> {
    const cached = this.getCachedAdoToken(userId);
    if (cached) {
      return cached;
    }

    logger.debug(`No valid cached token for user ${userId} — performing OBO exchange`);
    const token = await this.exchangeForAdoToken(userAccessToken);
    this.cacheAdoToken(userId, token);
    return token;
  }
}
