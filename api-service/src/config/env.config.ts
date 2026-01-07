/**
 * Environment configuration for the API service
 */

export interface EnvConfig {
  // Server
  port: number;
  nodeEnv: string;

  // Database
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbSsl: boolean;
  dbPoolSize: number;

  // S3 / Storage
  s3BaseUrl: string;
  s3Bucket: string;
  s3Region: string;

  // Google Cloud Vision
  googleProjectId: string;
  googleCredentials: string;

  // Google AI (Gemini)
  geminiApiKey: string;

  // AWS Rekognition
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion: string;

  // Roboflow (YOLO models)
  roboflowApiKey: string;
  roboflowWorkspace: string;
  roboflowProject: string;
  roboflowVersion: string;

  // Replicate (Detectron2, etc.)
  replicateApiToken: string;

  // DeepSeek Vision
  deepseekApiKey: string;

  // Anthropic (Claude Vision)
  anthropicApiKey: string;

  // OpenAI (GPT-4 Vision)
  openaiApiKey: string;

  // Detection Mode: 'fast' | 'standard' | 'thorough' | 'multipass'
  detectionMode: string;

  // Local ONNX YOLO
  yoloModelPath: string;
  yoloEnabled: boolean;

  // YOLO-World (Python service)
  yoloWorldServiceUrl: string;
  yoloWorldEnabled: boolean;

  // Ollama (Local LLM)
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaEnabled: boolean;

  // Ensemble Configuration
  ensembleConfidenceThreshold: number;
  providerTimeoutMs: number;
  nmsIouThreshold: number;

  // Provider Weights
  metaWeight: number;
  googleWeight: number;
  awsWeight: number;
  tensorflowWeight: number;
  geminiWeight: number;
  ollamaWeight: number;
}

export const envConfig: EnvConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: parseInt(process.env.DB_PORT || '5432', 10),
  dbName: process.env.DB_NAME || 'visual_inventory',
  dbUser: process.env.DB_USER || 'postgres',
  dbPassword: process.env.DB_PASSWORD || 'postgres',
  dbSsl: process.env.DB_SSL === 'true',
  dbPoolSize: parseInt(process.env.DB_POOL_SIZE || '20', 10),

  // S3 / Storage
  s3BaseUrl: process.env.S3_BASE_URL || 'https://storage.example.com',
  s3Bucket: process.env.S3_BUCKET || 'inventory-photos',
  s3Region: process.env.S3_REGION || 'us-east-1',

  googleProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',

  geminiApiKey: process.env.GOOGLE_AI_API_KEY || '',

  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_REGION || 'us-east-1',

  // Roboflow (YOLO)
  roboflowApiKey: process.env.ROBOFLOW_API_KEY || '',
  roboflowWorkspace: process.env.ROBOFLOW_WORKSPACE || 'home-inventory',
  roboflowProject: process.env.ROBOFLOW_PROJECT || 'coco-object-detection',
  roboflowVersion: process.env.ROBOFLOW_VERSION || '1',

  // Replicate (Detectron2)
  replicateApiToken: process.env.REPLICATE_API_TOKEN || '',

  // DeepSeek Vision
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',

  // Anthropic (Claude Vision)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  // OpenAI (GPT-4 Vision)
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // Detection Mode: 'fast' | 'standard' | 'thorough' | 'multipass'
  detectionMode: process.env.DETECTION_MODE || 'standard',

  // Local ONNX YOLO
  yoloModelPath: process.env.YOLO_MODEL_PATH || './models/yolov8m.onnx',
  yoloEnabled: process.env.YOLO_ENABLED !== 'false',

  // YOLO-World (Python service) - Primary detection provider for home objects
  yoloWorldServiceUrl: process.env.YOLO_WORLD_SERVICE_URL || 'http://localhost:8001',
  yoloWorldEnabled: process.env.YOLO_WORLD_ENABLED !== 'false',

  // Ollama (Local LLM) - Free local vision model for detailed detection
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llava:13b',
  ollamaEnabled: process.env.OLLAMA_ENABLED !== 'false',

  ensembleConfidenceThreshold: parseFloat(
    process.env.ENSEMBLE_CONFIDENCE_THRESHOLD || '0.35'
  ),
  providerTimeoutMs: parseInt(process.env.PROVIDER_TIMEOUT_MS || '4000', 10),
  nmsIouThreshold: parseFloat(process.env.NMS_IOU_THRESHOLD || '0.5'),

  metaWeight: parseFloat(process.env.META_WEIGHT || '0.30'),
  googleWeight: parseFloat(process.env.GOOGLE_WEIGHT || '0.30'),
  awsWeight: parseFloat(process.env.AWS_WEIGHT || '0.25'),
  tensorflowWeight: parseFloat(process.env.TENSORFLOW_WEIGHT || '0.15'),
  geminiWeight: parseFloat(process.env.GEMINI_WEIGHT || '0.35'),
  ollamaWeight: parseFloat(process.env.OLLAMA_WEIGHT || '0.25'),
};
