import { envConfig } from '../config/env.config';
import { OllamaVlmClient } from '../clients/ollama-vlm.client';
import { OpenAiVlmClient } from '../clients/openai-vlm.client';
import { GeminiVlmClient } from '../clients/gemini-vlm.client';
import type { VlmClient } from '../clients/vlm-client';
import { logger } from '../utils/logger';
import { VlmDetector, type Detector, type VlmDetectorOptions } from './vlm-detector';
import { FallbackDetector } from './vlm-detector.fallback';
import { EmbeddingsService } from './embeddings.service';
import { PossessionJudge } from './possession-judge.service';

/**
 * Build the detector chain from environment configuration.
 *
 * Gemini (structured-output frontier VLM) leads when GEMINI_API_KEY is set,
 * with the Ollama-backed detector as automatic fallback; DETECTOR_PRIMARY=
 * ollama flips the order. Without a Gemini key the Ollama path runs alone.
 */
/**
 * The local engine: Ollama by default, or any OpenAI-compatible server when
 * VLM_BACKEND=openai. Everything local (detector, label client) goes through
 * here so switching engines is a .env change, never a code change.
 */
function createLocalVlmClient(): VlmClient {
  if (envConfig.vlmBackend === 'openai') {
    return new OpenAiVlmClient({
      baseUrl: envConfig.openaiBaseUrl,
      model: envConfig.openaiModel,
      apiKey: envConfig.openaiApiKey,
      timeoutMs: envConfig.vlmTimeoutMs,
    });
  }
  return new OllamaVlmClient({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.ollamaModel,
    timeoutMs: envConfig.vlmTimeoutMs,
    keepAlive: envConfig.vlmKeepAlive,
    think: envConfig.vlmThink,
    numCtx: envConfig.vlmNumCtx,
  });
}

/** Single-call VLM client for crop labeling — same backend priority as the chain. */
export function createLabelClient(): VlmClient {
  if (envConfig.geminiApiKey && envConfig.detectorPrimary === 'gemini') {
    return new GeminiVlmClient({
      apiKey: envConfig.geminiApiKey,
      model: envConfig.geminiModel,
      timeoutMs: envConfig.vlmTimeoutMs,
    });
  }
  return createLocalVlmClient();
}

/**
 * Shared embedding client for the whole process: one LRU cache means labels
 * embedded during a detection are free for the next detection and for
 * /v1/vocab/match.
 */
export function createEmbeddingsService(): EmbeddingsService {
  return new EmbeddingsService({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.embeddingModel,
    timeoutMs: envConfig.embeddingTimeoutMs,
    cacheSize: envConfig.embeddingCacheSize,
    enabled: envConfig.embeddingsEnabled,
  });
}

/**
 * Fallback inventory-ness judge, on the same Ollama model as detection (text
 * only). Reached only for items the detector model left unflagged.
 */
export function createPossessionJudge(): PossessionJudge {
  return new PossessionJudge({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.ollamaModel,
    timeoutMs: envConfig.possessionJudgeTimeoutMs,
    enabled: envConfig.possessionJudgeEnabled,
    think: envConfig.vlmThink,
  });
}

export function createVlmDetector(possessionJudge: PossessionJudge | null = null): Detector {
  const opts: VlmDetectorOptions = {
    twoPass: envConfig.vlmTwoPass,
    maxImageSize: envConfig.vlmMaxImageSize,
    coordMode: envConfig.vlmCoordMode,
  };

  const local = createLocalVlmClient();
  const ollama = new VlmDetector(local, opts, possessionJudge);

  if (!envConfig.geminiApiKey) {
    logger.info(
      { chain: [local.modelName], backend: envConfig.vlmBackend },
      'detector_chain_local_only',
    );
    return new FallbackDetector(ollama, null);
  }

  const gemini = new VlmDetector(
    new GeminiVlmClient({
      apiKey: envConfig.geminiApiKey,
      model: envConfig.geminiModel,
      timeoutMs: envConfig.vlmTimeoutMs,
    }),
    opts,
    possessionJudge,
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

/**
 * Pin the detection model resident at boot (fire-and-forget). Without this the
 * first photo of every session — and every photo after a pause longer than
 * Ollama's default 5 min keep_alive — paid a measured ~128 s reload.
 * ponytail: keep_alive resets per request, so an idle gap longer than
 * VLM_KEEP_ALIVE still reloads; add a periodic re-warm if that ever bites.
 */
export function warmDetectorModel(): void {
  if (envConfig.vlmBackend !== 'ollama') return; // other engines pin their own model
  void new OllamaVlmClient({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.ollamaModel,
    timeoutMs: envConfig.vlmTimeoutMs,
    keepAlive: envConfig.vlmKeepAlive,
    think: envConfig.vlmThink,
    numCtx: envConfig.vlmNumCtx,
  }).warm();
}
