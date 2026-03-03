/**
 * Health Integration Tests
 * Verifica que os endpoints de health check estão integrados corretamente
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import express, { Express } from "express";
import request from "supertest";
import { setupHealthChecks, getHealthController } from "../health-integration";
import { HealthController } from "../health-controller";

describe("Health Check Integration", () => {
  let app: Express;
  let server: any;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Setup health checks
    setupHealthChecks(app, 8080);

    server = await new Promise<any>((resolve) => {
      const srv = app.listen(0, () => {
        resolve(srv);
      });
    });
  });

  afterEach(async () => {
    return new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe("GET /health", () => {
    it("should return 200 with health status", async () => {
      const response = await request(app).get("/health").expect("Content-Type", /json/).expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("uptime");
      expect(["healthy", "degraded", "unhealthy"]).toContain(response.body.status);
    });

    it("should have valid uptime value", async () => {
      const response = await request(app).get("/health").expect(200);

      expect(typeof response.body.uptime).toBe("number");
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should have valid timestamp", async () => {
      const response = await request(app).get("/health").expect(200);

      expect(new Date(response.body.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe("GET /ready", () => {
    it("should return 200 with readiness status", async () => {
      const response = await request(app).get("/ready").expect("Content-Type", /json/).expect(200);

      expect(response.body).toHaveProperty("ready");
      expect(response.body).toHaveProperty("readiness");
      expect(response.body).toHaveProperty("timestamp");
    });

    it("should have boolean ready status", async () => {
      const response = await request(app).get("/ready").expect(200);

      expect(typeof response.body.ready).toBe("boolean");
    });

    it("should have readiness services info", async () => {
      const response = await request(app).get("/ready").expect(200);

      expect(response.body.readiness).toHaveProperty("mcp_server");
      expect(response.body.readiness).toHaveProperty("authentication");
      expect(response.body.readiness).toHaveProperty("external_services");
    });
  });

  describe("GET /health/detailed", () => {
    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/health/detailed").expect(401);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("UNAUTHORIZED");
    });
  });

  describe("GET /metrics", () => {
    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/metrics").expect(401);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("UNAUTHORIZED");
    });
  });

  describe("Health Controller Singleton", () => {
    it("should return the same controller instance", () => {
      const controller1 = getHealthController();
      const controller2 = getHealthController();

      expect(controller1).toBe(controller2);
    });

    it("should have healthService property exposed", () => {
      const controller = getHealthController();
      expect(controller).toHaveProperty("healthService");
      expect(controller.healthService).toBeDefined();
    });

    it("controller should be instance of HealthController", () => {
      const controller = getHealthController();
      expect(controller).toBeInstanceOf(HealthController);
    });
  });

  describe("Request Timing Middleware", () => {
    it("should record request timing for non-health endpoints", async () => {
      // Create a test endpoint that's not a health check
      app.get("/test", (req, res) => {
        res.json({ test: true });
      });

      const response = await request(app).get("/test").expect(200);

      expect(response.body.test).toBe(true);

      // Verify the timing was recorded
      const controller = getHealthController();
      const stats = controller.healthService.getRequestStats();

      // Should have at least recorded the /test endpoint
      expect(stats.count).toBeGreaterThan(0);
    });

    it("should not record timing for health check endpoints", async () => {
      const controller = getHealthController();
      const statsBefore = controller.healthService.getRequestStats().count;

      await request(app).get("/health").expect(200);

      const statsAfter = controller.healthService.getRequestStats().count;

      // Health check endpoint should not add to request count
      expect(statsAfter).toBe(statsBefore);
    });
  });

  describe("Concurrent Requests", () => {
    it("should handle multiple concurrent requests", async () => {
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(request(app).get("/health").expect(200));
      }

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(10);
      expect(responses.every((r) => r.status === 200)).toBe(true);
    });
  });

  describe("Health Status Under Load", () => {
    it("should track latency for multiple requests", async () => {
      // Create a test endpoint
      app.get("/slow", (req, res) => {
        setTimeout(() => {
          res.json({ slow: true });
        }, 10);
      });

      // Make several requests
      for (let i = 0; i < 5; i++) {
        await request(app).get("/slow").expect(200);
      }

      const controller = getHealthController();
      const stats = controller.healthService.getRequestStats();

      expect(stats.count).toBeGreaterThanOrEqual(5);
      expect(stats.average).toBeGreaterThan(0);
      expect(stats.min).toBeGreaterThan(0);
      expect(stats.max).toBeGreaterThan(0);
    });
  });
});
