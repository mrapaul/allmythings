import { Agent } from 'undici';
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
  /**
   * Ollama `think` switch for hybrid reasoning models (qwen3.5/3.6, gemma4).
   * Left on, the JSON answer lands in the `thinking` field and `response` is
   * empty — zero detections. Omit for models without thinking: Ollama
   * rejects the field on those.
   */
  think?: boolean;
  /**
   * Context window to size the runner with. Ollama's default here (32k, times
   * its parallel slots) made the scheduler predict an overflow and evict the
   * detector whenever the precheck model loaded. A right-sized window keeps
   * both resident.
   */
  numCtx?: number;
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

/**
 * A cold load of a 4-20 GB model from this disk takes 50-130 s, far longer
 * than any per-request timeout. The warm-up must wait for the load, or the
 * model never becomes resident and every real request dies mid-load.
 */
const WARM_LOAD_TIMEOUT_MS = 10 * 60 * 1000;

export class OllamaVlmClient implements VlmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly keepAlive: string;
  private readonly numPredict: number;
  private readonly temperature: number;
  private readonly retryDelayMs: number;
  private readonly think: boolean | undefined;
  private readonly numCtx: number | undefined;
  /**
   * Custom dispatcher whose socket timeouts match `timeoutMs`. Global fetch
   * uses undici defaults (headersTimeout/bodyTimeout 300s), which silently
   * kills any request whose response doesn't start within 5 min — exactly
   * what a CPU-bound vision prefill does ("fetch failed", not our AbortError).
   */
  private readonly dispatcher: Agent;

  constructor(opts: OllamaVlmClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
    this.keepAlive = opts.keepAlive ?? '5m';
    this.numPredict = opts.numPredict ?? 8192;
    this.temperature = opts.temperature ?? 0.1;
    this.retryDelayMs = opts.retryDelayMs ?? 5_000;
    this.think = opts.think;
    this.numCtx = opts.numCtx;
    this.dispatcher = new Agent({
      headersTimeout: opts.timeoutMs,
      bodyTimeout: opts.timeoutMs,
      connectTimeout: 30_000,
    });
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
        body: JSON.stringify({
          model: this.model,
          keep_alive: this.keepAlive,
          ...(this.numCtx ? { options: { num_ctx: this.numCtx } } : {}),
        }),
        signal: AbortSignal.timeout(WARM_LOAD_TIMEOUT_MS),
        // @ts-expect-error undici extension — cold loads exceed the 300s default
        dispatcher: this.dispatcher,
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
      ...(this.think === undefined ? {} : { think: this.think }),
      options: {
        temperature: this.temperature,
        num_predict: this.numPredict,
        ...(this.numCtx ? { num_ctx: this.numCtx } : {}),
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
        // @ts-expect-error undici extension — not in TS DOM lib types
        dispatcher: this.dispatcher,
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
            ? `${err.message}${err.cause instanceof Error ? ` (cause: ${err.cause.message})` : ''}`
            : 'unknown error';
      logger.error({ err: message, model: this.model }, 'ollama_vlm_request_failed');
      throw new OllamaUnavailableError(message);
    } finally {
      clearTimeout(timer);
    }
  }
}
