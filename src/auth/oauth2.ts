/**
 * OAuth2 Controller
 * Gerencia o fluxo de autenticação OAuth2 com Azure AD
 */

import axios from "axios";
import { AzureADConfig, OAuthToken, UserSession, generateAuthState, getAzureADUrls } from "./config.js";

export class OAuth2Controller {
  private config: AzureADConfig;
  private urls: ReturnType<typeof getAzureADUrls>;

  constructor(config: AzureADConfig) {
    this.config = config;
    this.urls = getAzureADUrls(config);
  }

  /**
   * Gera a URL de login para redirecionar o usuário
   */
  generateLoginUrl(scope: string = "openid profile email"): {
    url: string;
    state: string;
    codeVerifier: string;
  } {
    const { state, codeVerifier, codeChallenge } = generateAuthState();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUrl,
      response_type: "code",
      scope: scope,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });

    return {
      url: `${this.urls.authorize}?${params}`,
      state,
      codeVerifier,
    };
  }

  /**
   * Troca o código de autorização por um token de acesso
   */
  async exchangeCodeForToken(code: string, codeVerifier: string, state: string): Promise<OAuthToken> {
    try {
      const response = await axios.post(this.urls.token, {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: code,
        redirect_uri: this.config.redirectUrl,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        idToken: response.data.id_token,
        expiresIn: response.data.expires_in,
        tokenType: "Bearer",
        scope: response.data.scope,
      };
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${error}`);
    }
  }

  /**
   * Renova o token usando refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthToken> {
    try {
      const response = await axios.post(this.urls.token, {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        idToken: response.data.id_token,
        expiresIn: response.data.expires_in,
        tokenType: "Bearer",
        scope: response.data.scope,
      };
    } catch (error) {
      throw new Error(`Failed to refresh token: ${error}`);
    }
  }

  /**
   * Obtém informações do usuário do Microsoft Graph
   */
  async getUserInfo(accessToken: string): Promise<UserSession> {
    try {
      const response = await axios.get(this.urls.userinfo, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const userData = response.data;

      return {
        userId: userData.id,
        email: userData.mail || userData.userPrincipalName,
        displayName: userData.displayName,
        token: {} as OAuthToken,
        createdAt: new Date(),
        lastActivity: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to fetch user info: ${error}`);
    }
  }

  /**
   * Valida se o token está expirado
   */
  isTokenExpired(token: OAuthToken): boolean {
    const expirationTime = token.expiresIn * 1000; // converter para ms
    return Date.now() > expirationTime;
  }
}
