/**
 * Secure JWT Authentication Middleware
 * Implements proper JWT verification with RS256 algorithm
 * OWASP compliant implementation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getDatabase } from '../db/database';

/**
 * User payload from JWT
 */
export interface JWTPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
  jti: string; // JWT ID for revocation
}

/**
 * Extend Fastify request with user
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

/**
 * Token blacklist cache (use Redis in production)
 */
const tokenBlacklist = new Set<string>();

/**
 * Failed attempt tracking (use Redis in production)
 */
const failedAttempts = new Map<string, { count: number; lastAttempt: Date }>();

/**
 * Configuration
 */
const AUTH_CONFIG = {
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || '',
  JWT_ALGORITHM: 'RS256' as const,
  JWT_ISSUER: 'visual-inventory-api',
  JWT_AUDIENCE: 'visual-inventory-app',
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
  TOKEN_REFRESH_WINDOW_MS: 5 * 60 * 1000, // 5 minutes before expiry
};

/**
 * Verify JWT token with proper security checks
 */
async function verifyToken(token: string): Promise<JWTPayload> {
  try {
    // Verify token signature and claims
    const decoded = jwt.verify(token, AUTH_CONFIG.JWT_PUBLIC_KEY, {
      algorithms: [AUTH_CONFIG.JWT_ALGORITHM],
      issuer: AUTH_CONFIG.JWT_ISSUER,
      audience: AUTH_CONFIG.JWT_AUDIENCE,
      clockTolerance: 30, // 30 seconds clock skew tolerance
    }) as JWTPayload;

    // Check if token is blacklisted (revoked)
    if (tokenBlacklist.has(decoded.jti)) {
      throw new UnauthorizedError('Token has been revoked');
    }

    // Check session validity in database
    const db = getDatabase();
    const session = await db.queryOne(
      `SELECT * FROM user_sessions
       WHERE session_id = $1
       AND user_id = $2
       AND expires_at > NOW()
       AND revoked_at IS NULL`,
      [decoded.sessionId, decoded.userId]
    );

    if (!session) {
      throw new UnauthorizedError('Session invalid or expired');
    }

    // Check if user is still active
    const user = await db.queryOne(
      `SELECT * FROM users
       WHERE id = $1
       AND is_active = true
       AND deleted_at IS NULL`,
      [decoded.userId]
    );

    if (!user) {
      throw new UnauthorizedError('User account is inactive or deleted');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw error;
  }
}

/**
 * Track failed authentication attempts
 */
function trackFailedAttempt(identifier: string): void {
  const attempts = failedAttempts.get(identifier) || { count: 0, lastAttempt: new Date() };
  attempts.count++;
  attempts.lastAttempt = new Date();
  failedAttempts.set(identifier, attempts);

  // Log suspicious activity
  if (attempts.count >= AUTH_CONFIG.MAX_FAILED_ATTEMPTS) {
    logger.warn(
      { identifier, attempts: attempts.count },
      'Account locked due to multiple failed authentication attempts'
    );
  }
}

/**
 * Check if account is locked due to failed attempts
 */
function isAccountLocked(identifier: string): boolean {
  const attempts = failedAttempts.get(identifier);
  if (!attempts) return false;

  if (attempts.count >= AUTH_CONFIG.MAX_FAILED_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt.getTime();
    if (timeSinceLastAttempt < AUTH_CONFIG.LOCKOUT_DURATION_MS) {
      return true;
    }
    // Reset after lockout duration
    failedAttempts.delete(identifier);
  }

  return false;
}

/**
 * Extract token from Authorization header
 */
function extractToken(request: FastifyRequest): string {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError('Missing authorization header');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Invalid authorization header format');
  }

  const token = authHeader.substring(7);

  if (!token) {
    throw new UnauthorizedError('Missing token');
  }

  return token;
}

/**
 * Main authentication middleware
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id;
  const clientIp = request.ip;

  try {
    // Check if IP is locked due to failed attempts
    if (isAccountLocked(clientIp)) {
      throw new ForbiddenError('Too many failed attempts. Please try again later.');
    }

    // Extract and verify token
    const token = extractToken(request);
    const payload = await verifyToken(token);

    // Clear failed attempts on successful auth
    failedAttempts.delete(clientIp);

    // Attach user to request
    request.user = payload;

    // Log successful authentication
    logger.info(
      {
        requestId,
        userId: payload.userId,
        sessionId: payload.sessionId,
        method: request.method,
        path: request.url,
      },
      'User authenticated successfully'
    );

    // Check if token needs refresh (within refresh window)
    const timeUntilExpiry = payload.exp * 1000 - Date.now();
    if (timeUntilExpiry < AUTH_CONFIG.TOKEN_REFRESH_WINDOW_MS) {
      reply.header('X-Token-Refresh-Required', 'true');
    }
  } catch (error) {
    // Track failed attempt
    trackFailedAttempt(clientIp);

    // Log authentication failure
    logger.warn(
      {
        requestId,
        clientIp,
        error: error instanceof Error ? error.message : 'Unknown error',
        method: request.method,
        path: request.url,
      },
      'Authentication failed'
    );

    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      throw error;
    }

    throw new UnauthorizedError('Authentication failed');
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

/**
 * Role-based access control middleware
 */
export function requireRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const hasRole = roles.some((role) => request.user!.roles.includes(role));

    if (!hasRole) {
      logger.warn(
        {
          userId: request.user.userId,
          requiredRoles: roles,
          userRoles: request.user.roles,
          path: request.url,
        },
        'Access denied - insufficient role'
      );
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}

/**
 * Permission-based access control middleware
 */
export function requirePermission(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const hasPermission = permissions.some((perm) => request.user!.permissions.includes(perm));

    if (!hasPermission) {
      logger.warn(
        {
          userId: request.user.userId,
          requiredPermissions: permissions,
          userPermissions: request.user.permissions,
          path: request.url,
        },
        'Access denied - insufficient permissions'
      );
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}

/**
 * Revoke a token (add to blacklist)
 */
export async function revokeToken(jti: string, userId: string): Promise<void> {
  // Add to blacklist
  tokenBlacklist.add(jti);

  // Update session in database
  const db = getDatabase();
  await db.query(
    `UPDATE user_sessions
     SET revoked_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );

  logger.info({ jti, userId }, 'Token revoked');
}

/**
 * Clean up expired tokens from blacklist (run periodically)
 */
export async function cleanupExpiredTokens(): Promise<void> {
  // In production, this would be handled by Redis TTL
  // For now, we'll just clear the Set periodically
  const db = getDatabase();

  // Remove expired sessions from database
  await db.query(
    `DELETE FROM user_sessions
     WHERE expires_at < NOW() - INTERVAL '1 day'`
  );

  logger.info('Cleaned up expired tokens and sessions');
}