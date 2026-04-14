import { BoundingBoxResult } from './detector.interface';
import { injectTraceHeaders } from '../telemetry/trace-context';

interface Owlv2Box {
  label: string;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Owlv2Response {
  boxes: Owlv2Box[];
  image_width: number;
  image_height: number;
}

export class Owlv2Detector {
  constructor(
    private readonly baseUrl: string,
    private readonly scoreThreshold: number = 0.15,
    private readonly timeoutMs: number = 30_000,
  ) {}

  async detect(image: Buffer): Promise<BoundingBoxResult[]> {
    const form = new FormData();
    form.append('file', new Blob([image], { type: 'image/jpeg' }), 'image.jpg');
    form.append('score_threshold', String(this.scoreThreshold));

    const headers: Record<string, string> = {};
    injectTraceHeaders(headers);

    const res = await fetch(`${this.baseUrl}/detect/owlv2`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OWLv2 returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as Owlv2Response;
    return data.boxes
      .filter((b) => b.score >= this.scoreThreshold)
      .map((b) => ({
        coarseLabel: b.label,
        confidence: b.score,
        box: { x: b.x, y: b.y, width: b.width, height: b.height },
      }));
  }
}
