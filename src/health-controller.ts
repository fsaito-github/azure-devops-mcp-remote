/**
 * Health Check Controller
 * Endpoints para monitoramento de saúde da aplicação
 */

import { Router, Response } from "express";
import { HealthCheckService } from "./health.js";
import { AuthenticatedRequest } from "./auth/middleware.js";

export class HealthController {
  public healthService: HealthCheckService;

  constructor() {
    this.healthService = new HealthCheckService();
  }

  /**
   * Registra as rotas de health check
   */
  registerRoutes(router: Router): void {
    router.get("/health", this.handleHealth.bind(this));
    router.get("/ready", this.handleReady.bind(this));
    router.get("/health/detailed", this.handleHealthDetailed.bind(this));
    router.get("/metrics", this.handleMetrics.bind(this));
  }

  /**
   * GET /health - Health status simples
   * Usado por load balancers e container orchestrators
   */
  private handleHealth(req: AuthenticatedRequest, res: Response): void {
    const health = this.healthService.getHealth();

    const statusCode = health.status === "healthy" ? 200 : 503;

    res.status(statusCode).json({
      status: health.status,
      timestamp: health.timestamp,
      uptime: health.uptime,
    });
  }

  /**
   * GET /ready - Readiness probe
   * Verifica se a aplicação está pronta para receber tráfego
   */
  private handleReady(req: AuthenticatedRequest, res: Response): void {
    const readiness = this.healthService.getReadiness();

    const statusCode = readiness.ready ? 200 : 503;

    res.status(statusCode).json({
      ready: readiness.ready,
      readiness: readiness.readiness,
      timestamp: readiness.timestamp,
    });
  }

  /**
   * GET /health/detailed - Health status detalhado
   * Informações completas de saúde (requer autenticação)
   */
  private handleHealthDetailed(req: AuthenticatedRequest, res: Response): void {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Authentication required for detailed health",
        });
        return;
      }

      const health = this.healthService.getHealth();

      res.json({
        ...health,
        details: {
          started: new Date(Date.now() - health.uptime * 1000).toISOString(),
          memoryUsagePercent: Math.round((health.memory.usedHeapSize / health.memory.totalHeapSize) * 100),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "HEALTH_CHECK_FAILED",
        message: "Failed to retrieve health details",
      });
    }
  }

  /**
   * GET /metrics - Métricas de performance
   * Estatísticas de requisições e latência
   */
  private handleMetrics(req: AuthenticatedRequest, res: Response): void {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Authentication required for metrics",
        });
        return;
      }

      const health = this.healthService.getHealth();
      const stats = this.healthService.getRequestStats();

      res.json({
        timestamp: new Date().toISOString(),
        uptime: health.uptime,
        requests: stats,
        latency: health.latency,
        memory: {
          heapUsedMB: health.memory.usedHeapSize,
          heapTotalMB: health.memory.totalHeapSize,
          usagePercent: Math.round((health.memory.usedHeapSize / health.memory.totalHeapSize) * 100),
          externalMB: health.memory.externalMemoryUsage,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "METRICS_FAILED",
        message: "Failed to retrieve metrics",
      });
    }
  }

  /**
   * Middleware para registrar request timing
   */
  recordRequestTiming = (req: AuthenticatedRequest, res: Response, next: Function): void => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      this.healthService.recordRequestTiming(duration);
    });

    next();
  };
}
