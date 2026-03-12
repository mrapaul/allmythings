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

export class BadRequestError extends AppError {
  statusCode = 400;
  isOperational = true;

  constructor(message: string = 'Bad Request') {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  statusCode = 401;
  isOperational = true;

  constructor(message: string = 'Unauthorized') {
    super(message);
  }
}

export class NotFoundError extends AppError {
  statusCode = 404;
  isOperational = true;

  constructor(message: string = 'Resource not found') {
    super(message);
  }
}

export class PayloadTooLargeError extends AppError {
  statusCode = 413;
  isOperational = true;

  constructor(message: string = 'Payload too large') {
    super(message);
  }
}

export class ValidationError extends AppError {
  statusCode = 422;
  isOperational = true;
  details?: unknown;

  constructor(message: string = 'Validation failed', details?: unknown) {
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

export class InternalServerError extends AppError {
  statusCode = 500;
  isOperational = false;

  constructor(message: string = 'Internal server error') {
    super(message);
  }
}

export class ServiceUnavailableError extends AppError {
  statusCode = 503;
  isOperational = true;
  details?: unknown;

  constructor(message: string = 'Service unavailable', details?: unknown) {
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

export class ImageProcessingError extends AppError {
  statusCode = 400;
  isOperational = true;

  constructor(message: string = 'Image processing failed') {
    super(message);
  }
}

export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(error.message);
  }

  return new InternalServerError('An unexpected error occurred');
}
