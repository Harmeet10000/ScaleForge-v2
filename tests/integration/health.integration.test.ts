import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import request from "supertest";
import app from "../../src/app";

describe("Health Endpoints - Integration Tests", () => {
  let server;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = "test";
    process.env.SERVER_ID = "test-server-integration";
    process.env.HOSTNAME = "test-container-integration";

    // Start the server
    const port = process.env.TEST_PORT || 0; // Use random port for testing
    server = app.listen(port);
  });

  afterAll(async () => {
    // Clean up
    if (server) {
      server.close();
    }

    // Clean up environment variables
    delete process.env.SERVER_ID;
    delete process.env.HOSTNAME;
  });

  beforeEach(() => {
    // Reset any state between tests if needed
  });

  describe("GET /api/v1/health/self", () => {
    it("should return 200 and server information", async () => {
      const response = await request(app).get("/api/v1/health/self").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.statusCode).toBe(200);
      expect(response.body.data).toBeTruthy();

      const { data } = response.body;
      expect(data.server).toBe("test-server-integration");
      expect(data.container).toBe("test-container-integration");
      expect(data.timestamp).toBeTruthy();

      // Verify timestamp is valid ISO string
      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime().toBeTruthy() > 0);
      expect(Math.abs(Date.now().toBeTruthy() - timestamp.getTime()) < 5000); // Within 5 seconds
    });

    it("should return consistent response structure", async () => {
      const response = await request(app).get("/api/v1/health/self").expect(200);

      // Verify response structure
      expect(typeof response.body.success === "boolean").toBeTruthy();
      expect(typeof response.body.statusCode === "number").toBeTruthy();
      expect(typeof response.body.message === "string").toBeTruthy();
      expect(typeof response.body.data === "object").toBeTruthy();

      // Verify data structure
      const { data } = response.body;
      expect(typeof data.server === "string").toBeTruthy();
      expect(typeof data.container === "string").toBeTruthy();
      expect(typeof data.timestamp === "string").toBeTruthy();
    });

    it("should handle multiple concurrent requests", async () => {
      const requests = Array(10)
        .fill()
        .map(() => request(app).get("/api/v1/health/self").expect(200));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.body.success).toBe(true);
        expect(response.body.statusCode).toBe(200);
        expect(response.body.data.timestamp).toBeTruthy();
      });
    });

    it("should return appropriate headers", async () => {
      const response = await request(app).get("/api/v1/health/self").expect(200);

      expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
      expect(response.headers["x-response-time"]).toBeTruthy();
    });
  });

  describe("GET /api/v1/health/health", () => {
    it("should return 200 and comprehensive health data", async () => {
      const response = await request(app).get("/api/v1/health/health").expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.statusCode).toBe(200);
      expect(response.body.data).toBeTruthy();

      const { data } = response.body;

      // Verify main structure
      expect(data.application).toBeTruthy();
      expect(data.system).toBeTruthy();
      expect(data.checks).toBeTruthy();
      expect(data.timestamp).toBeTruthy();

      // Verify checks structure
      expect(data.checks.database).toBeTruthy();
      expect(data.checks.redis).toBeTruthy();
      expect(data.checks.memory).toBeTruthy();
      expect(data.checks.disk).toBeTruthy();

      // Verify each check has status
      Object.values(data.checks).forEach((check) => {
        expect(typeof check.status === "string").toBeTruthy();
        expect(["healthy", "unhealthy", "warning"]).toContain(check.status);
      });
    });

    it("should return valid application health data", async () => {
      const response = await request(app).get("/api/v1/health/health").expect(200);

      const appHealth = response.body.data.application;

      expect(typeof appHealth.environment === "string").toBeTruthy();
      expect(typeof appHealth.uptime === "string").toBeTruthy();
      expect(appHealth.uptime.includes("Seconds").toBeTruthy());
      expect(typeof appHealth.memoryUsage === "object").toBeTruthy();
      expect(typeof appHealth.memoryUsage.heapTotal === "string").toBeTruthy();
      expect(typeof appHealth.memoryUsage.heapUsed === "string").toBeTruthy();
      expect(typeof appHealth.pid === "number").toBeTruthy();
      expect(typeof appHealth.version === "string").toBeTruthy();
    });

    it("should return valid system health data", async () => {
      const response = await request(app).get("/api/v1/health/health").expect(200);

      const sysHealth = response.body.data.system;

      expect(Array.isArray(sysHealth.cpuUsage).toBeTruthy());
      expect(typeof sysHealth.cpuUsagePercent === "string").toBeTruthy();
      expect(sysHealth.cpuUsagePercent.includes("%").toBeTruthy());
      expect(typeof sysHealth.totalMemory === "string").toBeTruthy();
      expect(sysHealth.totalMemory.includes("MB").toBeTruthy());
      expect(typeof sysHealth.freeMemory === "string").toBeTruthy();
      expect(sysHealth.freeMemory.includes("MB").toBeTruthy());
      expect(typeof sysHealth.platform === "string").toBeTruthy();
      expect(typeof sysHealth.arch === "string").toBeTruthy();
    });

    it("should return memory check with valid data", async () => {
      const response = await request(app).get("/api/v1/health/health").expect(200);

      const memoryCheck = response.body.data.checks.memory;

      expect(["healthy", "warning"]).toContain(memoryCheck.status);
      expect(typeof memoryCheck.totalMB === "number").toBeTruthy();
      expect(typeof memoryCheck.usedMB === "number").toBeTruthy();
      expect(typeof memoryCheck.usagePercent === "number").toBeTruthy();

      expect(memoryCheck.totalMB > 0).toBeTruthy();
      expect(memoryCheck.usedMB >= 0).toBeTruthy();
      expect(memoryCheck.usagePercent >= 0).toBeTruthy();
      expect(memoryCheck.usagePercent <= 100).toBeTruthy();
    });

    it("should return disk check with accessibility status", async () => {
      const response = await request(app).get("/api/v1/health/health").expect(200);

      const diskCheck = response.body.data.checks.disk;

      expect(["healthy", "unhealthy"]).toContain(diskCheck.status);

      if (diskCheck.status === "healthy") {
        expect(diskCheck.accessible).toBe(true);
      } else {
        expect(typeof diskCheck.error === "string").toBeTruthy();
      }
    });

    it("should handle health check timeouts gracefully", async () => {
      const response = await request(app)
        .get("/api/v1/health/health")
        .timeout(10_000) // 10 second timeout
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.timestamp).toBeTruthy();
    });

    it("should return consistent response times", async () => {
      const startTime = Date.now();

      await request(app).get("/api/v1/health/health").expect(200);

      const responseTime = Date.now() - startTime;

      // Health check should complete within reasonable time
      expect(responseTime).toBeLessThan(5000);
    });
  });

  describe("Error handling", () => {
    it("should return 404 for non-existent health endpoints", async () => {
      await request(app).get("/api/v1/health/nonexistent").expect(404);
    });

    it("should handle malformed requests gracefully", async () => {
      await request(app).get("/api/v1/health/self?invalid=param").expect(200); // Should still work with query params
    });
  });
});
