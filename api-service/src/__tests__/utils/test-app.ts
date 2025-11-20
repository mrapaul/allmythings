/**
 * Test app factory - creates Fastify app instances for testing
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';

let testApp: FastifyInstance | null = null;

/**
 * Get or create test app instance
 */
export async function getTestApp(): Promise<FastifyInstance> {
  if (!testApp) {
    testApp = await buildApp();
  }
  return testApp;
}

/**
 * Close test app
 */
export async function closeTestApp(): Promise<void> {
  if (testApp) {
    await testApp.close();
    testApp = null;
  }
}

/**
 * Reset test app (close and recreate)
 */
export async function resetTestApp(): Promise<FastifyInstance> {
  await closeTestApp();
  return getTestApp();
}
