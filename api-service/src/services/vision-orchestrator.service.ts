import { ProviderAdapter } from '../adapters/provider-adapter.interface';
import { GoogleVisionAdapter } from '../adapters/google-vision.adapter';
import { AWSRekognitionAdapter } from '../adapters/aws-rekognition.adapter';
import { MockVisionAdapter } from '../adapters/mock-vision.adapter';
import { EnsembleFusionService } from './ensemble-fusion.service';
import { Detection, ProviderResult, DetectionResponse } from '../schemas/detection.schema';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Vision orchestrator - coordinates multiple vision providers
 */
export class VisionOrchestratorService {
  private providers: Map<string, ProviderAdapter>;
  private fusionService: EnsembleFusionService;

  constructor() {
    this.providers = new Map();
    this.fusionService = new EnsembleFusionService();

    // Use mock adapter in development when no credentials are configured
    const useMockMode = envConfig.nodeEnv === 'development' &&
                       (envConfig.googleProjectId === 'your-project-id' || envConfig.googleProjectId === '');

    if (useMockMode) {
      logger.info('Using mock vision adapter for development');
      this.providers.set('mock', new MockVisionAdapter());
      return;
    }

    // Initialize real providers
    try {
      this.providers.set('google', new GoogleVisionAdapter());
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize Google Vision adapter');
    }

    try {
      if (envConfig.awsAccessKeyId) {
        this.providers.set('aws', new AWSRekognitionAdapter());
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize AWS Rekognition adapter');
    }

    // Meta and TensorFlow adapters would be added here (Phase 7)
    // this.providers.set('meta', new MetaDetectron2Adapter());
    // this.providers.set('tensorflow', new TensorFlowAdapter());

    // Fallback to mock if no providers initialized
    if (this.providers.size === 0) {
      logger.warn('No vision providers initialized, falling back to mock adapter');
      this.providers.set('mock', new MockVisionAdapter());
    }
  }

  /**
   * Detect objects using ensemble of providers
   */
  async detectObjects(imageBuffer: Buffer): Promise<DetectionResponse> {
    const startTime = Date.now();
    const providerPromises: Promise<ProviderResult>[] = [];

    // Execute all providers in parallel with timeout
    for (const [name, provider] of this.providers) {
      const promise = this.executeProviderWithTimeout(provider, imageBuffer, name);
      providerPromises.push(promise);
    }

    // Wait for all providers to complete (or timeout)
    const providerResults = await Promise.allSettled(providerPromises);

    // Extract successful results
    const successfulResults: ProviderResult[] = [];
    const providerDetections = new Map<string, Detection[]>();

    for (const result of providerResults) {
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
        if (result.value.success) {
          providerDetections.set(result.value.provider, result.value.detections);
        }
      }
    }

    // Fuse detections using ensemble techniques
    const fusedDetections = this.fusionService.fuseDetections(providerDetections);

    // Calculate metrics
    const ensembleMetrics = this.fusionService.calculateMetrics(
      fusedDetections,
      providerDetections.size
    );

    // Determine ensemble mode
    const ensembleMode = this.determineEnsembleMode(providerDetections.size);

    const processingTimeMs = Date.now() - startTime;

    return {
      success: fusedDetections.length > 0 || successfulResults.length > 0,
      ensembleMode,
      processingTimeMs,
      detections: fusedDetections,
      providerResults: successfulResults,
      ensembleMetrics,
    };
  }

  /**
   * Execute provider with timeout
   */
  private async executeProviderWithTimeout(
    provider: ProviderAdapter,
    imageBuffer: Buffer,
    providerName: string
  ): Promise<ProviderResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Provider timeout')),
          envConfig.providerTimeoutMs
        )
      );

      const detectionPromise = provider.detectObjects(imageBuffer);
      const detections = await Promise.race([detectionPromise, timeoutPromise]);

      return {
        provider: providerName as any,
        success: true,
        processingTimeMs: Date.now() - startTime,
        detections,
      };
    } catch (error) {
      logger.warn(
        { provider: providerName, error },
        'Provider failed'
      );

      return {
        provider: providerName as any,
        success: false,
        processingTimeMs: Date.now() - startTime,
        detections: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private determineEnsembleMode(providersUsed: number): string {
    if (providersUsed === 0) return 'none';
    if (providersUsed === 1) return 'single';
    if (providersUsed >= 2 && providersUsed < 4) return 'partial';
    return 'full';
  }

  /**
   * Health check for all providers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const healthResults: Record<string, boolean> = {};

    for (const [name, provider] of this.providers) {
      try {
        healthResults[name] = await provider.health();
      } catch {
        healthResults[name] = false;
      }
    }

    return healthResults;
  }
}
