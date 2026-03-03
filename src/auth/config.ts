/**
 * Azure AD / OAuth2 Authentication Configuration
 * Configurações para integração com Azure AD
 */

export interface AzureADConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUrl: string;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn: number;
  tokenType: "Bearer";
  scope: string;
}

export interface UserSession {
  userId: string;
  email: string;
  displayName: string;
  token: OAuthToken;
  createdAt: Date;
  lastActivity: Date;
}

export interface AuthError {
  code: string;
  message: string;
  statusCode: number;
}

/**
 * Carrega configuração do Azure AD a partir de variáveis de ambiente
 */
export function loadAzureADConfig(): AzureADConfig {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const tenantId = process.env.OAUTH_TENANT_ID;
  const redirectUrl = process.env.OAUTH_REDIRECT_URL;

  if (!clientId || !clientSecret || !tenantId || !redirectUrl) {
    throw new Error("Azure AD configuration incomplete. Check OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_TENANT_ID, OAUTH_REDIRECT_URL");
  }

  return {
    clientId,
    clientSecret,
    tenantId,
    redirectUrl,
  };
}

/**
 * Gera URLs para o fluxo de autenticação
 */
export function getAzureADUrls(config: AzureADConfig) {
  const baseUrl = `https://login.microsoftonline.com/${config.tenantId}`;

  return {
    authorize: `${baseUrl}/oauth2/v2.0/authorize`,
    token: `${baseUrl}/oauth2/v2.0/token`,
    userinfo: "https://graph.microsoft.com/v1.0/me",
  };
}

/**
 * Gera o estado e PKCE code_challenge para segurança
 */
export function generateAuthState(): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const crypto = require("crypto");

  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = crypto
    .randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  return {
    state,
    codeVerifier,
    codeChallenge,
  };
}
