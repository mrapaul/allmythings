export interface EnvConfig {
  port: number;
  nodeEnv: string;
  // Active detector path. 'vlm' = self-hosted two-pass VLM (Ollama) directly
  // behind /v1/detect; 'pipeline' = legacy Dagster pipeline-service sidecar.
  detector: 'vlm' | 'pipeline';
  // Which VLM backend leads the fallback chain (DETECTOR=vlm path).
  detectorPrimary: 'gemini' | 'ollama';
  detectionServiceUrl: string;
  detectionTimeoutMs: number;
  detectionBoxThreshold: number;
  detectionTextThreshold: number;
  detectionPrompt: string;
  geminiApiKey: string;
  geminiModel: string;
  classificationTimeoutMs: number;
  classificationMinConfidence: number;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaEnabled: boolean;
  /**
   * Local VLM engine behind the detector: 'ollama' (default) or 'openai' —
   * any OpenAI-compatible server (MLX-VLM, llama-server, vLLM) at
   * OPENAI_BASE_URL serving OPENAI_MODEL. The phone never sees this choice.
   */
  vlmBackend: 'ollama' | 'openai';
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey: string;
  // Two-pass VLM detector knobs (DETECTOR=vlm path).
  vlmTwoPass: boolean;
  vlmMaxImageSize: number;
  vlmTimeoutMs: number;
  /** Ollama keep_alive for the detection model; a cold load costs ~2 min. */
  vlmKeepAlive: string;
  /** VLM_THINK=false|true; unset omits the field (required for non-thinking models). */
  vlmThink: boolean | undefined;
  /** Runner context for the detector (image + long JSON fits in 16k). */
  vlmNumCtx: number;
  /** Re-warm cadence for resident models; 0 disables. Must beat the shortest keep_alive. */
  modelRewarmMs: number;
  vlmCoordMode: 'auto' | 'norm' | 'thousand' | 'pixel';
  // Text embeddings (Ollama /api/embed) — power the vocabulary-free semantic
  // layer: same-kind label matching during dedupe, and /v1/vocab/match.
  embeddingsEnabled: boolean;
  embeddingModel: string;
  embeddingTimeoutMs: number;
  embeddingCacheSize: number;
  // Fallback LLM judge for items the detector model left without is_possession.
  possessionJudgeEnabled: boolean;
  possessionJudgeTimeoutMs: number;
  owlv2Url: string;
  hybridEnabled: boolean;
  googleProjectId: string;
  googleCredentials: string;
  apiKey: string;
  useMockAi: boolean;
  claudeApiKey: string;
  claudeModel: string;
  multiPassRetryThreshold: number;
  multiPassQuadrantOverlap: number;
  florenceUrl: string;
  photoDir: string;

  // HTTP request envelope (request-side timeout in front of pipeline-service)
  httpResponseTimeoutMs: number;

  // Pipeline discipline
  pipelineMaxConcurrency: number;
  enrichmentBudgetMs: number;
  queueBackpressureThreshold: number;

  // Tier models (env-overrideable)
  tier1Model: string;
  tier2Model: string;
  tier3Model: string;

  // Pipeline-service sidecar (single path post section-10)
  pipelineUrl: string;
  pipelineLongPollTimeoutS: number;
  pipelineMaxRps: number;

  // Capture precheck (POST /v1/precheck — fast preview-frame verdict).
  // Its own small model: precheck is real-time capture guidance, so it must
  // never queue behind (or force a load of) the big detection model.
  precheckModel: string;
  precheckMaxObjects: number;
  precheckTimeoutMs: number;
  precheckMaxDimension: number;
  precheckKeepAlive: string;
  /** Runner context for the precheck (one small frame, a one-line answer). */
  precheckNumCtx: number;

}

