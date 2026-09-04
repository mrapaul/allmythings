import { describe, it, expect } from 'vitest';
import { FallbackDetector } from '../../../services/vlm-detector.fallback';
import type { Detector, DetectorEvent } from '../../../services/vlm-detector';
import { DetectorUnavailableError } from '../../../clients/vlm-client';
import { DEFAULT_SCENE } from '../../../services/vlm-detector.parse';
import type { DetectedItem } from '../../../types/detected-item';

const ITEM: DetectedItem = {
  label: 'sofa',
  description: 'sofa',
  category: 'Furniture',
  tags: [],
  box: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
};

function okDetector(label: string): Detector {
  return {
    async detect() {
      return { scene: { ...DEFAULT_SCENE }, items: [{ ...ITEM, label }], mergeSuggestions: [] };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async *detectStream(): AsyncGenerator<DetectorEvent> {
      yield { kind: 'scene', scene: { ...DEFAULT_SCENE } };
      yield { kind: 'item', item: { ...ITEM, label } };
    },
  };
}

function downDetector(): Detector {
  return {
    async detect(): Promise<never> {
      throw new DetectorUnavailableError('down');
    },
    // eslint-disable-next-line @typescript-eslint/require-await, require-yield
    async *detectStream(): AsyncGenerator<DetectorEvent> {
      throw new DetectorUnavailableError('down');
    },
  };
}

function midStreamFailure(): Detector {
  return {
    async detect(): Promise<never> {
      throw new DetectorUnavailableError('late');
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async *detectStream(): AsyncGenerator<DetectorEvent> {
      yield { kind: 'scene', scene: { ...DEFAULT_SCENE } };
      yield { kind: 'item', item: ITEM };
      throw new DetectorUnavailableError('late');
    },
  };
}

async function collect(gen: AsyncGenerator<DetectorEvent>): Promise<DetectorEvent[]> {
  const out: DetectorEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('FallbackDetector', () => {
  it('streams from the primary when it works', async () => {
    const d = new FallbackDetector(okDetector('primary-item'), okDetector('secondary-item'));
    const events = await collect(d.detectStream(Buffer.from('x')));
    const labels = events.filter((e) => e.kind === 'item').map((e) => e.item.label);
    expect(labels).toEqual(['primary-item']);
  });

  it('falls back to the secondary when the primary is unavailable', async () => {
    const d = new FallbackDetector(downDetector(), okDetector('secondary-item'));
    const events = await collect(d.detectStream(Buffer.from('x')));
    const labels = events.filter((e) => e.kind === 'item').map((e) => e.item.label);
    expect(labels).toEqual(['secondary-item']);
  });

  it('throws when both detectors are unavailable', async () => {
    const d = new FallbackDetector(downDetector(), downDetector());
    await expect(collect(d.detectStream(Buffer.from('x')))).rejects.toBeInstanceOf(
      DetectorUnavailableError,
    );
  });

  it('throws when the primary fails with no secondary configured', async () => {
    const d = new FallbackDetector(downDetector(), null);
    await expect(collect(d.detectStream(Buffer.from('x')))).rejects.toBeInstanceOf(
      DetectorUnavailableError,
    );
  });

  it('does not switch detectors after items already streamed (no mixed results)', async () => {
    const d = new FallbackDetector(midStreamFailure(), okDetector('secondary-item'));
    const events: DetectorEvent[] = [];
    const err = await (async () => {
      try {
        for await (const ev of d.detectStream(Buffer.from('x'))) events.push(ev);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DetectorUnavailableError);
    expect(events.filter((e) => e.kind === 'item')).toHaveLength(1);
  });

  it('detect() aggregates via the same fallback path', async () => {
    const d = new FallbackDetector(downDetector(), okDetector('secondary-item'));
    const { items } = await d.detect(Buffer.from('x'));
    expect(items.map((i) => i.label)).toEqual(['secondary-item']);
  });
});
