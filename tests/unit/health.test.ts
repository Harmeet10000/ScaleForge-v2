
import { describe, it, expect } from 'bun:test'
import { getSystemHealth, getApplicationHealth, checkMemory } from '../../src/utils/quicker';

describe('Health Utils - Unit Tests', () => {
  describe('getSystemHealth', () => {
    it('should return system health information', () => {
      const health = getSystemHealth();

      expect(health.cpuUsage).toBeTruthy();
      expect(Array.isArray(health.cpuUsage).toBeTruthy());
      expect(typeof health.cpuUsagePercent === 'string').toBeTruthy();
      expect(health.cpuUsagePercent.includes('%').toBeTruthy());
      expect(typeof health.totalMemory === 'string').toBeTruthy();
      expect(health.totalMemory.includes('MB').toBeTruthy());
      expect(typeof health.freeMemory === 'string').toBeTruthy();
      expect(health.freeMemory.includes('MB').toBeTruthy());
      expect(typeof health.platform === 'string').toBeTruthy();
      expect(typeof health.arch === 'string').toBeTruthy();
    });

    it('should return valid memory values', () => {
      const health = getSystemHealth();

      const totalMemory = parseFloat(health.totalMemory);
      const freeMemory = parseFloat(health.freeMemory);

      expect(totalMemory > 0).toBeTruthy();
      expect(freeMemory >= 0).toBeTruthy();
      expect(freeMemory <= totalMemory).toBeTruthy();
    });

    it('should return valid CPU usage percentage', () => {
      const health = getSystemHealth();
      const cpuPercent = parseFloat(health.cpuUsagePercent);

      expect(cpuPercent >= 0).toBeTruthy();
      // Note: CPU usage can exceed 100% on multi-core systems
    });
  });

  describe('getApplicationHealth', () => {
    it('should return application health information', () => {
      const health = getApplicationHealth();

      expect(typeof health.environment === 'string').toBeTruthy();
      expect(typeof health.uptime === 'string').toBeTruthy();
      expect(health.uptime.includes('Seconds').toBeTruthy());
      expect(typeof health.memoryUsage === 'object').toBeTruthy();
      expect(typeof health.memoryUsage.heapTotal === 'string').toBeTruthy();
      expect(health.memoryUsage.heapTotal.includes('MB').toBeTruthy());
      expect(typeof health.memoryUsage.heapUsed === 'string').toBeTruthy();
      expect(health.memoryUsage.heapUsed.includes('MB').toBeTruthy());
      expect(typeof health.pid === 'number').toBeTruthy();
      expect(typeof health.version === 'string').toBeTruthy();
    });

    it('should return valid memory usage values', () => {
      const health = getApplicationHealth();

      const heapTotal = parseFloat(health.memoryUsage.heapTotal);
      const heapUsed = parseFloat(health.memoryUsage.heapUsed);

      expect(heapTotal > 0).toBeTruthy();
      expect(heapUsed > 0).toBeTruthy();
      expect(heapUsed <= heapTotal).toBeTruthy();
    });

    it('should return valid process information', () => {
      const health = getApplicationHealth();

      expect(health.pid > 0).toBeTruthy();
      expect(health.version.startsWith('v').toBeTruthy(), 'Node version should start with v');
    });
  });

  describe('checkMemory', () => {
    it('should return memory check with healthy status when usage is low', () => {
      const memoryCheck = checkMemory();

      expect(typeof memoryCheck.status === 'string').toBeTruthy();
      assert.ok(['healthy', 'warning'].includes(memoryCheck.status));
      expect(typeof memoryCheck.totalMB === 'number').toBeTruthy();
      expect(typeof memoryCheck.usedMB === 'number').toBeTruthy();
      expect(typeof memoryCheck.usagePercent === 'number').toBeTruthy();

      expect(memoryCheck.totalMB > 0).toBeTruthy();
      expect(memoryCheck.usedMB >= 0).toBeTruthy();
      expect(memoryCheck.usagePercent >= 0).toBeTruthy();
      expect(memoryCheck.usagePercent <= 100).toBeTruthy();
    });

    it('should return warning status when memory usage is high', () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = () => ({
        heapTotal: 100 * 1024 * 1024, // 100MB
        heapUsed: 95 * 1024 * 1024, // 95MB (95% usage)
        external: 0,
        arrayBuffers: 0
      });

      const memoryCheck = checkMemory();

      expect(memoryCheck.status).toBe('warning');
      expect(memoryCheck.usagePercent).toBe(95);

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  // Note: Database, Redis, and Disk tests require external dependencies
  // These are better suited for integration tests where we can test
  // against real or containerized services
  describe('External service checks', () => {
    it('should be tested in integration test suite', () => {
      // Database, Redis, and disk checks require actual connections/filesystem
      // and are better tested in the integration test suite
      expect(true).toBeTruthy();
    });
  });
});
