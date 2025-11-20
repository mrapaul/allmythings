/**
 * Custom error classes for the application
 * All errors extend AppError for consistent error handling
 */

export abstract class AppError extends Error {
  abstract statusCode: number;
  abstract isOperational: boolean;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      error: this.constructor.name,
      message: this.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * 400 Bad Request
 * Client sent invalid data
 */
export class BadRequestError extends AppError {
  statusCode = 400;
  isOperational = true;

  constructor(message: string = 'Bad Request') {
    super(message);
  }
}

/**
 * 401 Unauthorized
 * Missing or invalid authentication
 */
export class UnauthorizedError extends AppError {
  statusCode = 401;
  isOperational = true;

  constructor(message: string = 'Unauthorized') {
    super(message);
  }
}

/**
 * 403 Forbidden
 * Valid authentication but insufficient permissions
 */
export class ForbiddenError extends AppError {
  statusCode = 403;
  isOperational = true;

  constructor(message: string = 'Forbidden') {
    super(message);
  }
}

/**
 * 404 Not Found
 * Requested resource does not exist
 */
export class NotFoundError extends AppError {
  statusCode = 404;
  isOperational = true;

  constructor(message: string = 'Resource not found') {
    super(message);
  }
}

/**
 * 409 Conflict
 * Request conflicts with current state
 */
export class ConflictError extends AppError {
  statusCode = 409;
  isOperational = true;

  constructor(message: string = 'Conflict') {
    super(message);
  }
}

/**
 * 413 Payload Too Large
 * Request body exceeds size limit
 */
export class PayloadTooLargeError extends AppError {
  statusCode = 413;
  isOperational = true;

  constructor(message: string = 'Payload too large') {
    super(message);
  }
}

/**
 * 422 Unprocessable Entity
 * Validation failed
 */
export class ValidationError extends AppError {
  statusCode = 422;
  isOperational = true;
  details?: any;

  constructor(message: string = 'Validation failed', details?: any) {
    super(message);
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

/**
 * 429 Too Many Requests
 * Rate limit exceeded
 */
export class TooManyRequestsError extends AppError {
  statusCode = 429;
  isOperational = true;
  retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message);
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * 500 Internal Server Error
 * Unexpected error occurred
 */
export class InternalServerError extends AppError {
  statusCode = 500;
  isOperational = false;

  constructor(message: string = 'Internal server error') {
    super(message);
  }
}

/**
 * 503 Service Unavailable
 * External service temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  statusCode = 503;
  isOperational = true;
  details?: any;

  constructor(message: string = 'Service unavailable', details?: any) {
    super(message);
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

/**
 * Circuit Breaker Open Error
 * Circuit breaker is open, rejecting requests
 */
export class CircuitOpenError extends AppError {
  statusCode = 503;
  isOperational = true;
  nextAttempt: number;

  constructor(message: string, nextAttempt: number) {
    super(message);
    this.nextAttempt = nextAttempt;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: {
        retryAfter: new Date(this.nextAttempt).toISOString(),
      },
    };
  }
}

/**
 * Image Processing Error
 * Error during image validation/processing
 */
export class ImageProcessingError extends AppError {
  statusCode = 400;
  isOperational = true;

  constructor(message: string = 'Image processing failed') {
    super(message);
  }
}

/**
 * Database Error
 * Database operation failed
 */
export class DatabaseError extends AppError {
  statusCode = 500;
  isOperational = false;

  constructor(message: string = 'Database operation failed') {
    super(message);
  }
}

/**
 * Cache Error
 * Cache operation failed (non-critical)
 */
export class CacheError extends Error {
  isOperational = true;

  constructor(message: string = 'Cache operation failed') {
    super(message);
  }
}

/**
 * Helper function to check if error is operational
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Helper function to convert any error to AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(error.message);
  }

  return new InternalServerError('An unexpected error occurred');
}
