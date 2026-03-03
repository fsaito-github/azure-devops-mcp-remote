/**
 * Health Check Integration Module
 * Integrates health check endpoints with Express application
 */

import type { Express, Request, Response, NextFunction } from "express";
import { HealthController } from "./health-controller.js";
import { HealthCheckService } from "./health.js";
import { logger } from "./logger.js";

/**
 * Middleware para registrar tempo de execução das requisições
 */
export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Usa o evento 'finish' para capturar quando a resposta é enviada
  res.on("finish", () => {
    const duration = Date.now() - startTime;

    // Registra o tempo apenas para requisições que não são health checks
    if (!req.path.startsWith("/health") && !req.path.startsWith("/ready") && !req.path.startsWith("/metrics")) {
      const healthService = getHealthService();
      healthService.recordRequestTiming(duration);
    }
  });

  next();
}

// Singleton para compartilhar a instância dessa classe
let healthControllerInstance: HealthController | null = null;

/**
 * Obtém a instância singleton do HealthController
 */
export function getHealthController(): HealthController {
  if (!healthControllerInstance) {
    healthControllerInstance = new HealthController();
  }
  return healthControllerInstance;
}

/**
 * Obtém a instância singleton do HealthCheckService
 */
export function getHealthService(): HealthCheckService {
  const controller = getHealthController();
  // HealthController tem acesso ao service, mas precisamos expô-lo
  // Para isso, modificaremos o HealthController para expor a instância
  return (controller as any).healthService;
}

/**
 * Integra os health checks com uma aplicação Express
 *
 * @param app - Instância da aplicação Express
 * @param port - Porta em que o servidor está escutando
 */
export function setupHealthChecks(app: Express, port: number): void {
  try {
    // Adiciona middleware de timing global (para todos os endpoints)
    app.use(requestTimingMiddleware);

    // Cria e registra as rotas do health check
    const healthController = getHealthController();
    const router = app;

    // Registra as rotas de health check
    healthController.registerRoutes(router);

    logger.info("Health check endpoints registered successfully", {
      endpoints: ["/health", "/ready", "/health/detailed", "/metrics"],
      port,
    });
  } catch (error) {
    logger.error("Failed to setup health checks:", error);
    throw error;
  }
}

/**
 * Verifica a saúde do servidor (útil para startup checks)
 */
export async function performStartupHealthCheck(): Promise<boolean> {
  try {
    const healthService = getHealthService();
    const health = healthService.getHealth();
    const readiness = healthService.getReadiness();

    const isHealthy = health.status === "healthy" || health.status === "degraded";
    const isReady = readiness.ready;

    if (!isHealthy || !isReady) {
      logger.warn("Server startup health check: not fully healthy", {
        health: health.status,
        ready: isReady,
      });
    } else {
      logger.info("Server startup health check: passed", {
        health: health.status,
        ready: isReady,
      });
    }

    return isHealthy && isReady;
  } catch (error) {
    logger.error("Failed to perform startup health check:", error);
    return false;
  }
}

export default {
  setupHealthChecks,
  getHealthController,
  getHealthService,
  requestTimingMiddleware,
  performStartupHealthCheck,
};
