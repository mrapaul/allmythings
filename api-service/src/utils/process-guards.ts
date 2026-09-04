import { logger } from './logger';

/**
 * Process-level last-resort handlers.
 *
 * unhandledRejection is LOG-AND-CONTINUE by design: a stray rejection from a
 * background dependency (the incident driver was the OTel gRPC exporter's
 * `connect ECONNREFUSED 127.0.0.1:4317` with the collector down) must never
 * take user work down. Long-running detections live in this process; dying
 * here wipes them.
 *
 * uncaughtException stays fatal, as is convention — after a synchronous
 * escape the process state cannot be trusted, and launchd restarts us.
 */

export function describeRejection(reason: unknown): { err: string; stack?: string } {
  if (reason instanceof Error) return { err: reason.message, stack: reason.stack };
  try {
    return { err: JSON.stringify(reason) };
  } catch {
    return { err: String(reason) };
  }
}

/** Log and continue. Never throws, never exits. */
export function handleUnhandledRejection(reason: unknown): void {
  logger.error(describeRejection(reason), 'Unhandled Rejection');
}

export function installProcessGuards(): void {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught Exception');
    process.exit(1);
  });
  process.on('unhandledRejection', handleUnhandledRejection);
}
