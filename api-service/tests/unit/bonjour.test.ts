import { describe, it, expect, vi } from 'vitest';

vi.mock('bonjour-service', () => {
  const publishMock = vi.fn();
  const destroyMock = vi.fn();

  return {
    default: vi.fn().mockImplementation(() => ({
      publish: publishMock,
      destroy: destroyMock,
    })),
    publishMock: () => publishMock,
    destroyMock: () => destroyMock,
  };
});

describe('Bonjour advertisement', () => {
  it('calls bonjour.publish with correct service config', async () => {
    const { advertiseService } = await import('../../src/utils/bonjour-advertiser');
    const module = await vi.importMock('bonjour-service');

    const stop = advertiseService(14000);

    const BonjourClass = module.default;
    const instance = BonjourClass.mock.results[0].value;

    expect(instance.publish).toHaveBeenCalledWith({
      name: 'allmythings-server',
      type: 'http',
      port: 14000,
    });

    stop();
    expect(instance.destroy).toHaveBeenCalled();
  });
});
