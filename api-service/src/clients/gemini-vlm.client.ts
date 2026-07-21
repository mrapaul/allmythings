import { logger } from '../utils/logger';
import { DetectorUnavailableError, type VlmClient } from './vlm-client';

/**
 * Thin client for the Gemini Developer API (free tier) via plain fetch.
 *
 * One job: send a prompt + image to `models/{model}:generateContent` with
 * structured JSON output enforced, and return the raw model text. Detection
 * and parsing logic lives in the VlmDetector, not here.
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TEMPERATURE = 0.1;

export interface GeminiVlmClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

interface GeminiPart {
  text?: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}

export class GeminiVlmClient implements VlmClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: GeminiVlmClientOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
  }

  get modelName(): string {
    return this.model;
  }

  async generateJson(prompt: string, imageBase64: string, schema?: object): Promise<string> {
    const url = `${GEMINI_BASE_URL}/models/${this.model}:generateContent`;
    const body = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: TEMPERATURE,
        responseMimeType: 'application/json',
        ...(schema ? { responseSchema: schema } : {}),
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const tag = resp.status === 429 ? 'rate_limit: ' : '';
        throw new DetectorUnavailableError(
          `Gemini ${this.model} returned ${resp.status}: ${tag}${text.slice(0, 200)}`,
        );
      }

      const data = (await resp.json()) as GeminiGenerateResponse;
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts || parts.length === 0) {
        throw new DetectorUnavailableError(`Gemini ${this.model} returned no candidates`);
      }
      return parts.map((p) => p.text ?? '').join('');
    } catch (err: unknown) {
      if (err instanceof DetectorUnavailableError) throw err;
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `Gemini request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : 'unknown error';
      logger.error({ err: message, model: this.model }, 'gemini_vlm_request_failed');
      throw new DetectorUnavailableError(message);
    } finally {
      clearTimeout(timer);
    }
  }
}
