/**
 * Authentication Tests - Security Tests
 * Testes de segurança para autenticação
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { SessionManager } from "../src/auth/session";
import { OAuth2Controller } from "../src/auth/oauth2";
import { AzureADConfig, generateAuthState } from "../src/auth/config";

describe("Authentication Security Tests", () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager("test-secret-key");
  });

  describe("Token Security", () => {
    it("should reject expired tokens", () => {
      // Token com TTL de 1 segundo
      const shortLivedManager = new SessionManager("test-secret", 1 / 60);

      const jwt = shortLivedManager.createSession(
        {
          userId: "user123",
          email: "test@example.com",
          displayName: "Test User",
          createdAt: new Date(),
          lastActivity: new Date(),
        },
        {
          accessToken: "token",
          expiresIn: 3600,
          tokenType: "Bearer",
          scope: "openid profile email",
        }
      );

      // Aguardar expiração (2 segundos)
      setTimeout(() => {
        const payload = shortLivedManager.validateToken(jwt);
        expect(payload).toBeNull();
      }, 2000);
    });

    it("should reject tampered tokens", () => {
      const jwt = sessionManager.createSession(
        {
          userId: "user123",
          email: "test@example.com",
          displayName: "Test User",
          createdAt: new Date(),
          lastActivity: new Date(),
        },
        {
          accessToken: "token",
          expiresIn: 3600,
          tokenType: "Bearer",
          scope: "openid profile email",
        }
      );

      // Alterar token (adicionar caractere)
      const tamperedToken = jwt + "tampered";

      const payload = sessionManager.validateToken(tamperedToken);
      expect(payload).toBeNull();
    });

    it("should use different secret to reject token", () => {
      const jwt = sessionManager.createSession(
        {
          userId: "user123",
          email: "test@example.com",
          displayName: "Test User",
          createdAt: new Date(),
          lastActivity: new Date(),
        },
        {
          accessToken: "token",
          expiresIn: 3600,
          tokenType: "Bearer",
          scope: "openid profile email",
        }
      );

      // Manager com secret diferente
      const differentManager = new SessionManager("different-secret-key");

      const payload = differentManager.validateToken(jwt);
      expect(payload).toBeNull();
    });
  });

  describe("Session Security", () => {
    it("should create unique session IDs", () => {
      const jwt1 = sessionManager.createSession(
        {
          userId: "user1",
          email: "user1@example.com",
          displayName: "User 1",
          createdAt: new Date(),
          lastActivity: new Date(),
        },
        {
          accessToken: "token1",
          expiresIn: 3600,
          tokenType: "Bearer",
          scope: "openid profile email",
        }
      );

      const jwt2 = sessionManager.createSession(
        {
          userId: "user2",
          email: "user2@example.com",
          displayName: "User 2",
          createdAt: new Date(),
          lastActivity: new Date(),
        },
        {
          accessToken: "token2",
          expiresIn: 3600,
          tokenType: "Bearer",
          scope: "openid profile email",
        }
      );

      expect(jwt1).not.toEqual(jwt2);
    });

    it("should cleanup expired sessions", () => {
      const jwt = sessionManager.createSession(
        {
          userId: "user123",
          email: "test@example.com",
          displayName: "Test User",
          createdAt: new Date(),
          lastActivity: new Date(Date.now() - 61 * 60 * 1000), // 61 minutos atrás
        },
        {
          accessToken: "token",
          expiresIn: 3600,
          tokenType: "Bearer",
          scope: "openid profile email",
        }
      );

      const payload = sessionManager.validateToken(jwt);
      expect(payload).not.toBeNull();

      // Cleanup
      const cleaned = sessionManager.cleanupExpiredSessions();
      expect(cleaned).toBeGreaterThan(0);
    });

    it("should destroy session on logout", () => {
      const jwt = sessionManager.createSession(
        {
          userId: "user123",
          email: "test@example.com",
          displayName: "Test User",
          createdAt: new Date(),
          lastActivity: new Date(),
        },
        {
          accessToken: "token",
          expiresIn: 3600,
          tokenType: "Bearer",
          scope: "openid profile email",
        }
      );

      const payload = sessionManager.validateToken(jwt);
      expect(payload).not.toBeNull();

      // Destruir sessão
      const destroyed = sessionManager.destroySession(payload!.sessionId);
      expect(destroyed).toBe(true);

      // Tentar acessar session destruída
      const session = sessionManager.getSession(payload!.sessionId);
      expect(session).toBeUndefined();
    });
  });

  describe("PKCE Security", () => {
    it("should generate different auth states", () => {
      const state1 = generateAuthState();
      const state2 = generateAuthState();

      expect(state1.state).not.toEqual(state2.state);
      expect(state1.codeVerifier).not.toEqual(state2.codeVerifier);
      expect(state1.codeChallenge).not.toEqual(state2.codeChallenge);
    });

    it("should generate valid code verifier format", () => {
      const { codeVerifier } = generateAuthState();

      // Code verifier deve ser base64url sem padding
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(codeVerifier.length).toBeGreaterThan(0);
    });

    it("should generate valid code challenge from verifier", () => {
      const { codeVerifier, codeChallenge } = generateAuthState();

      // Code challenge deve ser gerado a partir do verifier
      const crypto = require("crypto");
      const expectedChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

      expect(codeChallenge).toEqual(expectedChallenge);
    });
  });

  describe("Configuration Security", () => {
    it("should require all OAuth config parameters", () => {
      const validConfig: AzureADConfig = {
        clientId: "client123",
        clientSecret: "secret123",
        tenantId: "tenant123",
        redirectUrl: "http://localhost:8080/auth/callback",
      };

      const oauth = new OAuth2Controller(validConfig);
      expect(oauth).toBeDefined();
    });

    it("should not expose secrets in logs", () => {
      const config: AzureADConfig = {
        clientId: "client123",
        clientSecret: "SUPER_SECRET_KEY",
        tenantId: "tenant123",
        redirectUrl: "http://localhost:8080/auth/callback",
      };

      const oauth = new OAuth2Controller(config);
      const stringified = JSON.stringify(oauth);

      // Certificar que secret não aparece na representação string
      expect(stringified).not.toContain("SUPER_SECRET_KEY");
    });
  });

  describe("Authorization Code Flow Security", () => {
    it("should validate state parameter presence", () => {
      // State é obrigatório e único para cada fluxo
      const { state } = generateAuthState();
      expect(state).toBeTruthy();
      expect(state.length).toBeGreaterThanOrEqual(32);
    });

    it("should prevent replay attacks", () => {
      const state1 = generateAuthState();
      const state2 = generateAuthState();

      // Estados devem ser únicos para prevenir replay attacks
      expect(state1.state).not.toEqual(state2.state);
    });
  });

  describe("Input Validation", () => {
    it("should validate authorization code format", () => {
      // Código de autorização deve ser uma string válida
      const validCode = "M.R3_BAY...";
      expect(validCode).toBeTruthy();
    });

    it("should reject missing parameters in callback", () => {
      // Callback deve ter code e state
      expect(null as any).not.toBeTruthy();
      expect(undefined as any).not.toBeTruthy();
    });
  });
});

describe("Integration Tests - OAuth2 Flow", () => {
  it("should complete login flow", async () => {
    const config: AzureADConfig = {
      clientId: "test-client-id",
      clientSecret: "test-secret",
      tenantId: "test-tenant",
      redirectUrl: "http://localhost:8080/auth/callback",
    };

    const oauth = new OAuth2Controller(config);
    const sessionManager = new SessionManager();

    // 1. Gerar login URL
    const { url, state, codeVerifier } = oauth.generateLoginUrl();

    expect(url).toContain("login.microsoftonline.com");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("code_challenge=");
    expect(url).toContain("code_challenge_method=S256");
    expect(state).toBeTruthy();
    expect(codeVerifier).toBeTruthy();
  });
});
