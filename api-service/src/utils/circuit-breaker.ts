import { logger } from './logger';

/**
 * Circuit breaker implementation for provider failover
 */

enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Failing, reject requests
  HALF_OPEN = 'half-open', // Testing if recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number; // ms
  halfOpenRequests: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(
          `Circuit breaker [${this.name}] is OPEN. Next attempt at ${new Date(this.nextAttempt).toISOString()}`
        );
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info(
        { name: this.name },
        'Circuit breaker entering HALF-OPEN state'
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenRequests) {
        this.state = CircuitState.CLOSED;
        logger.info(
          { name: this.name },
          'Circuit breaker recovered, now CLOSED'
        );
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.resetTimeout;
      logger.warn(
        {
          name: this.name,
          failureCount: this.failureCount,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        },
        'Circuit breaker opened due to failures'
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
