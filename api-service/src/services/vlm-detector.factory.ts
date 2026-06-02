import { envConfig } from '../config/env.config';
import { OllamaVlmClient } from '../clients/ollama-vlm.client';
import { VlmDetector } from './vlm-detector';

/** Build the two-pass VLM detector from environment configuration. */
export function createVlmDetector(): VlmDetector {
  const client = new OllamaVlmClient({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.ollamaModel,
    timeoutMs: envConfig.vlmTimeoutMs,
  });
  return new VlmDetector(client, {
    twoPass: envConfig.vlmTwoPass,
    maxImageSize: envConfig.vlmMaxImageSize,
    coordMode: envConfig.vlmCoordMode,
  });
}
