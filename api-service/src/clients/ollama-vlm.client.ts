import { logger } from '../utils/logger';

/**
 * Thin client for a self-hosted Ollama vision model.
 *
 * One job: send a prompt + image to Ollama's native `/api/generate` endpoint
 * and return the raw model text (constrained to JSON via `format: 'json'`).
 * Detection/parsing logic lives in the VlmDetector, not here.
 */

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

export interface OllamaVlmClientOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Ollama keep_alive for the model after a request (keeps it warm). */
  keepAlive?: string;
  /** Max tokens to generate per pass. */
  numPredict?: number;
  temperature?: number;
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

export class OllamaVlmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly keepAlive: string;
  private readonly numPredict: number;
  private readonly temperature: number;

  constructor(opts: OllamaVlmClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
    this.keepAlive = opts.keepAlive ?? '5m';
    this.numPredict = opts.numPredict ?? 8192;
    this.temperature = opts.temperature ?? 0.1;
  }

  get modelName(): string {
    return this.model;
  }

  /**
   * Send a single prompt + base64 JPEG to the model and return the raw
   * JSON-constrained text response. Throws OllamaUnavailableError on
   * transport failure, timeout, or non-2xx status.
   */
  async generateJson(prompt: string, imageBase64: string): Promise<string> {
    const url = `${this.baseUrl}/api/generate`;
    const body = {
      model: this.model,
      prompt,
      images: [imageBase64],
      stream: false,
      format: 'json',
      keep_alive: this.keepAlive,
      options: {
        temperature: this.temperature,
        num_predict: this.numPredict,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new OllamaUnavailableError(
          `Ollama ${this.model} returned ${resp.status}: ${text.slice(0, 200)}`,
        );
      }

      const data = (await resp.json()) as OllamaGenerateResponse;
      if (data.error) {
        throw new OllamaUnavailableError(`Ollama error: ${data.error}`);
      }
      return data.response ?? '';
    } catch (err: unknown) {
      if (err instanceof OllamaUnavailableError) throw err;
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `Ollama request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : 'unknown error';
      logger.error({ err: message, model: this.model }, 'ollama_vlm_request_failed');
      throw new OllamaUnavailableError(message);
    } finally {
      clearTimeout(timer);
    }
  }
}
