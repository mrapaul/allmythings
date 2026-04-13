import { describe, it, expect, vi } from 'vitest';

vi.mock('bonjour-service', () => {
  const serviceMock = { on: vi.fn() };
  const publishMock = vi.fn().mockReturnValue(serviceMock);
  const destroyMock = vi.fn();

  return {
    default: vi.fn().mockImplementation(() => ({
      publish: publishMock,
      destroy: destroyMock,
    })),
  };
});

describe('Bonjour advertisement', () => {
  it('calls bonjour.publish with correct service config', async () => {
    const { advertiseService } = await import('../../src/utils/bonjour-advertiser');
    const module = await vi.importMock('bonjour-service');

    const stop = advertiseService(14000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BonjourClass = (module as any).default;
    const results = BonjourClass.mock.results;
    const instance = results[results.length - 1].value;

    expect(instance.publish).toHaveBeenCalledWith({
      name: 'allmythings-server',
      type: 'http',
      port: 14000,
    });

    stop();
    expect(instance.destroy).toHaveBeenCalled();
  });
});
