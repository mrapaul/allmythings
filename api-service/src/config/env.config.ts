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

  // AWS Rekognition
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion: string;

  // Ensemble Configuration
  ensembleConfidenceThreshold: number;
  providerTimeoutMs: number;
  nmsIouThreshold: number;

  // Provider Weights
  metaWeight: number;
  googleWeight: number;
  awsWeight: number;
  tensorflowWeight: number;
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

  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_REGION || 'us-east-1',

  ensembleConfidenceThreshold: parseFloat(
    process.env.ENSEMBLE_CONFIDENCE_THRESHOLD || '0.7'
  ),
  providerTimeoutMs: parseInt(process.env.PROVIDER_TIMEOUT_MS || '4000', 10),
  nmsIouThreshold: parseFloat(process.env.NMS_IOU_THRESHOLD || '0.5'),

  metaWeight: parseFloat(process.env.META_WEIGHT || '0.30'),
  googleWeight: parseFloat(process.env.GOOGLE_WEIGHT || '0.30'),
  awsWeight: parseFloat(process.env.AWS_WEIGHT || '0.25'),
  tensorflowWeight: parseFloat(process.env.TENSORFLOW_WEIGHT || '0.15'),
};
