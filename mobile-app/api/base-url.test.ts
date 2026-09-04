import { describe, expect, it } from 'vitest';
import { LOCALHOST_FALLBACK_URL, pickApiBaseUrl } from './base-url';

describe('pickApiBaseUrl', () => {
  it('prefers the manual Settings override over everything', () => {
    expect(
      pickApiBaseUrl({
        override: 'http://tailscale-host:14000',
        discovered: 'http://192.168.1.20:14000',
        extraDefault: 'http://192.168.178.14:14000',
      }),
    ).toBe('http://tailscale-host:14000');
  });

  it('falls back to the discovered server when no override is set', () => {
    expect(
      pickApiBaseUrl({
        override: null,
        discovered: 'http://192.168.1.20:14000',
        extraDefault: 'http://192.168.178.14:14000',
      }),
    ).toBe('http://192.168.1.20:14000');
  });

  it('falls back to the build-time default when nothing was discovered', () => {
    expect(
      pickApiBaseUrl({
        override: null,
        discovered: null,
        extraDefault: 'http://192.168.178.14:14000',
      }),
    ).toBe('http://192.168.178.14:14000');
  });

  it('falls back to localhost when no candidate exists', () => {
    expect(pickApiBaseUrl({ override: null, discovered: null, extraDefault: null })).toBe(
      LOCALHOST_FALLBACK_URL,
    );
  });
});
