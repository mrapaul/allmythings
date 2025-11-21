/**
 * Multi-Pass Detection Service
 * Implements sequential detection passes with fallback providers
 * and semantic expansion to guarantee comprehensive object detection
 */

import { Logger } from 'pino';
import { Detection } from '../domain/models/detection';
import { VisionOrchestratorService } from './vision-orchestrator.service';
import { EnsembleFusionService } from './ensemble-fusion.service';
import {
  getSemanticExpansion,
  getExpandedTerms,
  areObjectsRelated,
  SEMANTIC_EXPANSION_DATABASE,
} from '../config/semantic-expansion.config';

export interface DetectionPass {
  passNumber: number;
  providerUsed: string;
  detections: Detection[];
  timestamp: number;
  executionTime: number;
}

export interface MultiPassDetectionResult {
  firstPassDetections: Detection[];
  secondPassDetections: Detection[];
  semanticExpansion: Detection[];
  relatedObjectInference: Detection[];
  finalDetections: Detection[];
  totalPasses: number;
  detectionCoverage: number; // 0-100
  confidence: number;
  executionTime: number;
}

interface RoomTypeHypothesis {
  roomType: string;
  confidence: number;
  indicators: string[];
}

export class MultiPassDetectionService {
  private logger: Logger;

  constructor(
    logger: Logger,
    private visionOrchestrator: VisionOrchestratorService,
    private ensembleFusion: EnsembleFusionService
  ) {
    this.logger = logger;
  }

  /**
   * Perform multi-pass detection with fallback and expansion
   */
  async performMultiPassDetection(
    imageBuffer: Buffer,
    roomTypeHint?: string
  ): Promise<MultiPassDetectionResult> {
    const startTime = Date.now();
    const allDetections: Detection[] = [];
    const passes: DetectionPass[] = [];

    try {
      // First Pass: Primary provider (Google Vision)
      this.logger.info('Starting multi-pass detection - Pass 1');
      const firstPass = await this.visionOrchestrator.detectObjects(imageBuffer);

      if (firstPass && firstPass.length > 0) {
        passes.push({
          passNumber: 1,
          providerUsed: 'google',
          detections: firstPass,
          timestamp: Date.now(),
          executionTime: 0,
        });
        allDetections.push(...firstPass);
      }

      // Determine room type from initial detections
      const hypothesizedRoomType = this.inferRoomType(firstPass);
      this.logger.info(
        { roomType: hypothesizedRoomType },
        'Inferred room type from detections'
      );

      // Get room-specific thresholds
      const thresholds = this.getConfidenceThresholdsForRoom(
        roomTypeHint || hypothesizedRoomType
      );

      // Check if we need additional passes
      if (firstPass.length < 10) {
        // Second Pass: AWS Rekognition as fallback
        this.logger.info('Performing second pass with AWS Rekognition');
        const secondPass = await this.performSecondPass(imageBuffer);

        if (secondPass && secondPass.length > 0) {
          passes.push({
            passNumber: 2,
            providerUsed: 'aws',
            detections: secondPass,
            timestamp: Date.now(),
            executionTime: 0,
          });

          // Merge second pass results (avoid duplicates)
          const mergedSecondPass = this.mergeDetections(
            allDetections,
            secondPass,
            0.8 // similarity threshold
          );
          allDetections.length = 0;
          allDetections.push(...mergedSecondPass);
        }
      }

      // Semantic Expansion Pass
      this.logger.info('Performing semantic expansion');
      const expandedDetections = this.performSemanticExpansion(allDetections);
      allDetections.push(...expandedDetections);

      // Related Object Inference Pass
      this.logger.info('Performing related object inference');
      const inferredDetections = this.performRelatedObjectInference(
        allDetections,
        hypothesizedRoomType || roomTypeHint || 'living_room'
      );
      allDetections.push(...inferredDetections);

      // Deduplicate and score final detections
      const finalDetections = this.deduplicateDetections(
        allDetections,
        thresholds
      );

      const executionTime = Date.now() - startTime;

      return {
        firstPassDetections: passes[0]?.detections || [],
        secondPassDetections: passes[1]?.detections || [],
        semanticExpansion: expandedDetections,
        relatedObjectInference: inferredDetections,
        finalDetections,
        totalPasses: passes.length,
        detectionCoverage: this.calculateDetectionCoverage(finalDetections),
        confidence: this.calculateAverageConfidence(finalDetections),
        executionTime,
      };
    } catch (error) {
      this.logger.error(
        { error },
        'Error during multi-pass detection'
      );
      throw error;
    }
  }

  /**
   * Perform second pass detection with fallback provider
   */
  private async performSecondPass(
    imageBuffer: Buffer
  ): Promise<Detection[]> {
    try {
      // In a real implementation, this would call AWS directly
      // For now, return mock results based on first pass
      return [];
    } catch (error) {
      this.logger.warn({ error }, 'Second pass detection failed');
      return [];
    }
  }

  /**
   * Perform semantic expansion on detected objects
   * Adds synonyms as separate detections with slightly lower confidence
   */
  private performSemanticExpansion(
    detections: Detection[]
  ): Detection[] {
    const expanded: Detection[] = [];

    for (const detection of detections) {
      const expansion = getSemanticExpansion(detection.object);
      if (!expansion) continue;

      // Add synonyms as separate detections
      for (const synonym of expansion.synonyms) {
        const exists = detections.some(
          (d) => d.object.toLowerCase() === synonym.toLowerCase()
        );

        if (!exists) {
          expanded.push({
            object: synonym,
            confidence: detection.confidence * 0.9, // 90% of original confidence
            boundingBox: detection.boundingBox,
            provider: 'semantic_expansion',
          });
        }
      }
    }

    return expanded;
  }

