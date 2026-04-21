export interface EnvConfig {
  port: number;
  nodeEnv: string;
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

  // Temporal
  temporalHost: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
  workflowExecutionTimeoutMs: number;
  httpResponseTimeoutMs: number;

  // Pipeline discipline
  pipelineMaxConcurrency: number;
  enrichmentBudgetMs: number;
  queueBackpressureThreshold: number;

  // Tier models (env-overrideable)
  tier1Model: string;
  tier2Model: string;
  tier3Model: string;
}

export const envConfig: EnvConfig = {
  port: parseInt(process.env.PORT || '14000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  detectionServiceUrl: process.env.DETECTION_SERVICE_URL || 'http://localhost:14001',
  detectionTimeoutMs: parseInt(process.env.DETECTION_TIMEOUT_MS || '30000', 10),
  detectionBoxThreshold: parseFloat(process.env.DETECTION_BOX_THRESHOLD || '0.2'),
  detectionTextThreshold: parseFloat(process.env.DETECTION_TEXT_THRESHOLD || '0.2'),
  detectionPrompt: process.env.DETECTION_PROMPT || 'object . item . furniture . household item . appliance . electronic . decor',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  classificationTimeoutMs: parseInt(process.env.CLASSIFICATION_TIMEOUT_MS || '300000', 10),
  classificationMinConfidence: parseFloat(process.env.CLASSIFICATION_MIN_CONFIDENCE || '0.5'),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5vl:7b',
  ollamaEnabled: process.env.OLLAMA_ENABLED !== 'false',
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
  temporalHost: process.env.TEMPORAL_HOST || 'localhost:7233',
  temporalNamespace: process.env.TEMPORAL_NAMESPACE || 'default',
  temporalTaskQueue: process.env.TEMPORAL_TASK_QUEUE || 'inventory-pipeline',
  workflowExecutionTimeoutMs: parseInt(process.env.WORKFLOW_EXECUTION_TIMEOUT_MS || '120000', 10),
  httpResponseTimeoutMs: parseInt(process.env.HTTP_RESPONSE_TIMEOUT_MS || '90000', 10),
  pipelineMaxConcurrency: parseInt(process.env.PIPELINE_MAX_CONCURRENCY || '1', 10),
  enrichmentBudgetMs: parseInt(process.env.ENRICHMENT_BUDGET_MS || '45000', 10),
  queueBackpressureThreshold: parseInt(process.env.QUEUE_BACKPRESSURE_THRESHOLD || '10', 10),
  tier1Model: process.env.TIER_1_MODEL || 'qwen2.5vl:7b',
  tier2Model: process.env.TIER_2_MODEL || 'qwen2.5vl:3b',
  tier3Model: process.env.TIER_3_MODEL || 'moondream',
};
