import { logger } from '../utils/logger';
import { DetectorUnavailableError, type VlmClient } from './vlm-client';

/**
 * Thin client for a self-hosted Ollama vision model.
 *
 * One job: send a prompt + image to Ollama's native `/api/generate` endpoint
 * and return the raw model text (constrained to JSON via `format: 'json'`).
 * Detection/parsing logic lives in the VlmDetector, not here.
 */

export class OllamaUnavailableError extends DetectorUnavailableError {
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
  /** Pause before the single retry of a transient failure (timeout/5xx). */
  retryDelayMs?: number;
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

export class OllamaVlmClient implements VlmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly keepAlive: string;
  private readonly numPredict: number;
  private readonly temperature: number;
  private readonly retryDelayMs: number;

  constructor(opts: OllamaVlmClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
    this.keepAlive = opts.keepAlive ?? '5m';
    this.numPredict = opts.numPredict ?? 8192;
    this.temperature = opts.temperature ?? 0.1;
    this.retryDelayMs = opts.retryDelayMs ?? 5_000;
  }

  get modelName(): string {
    return this.model;
  }

  /**
   * Load the model into memory (empty prompt = Ollama's documented "just
   * load" request) and pin it for keepAlive. Fire-and-forget at boot so the
   * first photo of a session never pays the ~2 min cold load. Never throws:
   * a failed warm-up only means the first request loads the model itself.
   */
  async warm(): Promise<void> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, keep_alive: this.keepAlive }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      logger.info({ model: this.model, ok: resp.ok, keepAlive: this.keepAlive }, 'ollama_model_warmed');
    } catch (err: unknown) {
      logger.warn(
        { model: this.model, err: err instanceof Error ? err.message : String(err) },
        'ollama_model_warm_failed',
      );
    }
  }

  /**
   * Send a single prompt + base64 JPEG to the model and return the raw
   * JSON-constrained text response. Transient failures (timeout, 5xx —
   * routine on the free cloud tier under load) are retried exactly once;
   * anything else throws OllamaUnavailableError immediately.
   */
  async generateJson(prompt: string, imageBase64: string): Promise<string> {
    const MAX_ATTEMPTS = 3; // free-tier congestion regularly eats one retry
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.generateJsonOnce(prompt, imageBase64);
      } catch (err: unknown) {
        const transient =
          err instanceof OllamaUnavailableError &&
          /timed out|returned 5\d\d/.test(err.message);
        if (!transient) throw err;
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) {
          logger.warn({ model: this.model, attempt }, 'ollama_transient_failure_retrying');
          await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
        }
      }
    }
    throw lastErr;
  }

  private async generateJsonOnce(prompt: string, imageBase64: string): Promise<string> {
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
