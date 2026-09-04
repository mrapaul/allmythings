import { Prefs } from '@/stores/prefs';
import { describe, expect, it, vi } from 'vitest';
import {
  type DiscoveredService,
  type ZeroconfLike,
  isInventoryServerService,
  serviceToBaseUrl,
  startServerDiscovery,
} from './server-discovery';

function makeFakeZeroconf() {
  const listeners: Array<(s: DiscoveredService) => void> = [];
  const client: ZeroconfLike = {
    on: (_event, cb) => {
      listeners.push(cb);
    },
    scan: vi.fn(),
    stop: vi.fn(),
  };
  const resolve = (s: DiscoveredService) => {
    for (const cb of listeners) cb(s);
  };
  return { client, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('serviceToBaseUrl', () => {
  it('prefers an IPv4 address over the mDNS hostname', () => {
    expect(
      serviceToBaseUrl({
        name: 'allmythings-server',
        port: 14000,
        host: 'macbook.local.',
        addresses: ['fe80::1', '192.168.1.20'],
      }),
    ).toBe('http://192.168.1.20:14000');
  });

  it('falls back to the hostname with its trailing dot stripped', () => {
    expect(serviceToBaseUrl({ port: 14000, host: 'macbook.local.' })).toBe(
      'http://macbook.local:14000',
    );
  });

  it('returns null without a port or host', () => {
    expect(serviceToBaseUrl({ host: 'macbook.local.' })).toBeNull();
    expect(serviceToBaseUrl({ port: 14000 })).toBeNull();
  });
});

describe('isInventoryServerService', () => {
  it('matches only the advertised service name', () => {
    expect(isInventoryServerService({ name: 'allmythings-server' })).toBe(true);
    expect(isInventoryServerService({ name: 'printer' })).toBe(false);
    expect(isInventoryServerService({})).toBe(false);
  });
});

describe('startServerDiscovery', () => {
  it('persists a resolved service after a successful health check', async () => {
    // Arrange
    const prefs = Prefs.makeInMemory();
    const { client, resolve } = makeFakeZeroconf();
    const verify = vi.fn(async () => true);
    const stop = startServerDiscovery(prefs, { makeClient: () => client, verify });

    // Act
    resolve({ name: 'allmythings-server', port: 14000, addresses: ['192.168.1.20'] });
    await flush();

    // Assert
    expect(prefs.getDiscoveredApiUrl()).toBe('http://192.168.1.20:14000');
    stop();
  });

  it('ignores services that fail the health check or carry another name', async () => {
    // Arrange
    const prefs = Prefs.makeInMemory();
    const { client, resolve } = makeFakeZeroconf();
    const verify = vi.fn(async () => false);
    const stop = startServerDiscovery(prefs, { makeClient: () => client, verify });

    // Act
    resolve({ name: 'allmythings-server', port: 14000, addresses: ['192.168.1.20'] });
    resolve({ name: 'printer', port: 631, addresses: ['192.168.1.9'] });
    await flush();

    // Assert
    expect(prefs.getDiscoveredApiUrl()).toBeNull();
    stop();
  });

  it('drops a stale last-known-good URL that no longer answers', async () => {
    // Arrange
    const prefs = Prefs.makeInMemory();
    prefs.setDiscoveredApiUrl('http://192.168.1.99:14000');
    const verify = vi.fn(async () => false);

    // Act
    const stop = startServerDiscovery(prefs, { makeClient: () => null, verify });
    await flush();

    // Assert
    expect(prefs.getDiscoveredApiUrl()).toBeNull();
    stop();
  });

  it('degrades to a no-op when the native module is unavailable', () => {
    const prefs = Prefs.makeInMemory();
    const stop = startServerDiscovery(prefs, { makeClient: () => null, verify: async () => true });
    expect(typeof stop).toBe('function');
    stop();
  });
});
