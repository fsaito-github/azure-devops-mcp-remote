/**
 * Session Manager
 * Gerencia as sessões dos usuários com tokens JWT
 */

import jwt from "jsonwebtoken";
import { UserSession, OAuthToken } from "./config.js";

export interface JWTPayload {
  userId: string;
  email: string;
  displayName: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export class SessionManager {
  private jwtSecret: string;
  private sessionTTL: number; // em segundos
  private sessions: Map<string, UserSession>;
  private adoTokens: Map<string, { token: OAuthToken; expiresAt: number }>;

  constructor(jwtSecret?: string, sessionTTLMinutes: number = 60) {
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || "your-secret-key-change-in-production";
    this.sessionTTL = sessionTTLMinutes * 60; // converter para segundos
    this.sessions = new Map();
    this.adoTokens = new Map();
  }

  /**
   * Cria uma sessão e retorna um JWT
   */
  createSession(userInfo: Omit<UserSession, "token">, token: OAuthToken): string {
    const sessionId = this.generateSessionId();

    const session: UserSession = {
      ...userInfo,
      token,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);

    const payload: JWTPayload = {
      userId: userInfo.userId,
      email: userInfo.email,
      displayName: userInfo.displayName,
      sessionId: sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.sessionTTL,
    };

    return jwt.sign(payload, this.jwtSecret);
  }

  /**
   * Valida e decodifica um JWT
   */
  validateToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
      return decoded;
    } catch (error) {
      console.error("Token validation failed:", error);
      return null;
    }
  }

  /**
   * Obtém a sessão pelo sessionId
   */
  getSession(sessionId: string): UserSession | undefined {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Atualizar última atividade
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  /**
   * Stores an ADO token for a session
   */
  storeAdoToken(sessionId: string, token: OAuthToken): void {
    const expiresAt = Date.now() + (token.expiresIn * 1000) - (5 * 60 * 1000); // 5 min buffer
    this.adoTokens.set(sessionId, { token, expiresAt });
  }

  /**
   * Gets the ADO token for a session, returning null if expired
   */
  getAdoToken(sessionId: string): OAuthToken | null {
    const entry = this.adoTokens.get(sessionId);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.adoTokens.delete(sessionId);
      return null;
    }
    return entry.token;
  }

  /**
   * Gets the original user access token (for OBO refresh)
   */
  getUserAccessToken(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.token) return null;
    return session.token.accessToken;
  }

  /**
   * Termina uma sessão (logout)
   */
  destroySession(sessionId: string): boolean {
    this.adoTokens.delete(sessionId);
    return this.sessions.delete(sessionId);
  }

  /**
   * Limpa sessões expiradas
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionAge = now - session.lastActivity.getTime();
      if (sessionAge > this.sessionTTL * 1000) {
        this.sessions.delete(sessionId);
        this.adoTokens.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Gera um ID de sessão único
   */
  private generateSessionId(): string {
    const crypto = require("crypto");
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Obtém estatísticas de sessões
   */
  getStats(): {
    activeSessions: number;
    totalStorage: string;
  } {
    return {
      activeSessions: this.sessions.size,
      totalStorage: `${(this.sessions.size * 1000) / 1024 / 1024}MB`,
    };
  }
}
