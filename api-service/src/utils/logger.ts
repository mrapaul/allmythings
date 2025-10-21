import pino from 'pino';
import { envConfig } from '../config/env.config';

/**
 * Structured logger using Pino
 */
export const logger = pino({
  level: envConfig.nodeEnv === 'production' ? 'info' : 'debug',
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
