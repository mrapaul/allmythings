import { Agent } from 'undici';
import { logger } from '../utils/logger';
import { DetectorUnavailableError } from './vlm-client';

/**
 * Thin client for the Stage A closed-vocab proposer sidecar.
 *
 * Wire contract (PROPOSER_URL, default http://127.0.0.1:8001):
 *
 *   POST {PROPOSER_URL}/detect
 *   content-type: image/jpeg            (raw JPEG frame bytes, not multipart)
 *
 *   200 application/json:
 *   {
 *     "items": [
 *       {
 *         "label": "coffee mug",          // display label
 *         "category": "Kitchenware",      // vocab category; "" when unknown
 *         "box": { "x": 0.31, "y": 0.52, "width": 0.12, "height": 0.18 }
 *                                         // normalized to [0,1] over the frame
 *       }
 *     ]
 *   }
 *
 * There is deliberately NO confidence field: DetectedItem has none, and the
 * closed vocab is trusted a priori. Unreachable host, timeout, non-2xx, or
 * unparseable JSON all surface as DetectorUnavailableError so the surrounding
 * detector/fallback machinery sees the standard failure shape.
 */

export interface ProposerClientOptions {
  /** Base URL of the proposer sidecar, e.g. http://127.0.0.1:8001. */
  baseUrl: string;
  timeoutMs: number;
}

export interface ProposerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProposerItem {
  label: string;
  category: string;
  /** Normalized to [0,1] over the frame. */
  box: ProposerBox;
}

export class ProposerClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  /**
   * Custom dispatcher whose socket timeouts match `timeoutMs` (same undici
   * 300s-default trap as the VLM clients: a slow proposer must hit OUR
   * timeout, not undici's silent socket kill).
   */
  private readonly dispatcher: Agent;

  constructor(opts: ProposerClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs;
    this.dispatcher = new Agent({
      headersTimeout: opts.timeoutMs,
      bodyTimeout: opts.timeoutMs,
      connectTimeout: 30_000,
    });
  }

  /** POST one JPEG frame and return the proposer's closed-vocab items. */
  async detect(jpeg: Buffer): Promise<ProposerItem[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(`${this.baseUrl}/detect`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg' },
        // Buffer / Buffer-backed views are not in the DOM BodyInit types;
        // a plain Uint8Array copy is, and undici accepts it identically.
        body: new Uint8Array(jpeg),
        signal: controller.signal,
        // @ts-expect-error undici extension — not in TS DOM lib types
        dispatcher: this.dispatcher,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new DetectorUnavailableError(
          `proposer returned ${resp.status}: ${text.slice(0, 200)}`,
        );
      }
      let data: unknown;
      try {
        data = await resp.json();
      } catch {
        throw new DetectorUnavailableError('proposer returned invalid JSON');
      }
      const items = (data as Record<string, unknown> | null)?.items;
      return Array.isArray(items) ? (items as ProposerItem[]) : [];
    } catch (err: unknown) {
      if (err instanceof DetectorUnavailableError) throw err;
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `proposer request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
            ? `${err.message}${err.cause instanceof Error ? ` (cause: ${err.cause.message})` : ''}`
            : 'unknown error';
      logger.error({ err: message }, 'proposer_request_failed');
      throw new DetectorUnavailableError(message);
    } finally {
      clearTimeout(timer);
    }
  }
}
