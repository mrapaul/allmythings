import { describe, it, expect } from 'vitest';
import { flywheelToCoco, latestRecordPerPhoto } from '../../../services/flywheel-coco';

const sha = 'ab'.repeat(32);
const item = (label: string, category = 'Decor') => ({
  label,
  description: '',
  category,
  tags: [],
  box: { x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
});

const record = (over: Record<string, unknown> = {}) => ({
  photoSha256: sha,
  model: 'unknown',
  capturedAt: '2026-07-21T00:00:00.000Z',
  receivedAt: '2026-07-21T00:00:01.000Z',
  scene: null,
  events: [
    { type: 'accept' as const, item: item('vase') },
    { type: 'discard' as const, item: item('ghost object') },
    {
      type: 'relabel' as const,
      item: item('lamp', 'Lighting'),
      newLabel: 'brass lamp',
      newTags: ['brass'],
    },
    { type: 'add_box' as const, item: item('coaster') },
    { type: 'photo_verdict' as const, verdict: 'ok', userOverride: false },
  ],
  ...over,
});

describe('latestRecordPerPhoto', () => {
  it('keeps only the newest record for each photo', () => {
    const older = record({ receivedAt: '2026-07-20T00:00:00.000Z' });
    const newer = record({ receivedAt: '2026-07-21T09:00:00.000Z' });
    const out = latestRecordPerPhoto([older, newer]);
    expect(out).toHaveLength(1);
    expect(out[0]!.receivedAt).toBe('2026-07-21T09:00:00.000Z');
  });
});

describe('flywheelToCoco', () => {
  it('converts verified items to pixel-space COCO annotations, excluding discards', () => {
    const dims = new Map([[sha, { width: 1000, height: 800, fileName: `${sha}.jpg` }]]);
    const coco = flywheelToCoco([record()], dims);

    expect(coco.images).toEqual([{ id: 1, file_name: `${sha}.jpg`, width: 1000, height: 800 }]);
    // accept + relabel + add_box = 3; discard and photo_verdict excluded.
    expect(coco.annotations).toHaveLength(3);
    const first = coco.annotations[0]!;
    expect(first.bbox).toEqual([100, 160, 500, 200]);
    expect(first.area).toBe(500 * 200);
    expect(first.iscrowd).toBe(0);
    expect(first.attributes.label).toBe('vase');
    // Relabel carries the corrected name.
    expect(coco.annotations[1]!.attributes.label).toBe('brass lamp');
    // Categories map onto the shared enum.
    const catNames = coco.categories.map((c) => c.name);
    expect(catNames).toContain('Decor');
    expect(catNames).toContain('Lighting');
  });

  it('skips records whose photo dimensions are unknown', () => {
    const coco = flywheelToCoco([record()], new Map());
    expect(coco.images).toHaveLength(0);
    expect(coco.annotations).toHaveLength(0);
  });
});
