/**
 * Integration Tests - Phase 3
 * Testes de integração para health checks e monitoramento
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { HealthCheckService } from "../src/health";

describe("Health Check Service", () => {
  let healthService: HealthCheckService;

  beforeEach(() => {
    healthService = new HealthCheckService();
  });

  describe("Health Status", () => {
    it("should return healthy status on startup", () => {
      const health = healthService.getHealth();

      expect(health.status).toBe("healthy");
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should track uptime correctly", (done) => {
      const health1 = healthService.getHealth();
      const uptime1 = health1.uptime;

      setTimeout(() => {
        const health2 = healthService.getHealth();
        const uptime2 = health2.uptime;

        expect(uptime2).toBeGreaterThan(uptime1);
        done();
      }, 1000);
    });

    it("should report memory usage", () => {
      const health = healthService.getHealth();

      expect(health.memory.usedHeapSize).toBeGreaterThan(0);
      expect(health.memory.totalHeapSize).toBeGreaterThan(0);
      expect(health.memory.usedHeapSize).toBeLessThanOrEqual(health.memory.totalHeapSize);
    });

    it("should report service health", () => {
      const health = healthService.getHealth();

      expect(health.services).toBeDefined();
      expect(health.services.database).toBeDefined();
      expect(health.services.cache).toBeDefined();
      expect(health.services.azure_ad).toBeDefined();
    });

    it("should report latency statistics", () => {
      // Registrar alguns timings
      healthService.recordRequestTiming(10);
      healthService.recordRequestTiming(20);
      healthService.recordRequestTiming(30);

      const health = healthService.getHealth();

      expect(health.latency.average).toBeGreaterThan(0);
      expect(health.latency.p95).toBeGreaterThanOrEqual(health.latency.average);
      expect(health.latency.p99).toBeGreaterThanOrEqual(health.latency.average);
    });
  });

  describe("Readiness Status", () => {
    it("should return readiness status", () => {
      const readiness = healthService.getReadiness();

      expect(readiness.ready).toBeDefined();
      expect(readiness.readiness).toBeDefined();
      expect(readiness.timestamp).toBeDefined();
    });

    it("should check all required services", () => {
      const readiness = healthService.getReadiness();

      expect(readiness.readiness.mcp_server).toBeDefined();
      expect(readiness.readiness.authentication).toBeDefined();
      expect(readiness.readiness.external_services).toBeDefined();
    });

    it("should be ready on startup", () => {
      const readiness = healthService.getReadiness();

      expect(readiness.ready).toBe(true);
    });
  });

  describe("Request Timing", () => {
    it("should record request timings", () => {
      healthService.recordRequestTiming(100);
      healthService.recordRequestTiming(200);
      healthService.recordRequestTiming(150);

      const stats = healthService.getRequestStats();

      expect(stats.count).toBe(3);
      expect(stats.average).toBe((100 + 200 + 150) / 3);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(200);
    });

    it("should calculate latency percentiles", () => {
      // Registrar 100 timings de 1 a 100ms
      for (let i = 1; i <= 100; i++) {
        healthService.recordRequestTiming(i);
      }

      const health = healthService.getHealth();

      expect(health.latency.p95).toBeGreaterThan(health.latency.average);
      expect(health.latency.p99).toBeGreaterThan(health.latency.p95);
    });

    it("should limit stored timings to prevent memory leak", () => {
      const maxTimingsToStore = 1000;

      // Registrar mais timings do que o máximo
      for (let i = 0; i < maxTimingsToStore + 100; i++) {
        healthService.recordRequestTiming(Math.random() * 100);
      }

      const stats = healthService.getRequestStats();

      // Verificar que não ultrapassou o limite
      expect(stats.count).toBeLessThanOrEqual(maxTimingsToStore + 10); // Pequena margem de erro
    });

    it("should handle zero request count", () => {
      const stats = healthService.getRequestStats();

      expect(stats.count).toBe(0);
      expect(stats.average).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });
  });

  describe("Health Status Calculation", () => {
    it("should be healthy when memory usage is normal", () => {
      const health = healthService.getHealth();

      expect(health.status).toBe("healthy");
    });

    it("should report timestamp with correct format", () => {
      const health = healthService.getHealth();

      expect(health.timestamp instanceof Date).toBe(true);
      expect(health.timestamp.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("Reset Functionality", () => {
    it("should reset metrics", () => {
      // Registrar alguns timings
      healthService.recordRequestTiming(100);
      healthService.recordRequestTiming(200);

      let stats = healthService.getRequestStats();
      expect(stats.count).toBe(2);

      // Reset
      healthService.reset();

      stats = healthService.getRequestStats();
      expect(stats.count).toBe(0);
    });

    it("should reset uptime after reset", (done) => {
      const health1 = healthService.getHealth();
      const uptime1 = health1.uptime;

      healthService.reset();

      const health2 = healthService.getHealth();
      const uptime2 = health2.uptime;

      // Uptime deve estar próximo a zero após reset
      expect(uptime2).toBeLessThanOrEqual(uptime1);

      done();
    });
  });

  describe("Concurrent Access", () => {
    it("should handle concurrent request timing recording", async () => {
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise((resolve) => {
            setImmediate(() => {
              healthService.recordRequestTiming(Math.random() * 100);
              resolve(true);
            });
          })
        );
      }

      await Promise.all(promises);

      const stats = healthService.getRequestStats();
      expect(stats.count).toBe(100);
    });
  });

  describe("Performance", () => {
    it("should return health status quickly", () => {
      const start = Date.now();
      const health = healthService.getHealth();
      const duration = Date.now() - start;

      // Health check deve ser rápido (< 10ms)
      expect(duration).toBeLessThan(10);
    });

    it("should handle large request timing history", () => {
      // Registrar muitos timings
      for (let i = 0; i < 1000; i++) {
        healthService.recordRequestTiming(Math.random() * 100);
      }

      const start = Date.now();
      const health = healthService.getHealth();
      const duration = Date.now() - start;

      // Mesmo com muitos timings, deve ser rápido
      expect(duration).toBeLessThan(100);
      expect(health.latency.p95).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle negative timings gracefully", () => {
      healthService.recordRequestTiming(-10);
      const stats = healthService.getRequestStats();

      expect(stats.count).toBe(1);
      // Min pode ser negativo se alguém passar valor negativo
      expect(stats.min).toBe(-10);
    });

    it("should handle zero timings", () => {
      healthService.recordRequestTiming(0);
      const stats = healthService.getRequestStats();

      expect(stats.count).toBe(1);
      expect(stats.average).toBe(0);
    });

    it("should handle very large timings", () => {
      healthService.recordRequestTiming(Number.MAX_SAFE_INTEGER);
      const stats = healthService.getRequestStats();

      expect(stats.count).toBe(1);
      expect(stats.max).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});

describe("Health Endpoint Integration", () => {
  describe("Liveness and Readiness Probes", () => {
    it("should support Kubernetes health probes", () => {
      const healthService = new HealthCheckService();

      const health = healthService.getHealth();
      const readiness = healthService.getReadiness();

      // Liveness: /health
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);

      // Readiness: /ready
      expect(readiness.ready).toMatch(/true|false/);
    });

    it("should provide timing data for monitoring", () => {
      const healthService = new HealthCheckService();

      for (let i = 1; i <= 10; i++) {
        healthService.recordRequestTiming(i * 10);
      }

      const health = healthService.getHealth();

      expect(health.latency.average).toBe(55); // (10+20+...+100) / 10 = 55
      expect(health.latency.p95).toBeGreaterThanOrEqual(health.latency.average);
      expect(health.latency.p99).toBeGreaterThanOrEqual(health.latency.average);
    });
  });
});
