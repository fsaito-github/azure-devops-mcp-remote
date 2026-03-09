/**
 * Authentication Routes Controller
 * Endpoints para login, callback, logout e verificação de status
 */

import { Router, Response } from "express";
import { OAuth2Controller } from "./oauth2.js";
import { SessionManager } from "./session.js";
import { AuthMiddleware, AuthenticatedRequest } from "./middleware.js";
import { AzureADConfig } from "./config.js";
import { OBOTokenService } from "./obo.js";

export class AuthController {
  private oauth2: OAuth2Controller;
  private sessionManager: SessionManager;
  private authMiddleware: AuthMiddleware;
  private oboService: OBOTokenService;
  private stateStore: Map<string, { codeVerifier: string; timestamp: number }>;

  constructor(config: AzureADConfig) {
    this.oauth2 = new OAuth2Controller(config);
    this.sessionManager = new SessionManager();
    this.authMiddleware = new AuthMiddleware(this.sessionManager);
    this.stateStore = new Map();
    this.oboService = new OBOTokenService(config);

    // Limpar states expirados a cada 5 minutos
    setInterval(() => this.cleanupExpiredStates(), 5 * 60 * 1000);
  }

  /**
   * Registar as rotas de autenticação
   */
  registerRoutes(router: Router): void {
    router.get("/auth/login", this.handleLogin.bind(this));
    router.get("/auth/callback", this.handleCallback.bind(this));
    router.post("/auth/logout", this.authMiddleware.validateToken, this.handleLogout.bind(this));
    router.get("/auth/me", this.authMiddleware.validateToken, this.handleGetUser.bind(this));
    router.get("/auth/status", this.handleStatus.bind(this));
    router.post("/auth/refresh", this.handleRefreshToken.bind(this));
    router.post("/auth/refresh-ado", this.authMiddleware.validateToken, this.handleRefreshAdoToken.bind(this));
  }

