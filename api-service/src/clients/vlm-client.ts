/**
 * Backend-agnostic contract for a vision-language model client.
 *
 * The two-pass VlmDetector only ever needs "send prompt + image, get raw
 * JSON-ish text back", so any provider (Ollama, Gemini, ...) plugs in by
 * implementing this interface. Detection/parsing logic stays in the detector.
 */

/** Base error for any VLM backend being unreachable, rate-limited, or failing. */
export class DetectorUnavailableError extends Error {
  constructor(
    message: string,
    /** Whether a fallback/retry is worth attempting (e.g. rate limit vs bad key). */
    readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = 'DetectorUnavailableError';
  }
}

export interface VlmClient {
  readonly modelName: string;
  /**
   * Single JSON-constrained call: prompt + base64 JPEG in, raw model text out.
   * `schema` is an optional OpenAPI-style response schema for backends with
   * native structured output (Gemini); backends without it may ignore it.
   */
  generateJson(prompt: string, imageBase64: string, schema?: object): Promise<string>;
}
