/**
 * Test authentication utilities
 * Generates test tokens and credentials
 */

import { UserPayload } from '../../middleware/auth.middleware';

/**
 * Create a test JWT token payload
 */
export function createTestToken(overrides?: Partial<UserPayload>): UserPayload {
  return {
    userId: 'test-user-123',
    email: 'test@example.com',
    ...overrides,
  };
}

/**
 * Generate Authorization header with test token
 */
export function createAuthHeader(userId: string = 'test-user-123', email: string = 'test@example.com'): string {
  // Create JWT-like token (base64 encoded JSON)
  const payload = {
    userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = Buffer.from('signature').toString('base64');

  const token = `${header}.${body}.${signature}`;
  return `Bearer ${token}`;
}

/**
 * Create test user ID
 */
export function createTestUserId(): string {
  return `user-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create multiple test tokens with different users
 */
export function createMultipleTestTokens(
  count: number = 3
): { userId: string; token: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const userId = `test-user-${i + 1}`;
    return {
      userId,
      token: createAuthHeader(userId),
    };
  });
}