  /**
   * GET /auth/login - Inicia o fluxo de login
   */
  private async handleLogin(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { url, state, codeVerifier } = this.oauth2.generateLoginUrl();

      // Armazenar state e code verifier para validação
      this.stateStore.set(state, {
        codeVerifier,
        timestamp: Date.now(),
      });

      // Redirecionar para Azure AD
      res.redirect(url);
    } catch (error) {
      res.status(500).json({
        error: "LOGIN_INIT_FAILED",
        message: "Failed to initiate login flow",
      });
    }
  }

  /**
   * GET /auth/callback - Callback após autenticação no Azure AD
   */
  private async handleCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      const error = req.query.error as string;

      // Verificar se há erro na resposta do Azure AD
      if (error) {
        const errorDescription = req.query.error_description as string;
        res.status(400).json({
          error: "AUTH_ERROR",
          message: errorDescription || error,
        });
        return;
      }

      // Validar estado
      const stateData = this.stateStore.get(state);

      if (!stateData) {
        res.status(400).json({
          error: "INVALID_STATE",
          message: "State parameter is invalid or expired",
        });
        return;
      }

      if (!code) {
        res.status(400).json({
          error: "MISSING_CODE",
          message: "Authorization code is missing",
        });
        return;
      }

      // Trocar código por token
      const token = await this.oauth2.exchangeCodeForToken(code, stateData.codeVerifier, state);

      // Obter informações do usuário
      const userInfo = await this.oauth2.getUserInfo(token.accessToken);

      // Perform OBO exchange to get Azure DevOps token
      let adoToken;
      try {
        adoToken = await this.oboService.exchangeForAdoToken(token.accessToken);
      } catch (oboError) {
        console.error("OBO exchange failed:", oboError);
        res.status(500).json({
          error: "OBO_EXCHANGE_FAILED",
          message: "Failed to obtain Azure DevOps token via OBO flow. Ensure the App Registration has Azure DevOps user_impersonation permission.",
        });
        return;
      }

      // Criar sessão
      const jwt = this.sessionManager.createSession(
        {
          userId: userInfo.userId,
          email: userInfo.email,
          displayName: userInfo.displayName,
          createdAt: new Date(),
          lastActivity: new Date(),
        },
        token
      );

      // Store ADO token in the session
      const sessionPayload = this.sessionManager.validateToken(jwt);
      if (sessionPayload) {
        this.sessionManager.storeAdoToken(sessionPayload.sessionId, adoToken);
      }

      // Remover state do armazenamento
      this.stateStore.delete(state);

      // Retornar token ao cliente
      // Em produção, você poderia redirecionar para uma página com o token
      res.json({
        success: true,
        token: jwt,
        user: {
          userId: userInfo.userId,
          email: userInfo.email,
          displayName: userInfo.displayName,
        },
        expiresIn: token.expiresIn,
      });
    } catch (error) {
      console.error("Callback error:", error);
      res.status(500).json({
        error: "CALLBACK_FAILED",
        message: "Failed to complete login callback",
      });
    }
  }

  /**
   * POST /auth/logout - Termina a sessão do usuário
   */
  private handleLogout(req: AuthenticatedRequest, res: Response): void {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "NOT_AUTHENTICATED",
          message: "User is not authenticated",
        });
        return;
      }

      // Destruir sessão
      this.sessionManager.destroySession(req.user.sessionId);

      res.json({
        success: true,
        message: "Successfully logged out",
      });
    } catch (error) {
      res.status(500).json({
        error: "LOGOUT_FAILED",
        message: "Failed to logout",
      });
    }
  }

  /**
   * GET /auth/me - Obtém informações do usuário autenticado
   */
  private handleGetUser(req: AuthenticatedRequest, res: Response): void {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "NOT_AUTHENTICATED",
          message: "User is not authenticated",
        });
        return;
      }

      res.json({
        user: {
          userId: req.user.userId,
          email: req.user.email,
          displayName: req.user.displayName,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "GET_USER_FAILED",
        message: "Failed to get user information",
      });
    }
  }

  /**
   * GET /auth/status - Verifica status de autenticação
   */
  private handleStatus(req: AuthenticatedRequest, res: Response): void {
    try {
      const authHeader = req.headers.authorization;
      const isAuthenticated = !!authHeader && authHeader.startsWith("Bearer ");

      const stats = this.sessionManager.getStats();

      res.json({
        authenticated: isAuthenticated,
        sessions: stats.activeSessions,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: "STATUS_CHECK_FAILED",
        message: "Failed to check status",
      });
    }
  }

  /**
   * POST /auth/refresh - Renova o token usando refresh token
   */
  private async handleRefreshToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          error: "MISSING_REFRESH_TOKEN",
          message: "Refresh token is required",
        });
        return;
      }

      // Renovar token com Azure AD
      const newToken = await this.oauth2.refreshToken(refreshToken);

      res.json({
        success: true,
        token: newToken.accessToken,
        expiresIn: newToken.expiresIn,
      });
    } catch (error) {
      res.status(500).json({
        error: "TOKEN_REFRESH_FAILED",
        message: "Failed to refresh token",
      });
    }
  }

  /**
   * Limpa states expirados
   */
  private cleanupExpiredStates(): void {
    const maxAge = 15 * 60 * 1000; // 15 minutos
    const now = Date.now();

    for (const [state, data] of this.stateStore.entries()) {
      if (now - data.timestamp > maxAge) {
        this.stateStore.delete(state);
      }
    }
  }

  /**
   * POST /auth/refresh-ado - Refreshes the ADO token via OBO
   */
  private async handleRefreshAdoToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "NOT_AUTHENTICATED", message: "User is not authenticated" });
        return;
      }

      const userAccessToken = this.sessionManager.getUserAccessToken(req.user.sessionId);
      if (!userAccessToken) {
        res.status(401).json({ error: "SESSION_EXPIRED", message: "User session has expired. Please login again." });
        return;
      }

      // Clear cached token and perform fresh OBO exchange
      this.oboService.clearCache(req.user.userId);
      const adoToken = await this.oboService.exchangeForAdoToken(userAccessToken);
      this.sessionManager.storeAdoToken(req.user.sessionId, adoToken);

      res.json({
        success: true,
        message: "ADO token refreshed successfully",
        expiresIn: adoToken.expiresIn,
      });
    } catch (error) {
      console.error("ADO token refresh error:", error);
      res.status(500).json({
        error: "ADO_REFRESH_FAILED",
        message: "Failed to refresh Azure DevOps token",
      });
    }
  }

  getMiddleware(): AuthMiddleware {
    return this.authMiddleware;
  }

  /**
   * Returns the OBO token service instance
   */
  getOBOService(): OBOTokenService {
    return this.oboService;
  }

  /**
   * Returns the session manager instance
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }
}