export const envConfig: EnvConfig = {
  port: parseInt(process.env.PORT || '14000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  detector: process.env.DETECTOR === 'pipeline' ? 'pipeline' : 'vlm',
  detectorPrimary: process.env.DETECTOR_PRIMARY === 'ollama' ? 'ollama' : 'gemini',
  detectionServiceUrl: process.env.DETECTION_SERVICE_URL || 'http://localhost:14001',
  detectionTimeoutMs: parseInt(process.env.DETECTION_TIMEOUT_MS || '30000', 10),
  detectionBoxThreshold: parseFloat(process.env.DETECTION_BOX_THRESHOLD || '0.2'),
  detectionTextThreshold: parseFloat(process.env.DETECTION_TEXT_THRESHOLD || '0.2'),
  detectionPrompt: process.env.DETECTION_PROMPT || 'object . item . furniture . household item . appliance . electronic . decor',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  classificationTimeoutMs: parseInt(process.env.CLASSIFICATION_TIMEOUT_MS || '300000', 10),
  classificationMinConfidence: parseFloat(process.env.CLASSIFICATION_MIN_CONFIDENCE || '0.5'),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5vl:7b',
  ollamaEnabled: process.env.OLLAMA_ENABLED !== 'false',
  vlmBackend: process.env.VLM_BACKEND === 'openai' ? 'openai' : 'ollama',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'http://127.0.0.1:8080/v1',
  openaiModel: process.env.OPENAI_MODEL || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  vlmTwoPass: process.env.VLM_TWO_PASS !== 'false',
  vlmMaxImageSize: parseInt(process.env.VLM_MAX_IMAGE_SIZE || '1024', 10),
  // Per model call. gemma4:31b-cloud (free tier) measures 28-138s per pass on
  // the eval fixtures, so the old 120s ceiling produced spurious timeouts.
  vlmTimeoutMs: parseInt(process.env.VLM_TIMEOUT_MS || '300000', 10),
  vlmKeepAlive: process.env.VLM_KEEP_ALIVE || '1h',
  vlmNumCtx: parseInt(process.env.VLM_NUM_CTX || '16384', 10),
  modelRewarmMs: parseInt(process.env.MODEL_REWARM_MS || String(25 * 60 * 1000), 10),
  vlmThink:
    process.env.VLM_THINK === 'false' ? false : process.env.VLM_THINK === 'true' ? true : undefined,
  vlmCoordMode: (['auto', 'norm', 'thousand', 'pixel'] as const).includes(
    process.env.VLM_COORD_MODE as 'auto' | 'norm' | 'thousand' | 'pixel',
  )
    ? (process.env.VLM_COORD_MODE as 'auto' | 'norm' | 'thousand' | 'pixel')
    : 'auto',
  embeddingsEnabled: process.env.EMBEDDINGS_ENABLED !== 'false',
  embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text:v1.5',
  embeddingTimeoutMs: parseInt(process.env.EMBEDDING_TIMEOUT_MS || '10000', 10),
  embeddingCacheSize: parseInt(process.env.EMBEDDING_CACHE_SIZE || '4000', 10),
  possessionJudgeEnabled: process.env.POSSESSION_JUDGE_ENABLED !== 'false',
  possessionJudgeTimeoutMs: parseInt(process.env.POSSESSION_JUDGE_TIMEOUT_MS || '20000', 10),
  owlv2Url: process.env.OWLV2_URL || 'http://localhost:14001',
  hybridEnabled: process.env.HYBRID_ENABLED === 'true',
  googleProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  apiKey: process.env.API_KEY || '',
  useMockAi: process.env.USE_MOCK_AI === 'true',
  claudeApiKey: process.env.CLAUDE_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  multiPassRetryThreshold: parseInt(process.env.MULTI_PASS_RETRY_THRESHOLD || '15', 10),
  multiPassQuadrantOverlap: parseFloat(process.env.MULTI_PASS_QUADRANT_OVERLAP || '0.55'),
  florenceUrl: process.env.FLORENCE_URL ?? process.env.DETECTION_SERVICE_URL ?? 'http://localhost:14001',
  photoDir: (process.env.PHOTO_DIR ?? `${process.env.HOME}/allmythings-data`).replace(/^~/, process.env.HOME || ''),
  httpResponseTimeoutMs: parseInt(process.env.HTTP_RESPONSE_TIMEOUT_MS || '90000', 10),
  pipelineMaxConcurrency: parseInt(process.env.PIPELINE_MAX_CONCURRENCY || '1', 10),
  enrichmentBudgetMs: parseInt(process.env.ENRICHMENT_BUDGET_MS || '45000', 10),
  queueBackpressureThreshold: parseInt(process.env.QUEUE_BACKPRESSURE_THRESHOLD || '10', 10),
  tier1Model: process.env.TIER_1_MODEL || 'qwen2.5vl:7b',
  tier2Model: process.env.TIER_2_MODEL || 'qwen2.5vl:3b',
  tier3Model: process.env.TIER_3_MODEL || 'moondream',
  pipelineUrl: process.env.PIPELINE_URL || 'http://127.0.0.1:14101',
  pipelineLongPollTimeoutS: parseInt(process.env.PIPELINE_LONGPOLL_TIMEOUT_S || '25', 10),
  pipelineMaxRps: parseInt(process.env.PIPELINE_MAX_RPS || '5', 10),
  // Apache-2.0 (Qwen3-VL 2B/4B/8B are Apache-2.0; the qwen2.5vl:* tags carry the
  // Qwen Research License and must NOT be used in this commercial product).
  // Measured on a new frame with the model resident, 384px input:
  // 4b-instruct 3.00s and correct on all three probes; 2b-instruct 1.84s but it
  // echoes the enum ("interior|room"), so 4B is the default and 2B is the
  // faster opt-in. The old shared 30B detector measured 15.1-15.7s.
  precheckModel: process.env.PRECHECK_MODEL || 'qwen3-vl:4b-instruct',
  precheckMaxObjects: parseInt(process.env.PRECHECK_MAX_OBJECTS || '35', 10),
  // 6s leaves ~2x headroom over the measured 3.0s before failing open.
  // Resident 4B answers a new frame in ~3 s; 10 s absorbs GPU contention
  // (the detector or another Ollama client running at the same time).
  precheckTimeoutMs: parseInt(process.env.PRECHECK_TIMEOUT_MS || '10000', 10),
  precheckMaxDimension: parseInt(process.env.PRECHECK_MAX_DIMENSION || '384', 10),
  // Pin the small precheck model resident so the first shot of a session is not
  // a cold load (measured cold load: 3.1s for 4B, on top of the inference).
  // Memory note: 4B holds ~3.3GB next to the detector's ~20GB of 48GB, so
  // keeping it warm cannot evict the detection model mid-pipeline.
  precheckKeepAlive: process.env.PRECHECK_KEEP_ALIVE || '30m',
  precheckNumCtx: parseInt(process.env.PRECHECK_NUM_CTX || '4096', 10),
};
