import { describe, expect, it } from 'vitest';
import { USB_TUNNEL_URL, candidateUrls } from './server-candidates';

describe('candidateUrls', () => {
  it('tries the user setting first but always keeps a fallback behind it', () => {
    expect(
      candidateUrls({
        override: 'http://192.168.2.42:14000',
        discovered: null,
        extraDefault: 'http://192.168.2.42:14000',
      }),
    ).toEqual(['http://192.168.2.42:14000', USB_TUNNEL_URL]);
  });

  it('orders setting, then last-known-good, then the baked default, then the cable', () => {
    expect(
      candidateUrls({
        override: 'http://pinned:14000',
        discovered: 'http://found:14000',
        extraDefault: 'http://baked:14000',
      }),
    ).toEqual(['http://pinned:14000', 'http://found:14000', 'http://baked:14000', USB_TUNNEL_URL]);
  });

  it('ignores blanks and trailing slashes, and never repeats an address', () => {
    expect(
      candidateUrls({
        override: '  ',
        discovered: 'http://found:14000/',
        extraDefault: 'http://found:14000',
      }),
    ).toEqual(['http://found:14000', USB_TUNNEL_URL]);
  });

  it('still offers the cable when nothing is configured at all', () => {
    expect(candidateUrls({ override: null, discovered: null, extraDefault: null })).toEqual([
      USB_TUNNEL_URL,
    ]);
  });
});
