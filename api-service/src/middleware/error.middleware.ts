/**
 * Error handling middleware for Fastify
 * Converts errors to proper HTTP responses
 */

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, isOperationalError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

/**
 * Global error handler
 */
export async function errorHandler(
  error: Error | FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id;

  // Log error
  logger.error(
    {
      error: error.message,
      stack: error.stack,
      requestId,
      method: request.method,
      url: request.url,
    },
    'Request error'
  );

  // Handle AppError (our custom errors)
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send(error.toJSON());
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.code(422).send({
      statusCode: 422,
      error: 'ValidationError',
      message: 'Validation failed',
      details: error.errors,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'BadRequest',
      message: 'Validation failed',
      details: error.validation,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle Fastify errors
  if ('statusCode' in error && error.statusCode) {
    return reply.code(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.name || 'Error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  // Default to 500 Internal Server Error
  return reply.code(500).send({
    statusCode: 500,
    error: 'InternalServerError',
    message: isOperationalError(error)
      ? error.message
      : 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Not found handler
 */
export async function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return reply.code(404).send({
    statusCode: 404,
    error: 'NotFound',
    message: `Route ${request.method} ${request.url} not found`,
    timestamp: new Date().toISOString(),
  });
}
