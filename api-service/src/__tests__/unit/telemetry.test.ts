import { describe, it, expect } from 'vitest';
import { initTelemetry, shutdownTelemetry } from '../../telemetry';

describe('telemetry', () => {
  it('initializes without throwing when OTLP endpoint is set', async () => {
    process.env.OTLP_ENDPOINT = 'http://localhost:4317';
    process.env.OTEL_SERVICE_NAME = 'api-service-test';
    await expect(initTelemetry()).resolves.not.toThrow();
    await shutdownTelemetry();
  });
});
