/**
 * Environment configuration for the API service
 */

export interface EnvConfig {
  // Server
  port: number;
  nodeEnv: string;

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