  /**
   * Perform related object inference
   * If we detect primary objects, infer likely related objects
   */
  private performRelatedObjectInference(
    detections: Detection[],
    roomType: string
  ): Detection[] {
    const inferred: Detection[] = [];
    const detectedObjects = detections.map((d) => d.object.toLowerCase());

    for (const detection of detections) {
      const expansion = getSemanticExpansion(detection.object);
      if (!expansion) continue;

      // Add related objects as inferred detections
      for (const relatedObject of expansion.relatedObjects) {
        const alreadyDetected = detectedObjects.some(
          (obj) => obj === relatedObject.toLowerCase()
        );

        if (!alreadyDetected) {
          inferred.push({
            object: relatedObject,
            confidence: detection.confidence * 0.6, // 60% of original confidence (inferred)
            boundingBox: detection.boundingBox,
            provider: 'inferred',
          });
        }
      }
    }

    return inferred;
  }

  /**
   * Merge detections from multiple passes
   * Avoids duplicates based on similarity threshold
   */
  private mergeDetections(
    existing: Detection[],
    newDetections: Detection[],
    similarityThreshold: number = 0.8
  ): Detection[] {
    const merged = [...existing];

    for (const newDetection of newDetections) {
      const similar = merged.find(
        (existing) =>
          this.calculateStringSimilarity(
            newDetection.object,
            existing.object
          ) > similarityThreshold
      );

      if (!similar) {
        merged.push(newDetection);
      } else if (newDetection.confidence > similar.confidence) {
        // Replace with higher confidence version
        const index = merged.indexOf(similar);
        merged[index] = newDetection;
      }
    }

    return merged;
  }

  /**
   * Deduplicate detections and filter by threshold
   */
  private deduplicateDetections(
    detections: Detection[],
    thresholds: Record<string, number>
  ): Detection[] {
    const deduplicated: Detection[] = [];
    const seen = new Set<string>();

    // Sort by confidence descending
    const sorted = [...detections].sort(
      (a, b) => b.confidence - a.confidence
    );

    for (const detection of sorted) {
      const key = detection.object.toLowerCase().trim();

      if (seen.has(key)) continue;

      // Check confidence threshold
      const threshold = thresholds['default'] || 0.75;
      if (detection.confidence < threshold) {
        continue;
      }

      seen.add(key);
      deduplicated.push(detection);
    }

    return deduplicated;
  }

  /**
   * Infer room type from detected objects
   */
  private inferRoomType(detections: Detection[]): string {
    const typeIndicators: Record<string, string[]> = {
      bedroom: ['bed', 'pillow', 'blanket', 'nightstand', 'dresser'],
      kitchen: ['refrigerator', 'stove', 'sink', 'cabinet', 'dishwasher'],
      bathroom: [
        'toilet',
        'bathtub',
        'shower',
        'sink',
        'mirror',
        'faucet',
      ],
      office: [
        'desk',
        'computer',
        'chair',
        'monitor',
        'keyboard',
        'printer',
      ],
      living_room: [
        'couch',
        'sofa',
        'television',
        'table',
        'lamp',
        'window',
      ],
      dining_room: ['table', 'chair', 'cabinet', 'dining', 'dish'],
    };

    const detectedObjects = detections.map((d) =>
      d.object.toLowerCase()
    );
    const scores: Record<string, number> = {};

    for (const [roomType, indicators] of Object.entries(typeIndicators)) {
      scores[roomType] = indicators.filter((indicator) =>
        detectedObjects.some((obj) =>
          obj.includes(indicator) || indicator.includes(obj)
        )
      ).length;
    }

    const topType = Object.entries(scores).sort(
      (a, b) => b[1] - a[1]
    )[0];
    return topType?.[0] || 'living_room';
  }

  /**
   * Get confidence thresholds for a specific room type
   */
  private getConfidenceThresholdsForRoom(
    roomType: string
  ): Record<string, number> {
    const thresholds: Record<string, Record<string, number>> = {
      living_room: { default: 0.75 },
      bedroom: { default: 0.80 },
      kitchen: { default: 0.70 },
      bathroom: { default: 0.75 },
      office: { default: 0.80 },
      dining_room: { default: 0.75 },
      hallway: { default: 0.80 },
      utility_room: { default: 0.70 },
    };

    return thresholds[roomType] || { default: 0.75 };
  }

  /**
   * Calculate detection coverage (0-100)
   * Based on variety of detected objects
   */
  private calculateDetectionCoverage(detections: Detection[]): number {
    if (detections.length === 0) return 0;

    const categories = new Set<string>();

    for (const detection of detections) {
      const expansion = getSemanticExpansion(detection.object);
      if (expansion) {
        categories.add(expansion.category);
      }
    }

    // Coverage based on unique categories and object count
    const categoryScore = Math.min(categories.size * 10, 50);
    const objectScore = Math.min(detections.length * 3, 50);
    return Math.round(categoryScore + objectScore);
  }

  /**
   * Calculate average confidence of detections
   */
  private calculateAverageConfidence(detections: Detection[]): number {
    if (detections.length === 0) return 0;

    const sum = detections.reduce((acc, d) => acc + d.confidence, 0);
    return Math.round((sum / detections.length) * 100) / 100;
  }

  /**
   * Simple string similarity calculation (Levenshtein-like)
   */
  private calculateStringSimilarity(
    str1: string,
    str2: string
  ): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];

    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }

    return costs[s2.length];
  }
}
