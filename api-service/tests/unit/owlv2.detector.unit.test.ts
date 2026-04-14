import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Owlv2Detector } from '../../src/providers/owlv2.detector';

describe('Owlv2Detector', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts image as multipart and parses boxes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      boxes: [
        { label: 'sofa', score: 0.4, x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      ],
      image_width: 100, image_height: 100,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const d = new Owlv2Detector('http://localhost:14001', 0.15);
    const boxes = await d.detect(Buffer.from([0xff, 0xd8, 0xff]));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].coarseLabel).toBe('sofa');
    expect(boxes[0].box.x).toBe(0.1);
  });

  it('filters boxes below score threshold', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      boxes: [
        { label: 'sofa', score: 0.3, x: 0, y: 0, width: 1, height: 1 },
        { label: 'table', score: 0.05, x: 0, y: 0, width: 1, height: 1 },
      ],
      image_width: 100, image_height: 100,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const d = new Owlv2Detector('http://localhost:14001', 0.2);
    const boxes = await d.detect(Buffer.from([0xff, 0xd8, 0xff]));
    expect(boxes).toHaveLength(1);
  });
});
