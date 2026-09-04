process.env.NODE_ENV = 'development';

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  describeRejection,
  handleUnhandledRejection,
} from '../../../utils/process-guards';
import { logger } from '../../../utils/logger';

describe('handleUnhandledRejection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs and continues — never exits the process', () => {
    // Arrange
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as typeof process.exit);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    // Act — the incident shape: a gRPC status object, not an Error.
    handleUnhandledRejection({
      code: 14,
      details: 'No connection established. connect ECONNREFUSED 127.0.0.1:4317',
    });
    handleUnhandledRejection(new Error('exporter blew up'));

    // Assert
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('never throws, even for unserializable reasons', () => {
    // Arrange
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    // Act + Assert
    expect(() => handleUnhandledRejection(circular)).not.toThrow();
    expect(() => handleUnhandledRejection(undefined)).not.toThrow();
  });
});

describe('describeRejection', () => {
  it('extracts message and stack from Errors', () => {
    const described = describeRejection(new Error('boom'));
    expect(described.err).toBe('boom');
    expect(described.stack).toContain('boom');
  });

  it('serializes plain objects', () => {
    expect(describeRejection({ code: 14 }).err).toBe('{"code":14}');
  });

  it('falls back to String() for circular structures', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeRejection(circular).err).toBe('[object Object]');
  });
});
