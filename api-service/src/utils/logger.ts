import pino from 'pino';
import { trace, context } from '@opentelemetry/api';
import { envConfig } from '../config/env.config';

/**
 * Pino mixin: pulls trace_id/span_id from the active OTel span (if any)
 * and injects them into every log line so logs can be correlated with
 * distributed traces in Grafana/Tempo.
 */
function traceMixin(): Record<string, string> {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const sc = span.spanContext();
  if (!sc || !sc.traceId) return {};
  return { trace_id: sc.traceId, span_id: sc.spanId };
}

/**
 * Structured logger using Pino with OpenTelemetry trace correlation.
 */
export const logger = pino({
  level: envConfig.nodeEnv === 'production' ? 'info' : 'debug',
  mixin: traceMixin,
  transport:
    envConfig.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
