/**
 * Authentication Middleware
 * Middleware para validar tokens e sessões
 */

import { Request, Response, NextFunction } from "express";
import { SessionManager } from "./session.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    displayName: string;
    sessionId: string;
  };
}

export class AuthMiddleware {
  constructor(private sessionManager: SessionManager) {}

  /**
   * Middleware para validar JWT em requests
   */
  validateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Missing or invalid authorization header",
        });
      }

      const token = authHeader.substring(7); // Remove "Bearer "
      const payload = this.sessionManager.validateToken(token);

      if (!payload) {
        return res.status(401).json({
          error: "INVALID_TOKEN",
          message: "Token is invalid or expired",
        });
      }

      // Validar se a sessão ainda existe
      const session = this.sessionManager.getSession(payload.sessionId);

      if (!session) {
        return res.status(401).json({
          error: "SESSION_NOT_FOUND",
          message: "Session does not exist",
        });
      }

      // Adicionar usuário ao request
      req.user = {
        userId: payload.userId,
        email: payload.email,
        displayName: payload.displayName,
        sessionId: payload.sessionId,
      };

      next();
    } catch (error) {
      console.error("Token validation error:", error);
      res.status(500).json({
        error: "TOKEN_VALIDATION_ERROR",
        message: "Failed to validate token",
      });
    }
  };

  /**
   * Middleware opcional - não falha se não verificar
   */
  optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const payload = this.sessionManager.validateToken(token);

        if (payload) {
          const session = this.sessionManager.getSession(payload.sessionId);
          if (session) {
            req.user = {
              userId: payload.userId,
              email: payload.email,
              displayName: payload.displayName,
              sessionId: payload.sessionId,
            };
          }
        }
      }

      next();
    } catch (error) {
      console.error("Optional auth error:", error);
      next();
    }
  };

  /**
   * Middleware para verificar roles/permissões (para futuro)
   */
  requireRole = (allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Authentication required",
        });
      }

      // TODO: Implementar verificação de roles
      // Por agora, apenas verifica autenticação

      next();
    };
  };
}
