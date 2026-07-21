import { envConfig } from '../config/env.config';
import { OllamaVlmClient } from '../clients/ollama-vlm.client';
import { GeminiVlmClient } from '../clients/gemini-vlm.client';
import type { VlmClient } from '../clients/vlm-client';
import { logger } from '../utils/logger';
import { VlmDetector, type Detector, type VlmDetectorOptions } from './vlm-detector';
import { FallbackDetector } from './vlm-detector.fallback';

/**
 * Build the detector chain from environment configuration.
 *
 * Gemini (structured-output frontier VLM) leads when GEMINI_API_KEY is set,
 * with the Ollama-backed detector as automatic fallback; DETECTOR_PRIMARY=
 * ollama flips the order. Without a Gemini key the Ollama path runs alone.
 */
/** Single-call VLM client for crop labeling — same backend priority as the chain. */
export function createLabelClient(): VlmClient {
  if (envConfig.geminiApiKey && envConfig.detectorPrimary === 'gemini') {
    return new GeminiVlmClient({
      apiKey: envConfig.geminiApiKey,
      model: envConfig.geminiModel,
      timeoutMs: envConfig.vlmTimeoutMs,
    });
  }
  return new OllamaVlmClient({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.ollamaModel,
    timeoutMs: envConfig.vlmTimeoutMs,
  });
}

export function createVlmDetector(): Detector {
  const opts: VlmDetectorOptions = {
    twoPass: envConfig.vlmTwoPass,
    maxImageSize: envConfig.vlmMaxImageSize,
    coordMode: envConfig.vlmCoordMode,
  };

  const ollama = new VlmDetector(
    new OllamaVlmClient({
      baseUrl: envConfig.ollamaBaseUrl,
      model: envConfig.ollamaModel,
      timeoutMs: envConfig.vlmTimeoutMs,
    }),
    opts,
  );

  if (!envConfig.geminiApiKey) {
    logger.info({ chain: [envConfig.ollamaModel] }, 'detector_chain_ollama_only');
    return new FallbackDetector(ollama, null);
  }

  const gemini = new VlmDetector(
    new GeminiVlmClient({
      apiKey: envConfig.geminiApiKey,
      model: envConfig.geminiModel,
      timeoutMs: envConfig.vlmTimeoutMs,
    }),
    opts,
  );

  const geminiFirst = envConfig.detectorPrimary === 'gemini';
  const chain = geminiFirst
    ? ([envConfig.geminiModel, envConfig.ollamaModel] as const)
    : ([envConfig.ollamaModel, envConfig.geminiModel] as const);
  logger.info({ chain }, 'detector_chain_with_fallback');
  return geminiFirst
    ? new FallbackDetector(gemini, ollama)
    : new FallbackDetector(ollama, gemini);
}
