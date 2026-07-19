import { envConfig } from '../config/env.config';
import { OllamaVlmClient } from '../clients/ollama-vlm.client';
import { VlmDetector } from './vlm-detector';
import { QwenVisionAdapter } from './qwen-vision.adapter';
import { GroundingDinoAdapter, GroundingDinoOptions } from './grounding-dino.adapter';
import { TieredDetector } from './tiered-detector';

export type Detector = VlmDetector | QwenVisionAdapter | GroundingDinoAdapter | TieredDetector;

interface QwenAdapterOptions {
  twoPass: boolean;
  maxImageSize: number;
  coordMode: 'auto' | 'norm' | 'thousand' | 'pixel';
  confidenceThreshold: number;
  endpoint: string;
  apiKey: string;
}

interface GdOptions {
  endpoint: string;
  prompt: string;
  boxThreshold: number;
  textThreshold: number;
  maxImageSize: number;
  coordMode: 'auto' | 'norm' | 'thousand' | 'pixel';
  confidenceThreshold: number;
}

function createT1Detector(): Detector {
  if (envConfig.detector === 'tiered') {
    const gdOptions: GdOptions = {
      endpoint: envConfig.gdEndpoint,
      prompt: envConfig.gdPrompt,
      boxThreshold: envConfig.gdBoxThreshold,
      textThreshold: envConfig.gdTextThreshold,
      maxImageSize: envConfig.gdMaxImageSize,
      coordMode: envConfig.gdCoordMode,
      confidenceThreshold: envConfig.gdConfidenceThreshold,
    };
    return new GroundingDinoAdapter(gdOptions);
  }
  
  const qwenOptions: QwenAdapterOptions = {
    twoPass: envConfig.vlmTwoPass,
    maxImageSize: envConfig.vlmMaxImageSize,
    coordMode: envConfig.vlmCoordMode,
    confidenceThreshold: envConfig.confidenceThreshold,
    endpoint: envConfig.qwenVisionEndpoint,
    apiKey: envConfig.qwenVisionApiKey,
  };
  
  return new QwenVisionAdapter(qwenOptions);
}

function createT2Detector(): Detector {
  const client = new OllamaVlmClient({
    baseUrl: envConfig.ollamaBaseUrl,
    model: envConfig.ollamaModel,
    timeoutMs: envConfig.vlmTimeoutMs,
  });
  
  return new VlmDetector(client, {
    twoPass: true,
    maxImageSize: envConfig.vlmMaxImageSize,
    coordMode: envConfig.vlmCoordMode,
  });
}

/** Build the detector based on environment configuration. */
export function createDetector(): Detector {
  if (envConfig.detector === 'vlm') {
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
  
  if (envConfig.detector === 'grounding-dino') {
    const gdOptions: GdOptions = {
      endpoint: envConfig.gdEndpoint,
      prompt: envConfig.gdPrompt,
      boxThreshold: envConfig.gdBoxThreshold,
      textThreshold: envConfig.gdTextThreshold,
      maxImageSize: envConfig.gdMaxImageSize,
      coordMode: envConfig.gdCoordMode,
      confidenceThreshold: envConfig.gdConfidenceThreshold,
    };
    return new GroundingDinoAdapter(gdOptions);
  }
  
  if (envConfig.detector === 'tiered') {
    return new TieredDetector({
      t1Detector: createT1Detector(),
      t2Adapter: createT2Detector(),
    });
  }
  
  const qwenOptions: QwenAdapterOptions = {
    twoPass: envConfig.vlmTwoPass,
    maxImageSize: envConfig.vlmMaxImageSize,
    coordMode: envConfig.vlmCoordMode,
    confidenceThreshold: envConfig.confidenceThreshold,
    endpoint: envConfig.qwenVisionEndpoint,
    apiKey: envConfig.qwenVisionApiKey,
  };
  
  return new QwenVisionAdapter(qwenOptions);
}
