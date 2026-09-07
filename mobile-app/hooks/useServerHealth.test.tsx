import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { type ServerHealth, useServerHealth } from './useServerHealth';

function Probe({
  verify,
  resolveUrl,
  onHealth,
}: {
  verify: (url: string) => Promise<boolean>;
  resolveUrl: () => string;
  onHealth: (h: ServerHealth) => void;
}) {
  const { health } = useServerHealth({ verify, resolveUrl, intervalMs: 60_000 });
  onHealth(health);
  return <Text>{health}</Text>;
}

describe('useServerHealth', () => {
  it('starts unknown, then reports online when the probe answers', async () => {
    const seen: ServerHealth[] = [];
    const verify = vi.fn(async () => true);
    render(
      <Probe
        verify={verify}
        resolveUrl={() => 'http://mac:14000'}
        onHealth={(h) => seen.push(h)}
      />,
    );
    expect(seen[0]).toBe('unknown');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seen.at(-1)).toBe('online');
    expect(verify).toHaveBeenCalledWith('http://mac:14000');
  });

  it('reports offline when the probe fails', async () => {
    const seen: ServerHealth[] = [];
    render(
      <Probe
        verify={async () => false}
        resolveUrl={() => 'http://mac:14000'}
        onHealth={(h) => seen.push(h)}
      />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seen.at(-1)).toBe('offline');
  });
});

function RecoveryProbe({
  rediscover,
  onState,
}: {
  rediscover: () => Promise<string | null>;
  onState: (s: { health: ServerHealth; baseUrl: string }) => void;
}) {
  const state = useServerHealth({
    verify: async () => false,
    resolveUrl: () => 'http://dead:14000',
    rediscover,
    intervalMs: 60_000,
  });
  onState(state);
  return <Text>{state.health}</Text>;
}

describe('useServerHealth recovery', () => {
  it('rediscovers a live address when the configured one is dead', async () => {
    const seen: Array<{ health: ServerHealth; baseUrl: string }> = [];
    const rediscover = vi.fn(async () => 'http://127.0.0.1:14000');
    render(<RecoveryProbe rediscover={rediscover} onState={(s) => seen.push(s)} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seen.at(-1)?.health).toBe('online');
    expect(seen.at(-1)?.baseUrl).toBe('http://127.0.0.1:14000');
    expect(rediscover).toHaveBeenCalled();
  });

  it('reports offline only when nothing answers anywhere', async () => {
    const seen: Array<{ health: ServerHealth; baseUrl: string }> = [];
    render(<RecoveryProbe rediscover={async () => null} onState={(s) => seen.push(s)} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seen.at(-1)?.health).toBe('offline');
  });
});
