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
  googleProjectId: string;
  googleCredentials: string;
  apiKey: string;
  useMockAi: boolean;
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
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
  classificationTimeoutMs: parseInt(process.env.CLASSIFICATION_TIMEOUT_MS || '300000', 10),
  classificationMinConfidence: parseFloat(process.env.CLASSIFICATION_MIN_CONFIDENCE || '0.5'),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5-vl:7b',
  ollamaEnabled: process.env.OLLAMA_ENABLED === 'true',
  googleProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  apiKey: process.env.API_KEY || '',
  useMockAi: process.env.USE_MOCK_AI === 'true',
};
