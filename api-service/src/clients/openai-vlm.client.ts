import { logger } from '../utils/logger';
import { DetectorUnavailableError, type VlmClient } from './vlm-client';

/**
 * VLM client for any OpenAI-compatible chat-completions server: MLX-VLM,
 * llama-server (llama.cpp), vLLM, or a hosted API. One job: prompt + base64
 * JPEG in, raw JSON-mode text out. The engine behind the URL is nobody's
 * business but .env's — this is what makes the backend swappable.
 */

export interface OpenAiVlmClientOptions {
  /** Base URL up to and including `/v1`. */
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Optional; local servers need none. */
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  /** Pause before retrying a transient failure (timeout/5xx). */
  retryDelayMs?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string } | string;
}

const MAX_ATTEMPTS = 2;

export class OpenAiVlmClient implements VlmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly apiKey: string | undefined;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly retryDelayMs: number;

  constructor(opts: OpenAiVlmClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
    this.apiKey = opts.apiKey || undefined;
    this.temperature = opts.temperature ?? 0.1;
    this.maxTokens = opts.maxTokens ?? 8192;
    this.retryDelayMs = opts.retryDelayMs ?? 2_000;
  }

  get modelName(): string {
    return this.model;
  }

  async generateJson(prompt: string, imageBase64: string): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.generateOnce(prompt, imageBase64);
      } catch (err: unknown) {
        const transient =
          err instanceof DetectorUnavailableError && /timed out|returned 5\d\d/.test(err.message);
        if (!transient) throw err;
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) {
          logger.warn({ model: this.model, attempt }, 'openai_vlm_transient_failure_retrying');
          await new Promise((r) => setTimeout(r, this.retryDelayMs));
        }
      }
    }
    throw lastErr;
  }

  private async generateOnce(prompt: string, imageBase64: string): Promise<string> {
    const body = {
      model: this.model,
      stream: false,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    };
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new DetectorUnavailableError(
          `${this.model} returned ${resp.status}: ${text.slice(0, 200)}`,
          resp.status >= 500,
        );
      }
      const data = (await resp.json()) as ChatCompletionResponse;
      if (data.error) {
        const msg = typeof data.error === 'string' ? data.error : (data.error.message ?? 'error');
        throw new DetectorUnavailableError(`${this.model} error: ${msg}`);
      }
      return data.choices?.[0]?.message?.content ?? '';
    } catch (err: unknown) {
      if (err instanceof DetectorUnavailableError) throw err;
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `${this.model} request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : 'unknown error';
      logger.error({ err: message, model: this.model }, 'openai_vlm_request_failed');
      throw new DetectorUnavailableError(message);
    } finally {
      clearTimeout(timer);
    }
  }
}
