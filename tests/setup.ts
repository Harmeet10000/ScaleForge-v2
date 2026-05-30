/**
 * Shared test setup and utilities
 *
 * This file is preloaded by Bun before running tests.
 * Use it for:
 * - Global test utilities
 * - Mock setup
 * - Shared fixtures
 * - Environment configuration
 */

import { afterAll, afterEach, beforeAll, test } from "bun:test";

/**
 * Global test environment setup
 */
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "error";

  // Default service URLs for local testing
  if (!process.env.DATABASE) {
    process.env.DATABASE = "mongodb://localhost:27017/auth_test";
  }
  if (!process.env.REDIS_HOST) {
    process.env.REDIS_HOST = "localhost";
  }
  if (!process.env.REDIS_PORT) {
    process.env.REDIS_PORT = "6379";
  }
  if (!process.env.RABBITMQ_URL) {
    process.env.RABBITMQ_URL = "amqp://guest:guest@localhost:5672";
  }

  console.log("[TEST SETUP] Environment configured:", {
    DATABASE: process.env.DATABASE,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NODE_ENV: process.env.NODE_ENV,
    REDIS_HOST: process.env.REDIS_HOST,
  });
});

/**
 * Cleanup after all tests complete
 */
afterAll(async () => {
  console.log("[TEST TEARDOWN] Cleaning up...");

  // Optionally close database connections
  try {
    // Add connection cleanup here when services are integrated
    // await mongoClient.close()
    // await redisClient.disconnect()
  } catch (error) {
    console.warn("[TEST TEARDOWN] Cleanup warning:", error);
  }
});

/**
 * Cleanup after each test
 */
afterEach(() => {
  // Reset any mocks or state that should be clean for the next test
  // This runs after every test
});

/**
 * Export test utilities
 */

/**
 * Helper to run an async test with timeout
 */
export const testAsync = (name: string, fn: () => Promise<void>, timeout = 30_000) =>
  test(name, async () => {
    const promise = fn();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout),
    );
    await Promise.race([promise, timeoutPromise]);
  });

/**
 * Wait for a condition to be true (useful for async operations)
 */
export const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`waitFor timeout after ${timeout}ms`);
};

/**
 * Generate random test data
 */
export const testData = {
  randomEmail: () => `test-${Math.random().toString(36).slice(2, 11)}@example.com`,
  randomId: () => Math.random().toString(36).slice(2, 11),
  randomString: (length = 10) =>
    Math.random()
      .toString(36)
      .slice(2, 2 + length),
};

console.log("[TEST SETUP] Utilities loaded successfully");
