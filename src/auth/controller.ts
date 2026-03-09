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

      // Retornar página HTML com token e instruções
      const expiresInMinutes = Math.floor(token.expiresIn / 60);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(this.buildCallbackHtml({
        jwt,
        userId: userInfo.userId,
        email: userInfo.email,
        displayName: userInfo.displayName,
        expiresInMinutes,
        serverUrl: `${req.protocol}://${req.get("host")}`,
      }));
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

  /**
   * Builds the HTML page shown after successful login
   */
  private buildCallbackHtml(params: {
    jwt: string;
    userId: string;
    email: string;
    displayName: string;
    expiresInMinutes: number;
    serverUrl: string;
  }): string {
    const { jwt, email, displayName, expiresInMinutes, serverUrl } = params;
    const mcpSnippet = JSON.stringify(
      {
        servers: {
          "azure-devops": {
            type: "http",
            url: `${serverUrl}/mcp`,
            headers: {
              Authorization: `Bearer ${jwt}`,
            },
          },
        },
      },
      null,
      2
    );

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Azure DevOps MCP — Login Concluído</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0e1117; color: #c9d1d9; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .card {
      background: #161b22; border: 1px solid #30363d; border-radius: 12px;
      max-width: 720px; width: 100%; padding: 32px;
    }
    .success-icon {
      width: 48px; height: 48px; background: #238636; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; margin-bottom: 16px;
    }
    h1 { font-size: 24px; color: #f0f6fc; margin-bottom: 4px; }
    .subtitle { color: #8b949e; margin-bottom: 24px; }
    .user-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: #1c2128; border: 1px solid #30363d; border-radius: 20px;
      padding: 6px 14px; margin-bottom: 24px; font-size: 14px;
    }
    .user-badge .avatar {
      width: 24px; height: 24px; background: #6e40c9; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; color: white;
    }
    .section { margin-bottom: 20px; }
    .section-title {
      font-size: 13px; font-weight: 600; color: #8b949e;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
    }
    .token-box {
      background: #0d1117; border: 1px solid #30363d; border-radius: 8px;
      padding: 12px; font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 12px; word-break: break-all; color: #79c0ff;
      max-height: 80px; overflow-y: auto; position: relative;
    }
    .code-box {
      background: #0d1117; border: 1px solid #30363d; border-radius: 8px;
      padding: 16px; font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 13px; line-height: 1.5; overflow-x: auto;
      white-space: pre; color: #c9d1d9;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 6px; border: 1px solid #30363d;
      background: #21262d; color: #c9d1d9; font-size: 13px; font-weight: 500;
      cursor: pointer; transition: all 0.15s;
    }
    .btn:hover { background: #30363d; border-color: #8b949e; }
    .btn-primary { background: #238636; border-color: #238636; color: white; }
    .btn-primary:hover { background: #2ea043; }
    .btn-row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .copied {
      background: #238636 !important; border-color: #238636 !important; color: white !important;
    }
    .steps { list-style: none; counter-reset: steps; }
    .steps li {
      counter-increment: steps; padding: 8px 0 8px 36px; position: relative;
      border-left: 2px solid #30363d; margin-left: 12px; font-size: 14px;
    }
    .steps li:last-child { border-left-color: transparent; }
    .steps li::before {
      content: counter(steps);
      position: absolute; left: -13px; top: 6px;
      width: 24px; height: 24px; background: #30363d; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; color: #f0f6fc;
    }
    .expires {
      display: inline-flex; align-items: center; gap: 4px;
      color: #d29922; font-size: 13px; margin-top: 16px;
    }
    .file-label {
      display: inline-block; background: #1c2128; border: 1px solid #30363d;
      border-radius: 6px 6px 0 0; padding: 4px 12px; font-size: 12px;
      font-family: 'SFMono-Regular', Consolas, monospace; color: #8b949e;
      border-bottom: none; margin-bottom: -1px; position: relative; z-index: 1;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="success-icon">✓</div>
    <h1>Login concluído!</h1>
    <p class="subtitle">Autenticação OBO realizada com sucesso</p>

    <div class="user-badge">
      <div class="avatar">${displayName.charAt(0).toUpperCase()}</div>
      <span><strong>${displayName}</strong> &nbsp;${email}</span>
    </div>

    <div class="section">
      <div class="section-title">Como usar</div>
      <ol class="steps">
        <li>Copie o snippet abaixo (clique no botão)</li>
        <li>Cole no arquivo <code>.vscode/mcp.json</code> do seu projeto</li>
        <li>Recarregue a janela do VS Code (<code>Ctrl+Shift+P</code> → <em>Reload Window</em>)</li>
      </ol>
    </div>

    <div class="section">
      <div class="section-title">Snippet para VS Code</div>
      <span class="file-label">.vscode/mcp.json</span>
      <div class="code-box" id="snippet">${this.escapeHtml(mcpSnippet)}</div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="copyText('snippet', this)">📋 Copiar snippet</button>
        <button class="btn" onclick="copyText('token', this)">🔑 Copiar só o token</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">JWT Token</div>
      <div class="token-box" id="token">${jwt}</div>
    </div>

    <div class="expires">⏱ Token expira em ${expiresInMinutes} minutos</div>
  </div>

  <script>
    function copyText(elementId, btn) {
      const text = document.getElementById(elementId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '✓ Copiado!';
        btn.classList.add('copied');
        setTimeout(() => { btn.innerHTML = original; btn.classList.remove('copied'); }, 2000);
      });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
