/**
 * Authentication middleware - validates JWT tokens
 * Extracts user ID from token and attaches to request
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * User payload from JWT
 */
export interface UserPayload {
  userId: string;
  email: string;
  exp?: number;
}

/**
 * Extend Fastify request with user
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: UserPayload;
  }
}

/**
 * Extract and validate JWT token from Authorization header
 * For Phase 1: Simple validation without external dependencies
 * In production: Use jsonwebtoken or @fastify/jwt
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('Missing authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Invalid authorization header format');
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    if (!token) {
      throw new UnauthorizedError('Missing token');
    }

    // For Phase 1: Simple token validation
    // In production: Verify JWT signature and expiration
    const user = parseToken(token);

    // Attach user to request
    request.user = user;

    logger.debug({ userId: user.userId }, 'User authenticated');
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    logger.error({ error }, 'Authentication failed');
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Parse token and extract user payload
 * For Phase 1: Basic parsing without signature verification
 * In production: Use proper JWT verification
 */
function parseToken(token: string): UserPayload {
  try {
    // For Phase 1: Accept any token format with userId
    // In production: Decode and verify JWT

    // Simple base64 decode for development tokens
    if (token.includes('.')) {
      // JWT format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = parts[1];
      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      const data = JSON.parse(decoded);

      if (!data.userId) {
        throw new Error('Token missing userId');
      }

      return {
        userId: data.userId,
        email: data.email || '',
        exp: data.exp,
      };
    }

    // For development: Accept simple format "userId:email"
    if (token.includes(':')) {
      const [userId, email] = token.split(':');
      return { userId, email };
    }

    // For development: Accept just userId
    return {
      userId: token,
      email: 'dev@example.com',
    };
  } catch (error) {
    logger.error({ error }, 'Failed to parse token');
    throw new UnauthorizedError('Invalid token format');
  }
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if no token
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await authMiddleware(request, reply);
  } catch {
    // Continue without authentication
    request.user = undefined;
  }
}
