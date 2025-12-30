# Detection Architecture Design - Improved Home Object Detection

**Author**: Claude Code (Backend Architect)
**Date**: 2025-12-06
**Status**: Design Phase
**Target**: 95%+ detection accuracy for home inventory objects

---

## Executive Summary

This document provides the complete technical architecture for improving detection accuracy from ~20% to 95%+ through:

1. **Tiered Hybrid Detection Pipeline** - YOLO for boxes → LLM for labels
2. **Multi-Pass Region Scanning** - Divide-and-conquer approach for dense scenes
3. **Advanced Provider Adapters** - Claude Vision, GPT-4o, API4AI Furniture
4. **User Feedback Loop** - Corrections database and learning pipeline
5. **Property Enrichment** - Color, material, style, brand extraction

---

## Table of Contents

- [1. Database Schema](#1-database-schema)
- [2. TypeScript Interfaces & Types](#2-typescript-interfaces--types)
- [3. Service Architecture](#3-service-architecture)
- [4. API Endpoints](#4-api-endpoints)
- [5. Integration Points](#5-integration-points)
- [6. Data Flow Diagrams](#6-data-flow-diagrams)
- [7. Configuration](#7-configuration)

---

## 1. Database Schema

### 1.1 Detection Corrections Table

**Purpose**: Store user corrections for model improvement and immediate detection enhancement.

```sql
-- Table: detection_corrections
-- Stores user feedback on incorrect/missed detections

CREATE TABLE detection_corrections (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Image Identification
  image_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash of image
  image_url TEXT,                    -- S3 URL if available
  image_width INTEGER NOT NULL,      -- Original image dimensions
  image_height INTEGER NOT NULL,

  -- Correction Type
  correction_type VARCHAR(20) NOT NULL CHECK (correction_type IN ('add', 'remove', 'modify', 'merge', 'split')),

  -- Original Detection (NULL if correction_type = 'add')
  original_detection_id VARCHAR(255),
  original_label VARCHAR(255),
  original_confidence DECIMAL(5,4),
  original_bbox_x DECIMAL(8,6) CHECK (original_bbox_x >= 0 AND original_bbox_x <= 1),
  original_bbox_y DECIMAL(8,6) CHECK (original_bbox_y >= 0 AND original_bbox_y <= 1),
  original_bbox_width DECIMAL(8,6) CHECK (original_bbox_width >= 0 AND original_bbox_width <= 1),
  original_bbox_height DECIMAL(8,6) CHECK (original_bbox_height >= 0 AND original_bbox_height <= 1),
  original_provider VARCHAR(50),     -- Which provider made the detection

  -- Corrected Detection (NULL if correction_type = 'remove')
  corrected_label VARCHAR(255),
  corrected_bbox_x DECIMAL(8,6) CHECK (corrected_bbox_x >= 0 AND corrected_bbox_x <= 1),
  corrected_bbox_y DECIMAL(8,6) CHECK (corrected_bbox_y >= 0 AND corrected_bbox_y <= 1),
  corrected_bbox_width DECIMAL(8,6) CHECK (corrected_bbox_width >= 0 AND corrected_bbox_width <= 1),
  corrected_bbox_height DECIMAL(8,6) CHECK (corrected_bbox_height >= 0 AND corrected_bbox_height <= 1),

  -- Additional Properties (JSON for flexibility)
  corrected_properties JSONB,        -- {color, material, style, brand, condition}

  -- Metadata
  device_id VARCHAR(255),            -- Anonymous device identifier
  user_id UUID,                      -- If authenticated (optional)
  model_version VARCHAR(50) NOT NULL,-- e.g., 'yolo-world-v1', 'ensemble-v2'
  session_id VARCHAR(255),           -- Detection session ID

  -- Confidence & Context
  user_confidence VARCHAR(20) CHECK (user_confidence IN ('certain', 'likely', 'unsure')),
  room_type VARCHAR(50),             -- bedroom, kitchen, living_room, etc.
  scene_complexity VARCHAR(20) CHECK (scene_complexity IN ('simple', 'moderate', 'complex', 'very_complex')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMP WITH TIME ZONE, -- When correction was applied to model

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'applied', 'rejected')),
  reviewed_by VARCHAR(255),          -- Admin who reviewed
  review_notes TEXT,

  -- Indexes for common queries
  CONSTRAINT valid_correction CHECK (
    (correction_type = 'add' AND original_label IS NULL AND corrected_label IS NOT NULL) OR
    (correction_type = 'remove' AND corrected_label IS NULL AND original_label IS NOT NULL) OR
    (correction_type IN ('modify', 'merge', 'split') AND original_label IS NOT NULL AND corrected_label IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_corrections_image_hash ON detection_corrections(image_hash);
CREATE INDEX idx_corrections_type ON detection_corrections(correction_type);
CREATE INDEX idx_corrections_status ON detection_corrections(status);
CREATE INDEX idx_corrections_created_at ON detection_corrections(created_at DESC);
CREATE INDEX idx_corrections_model_version ON detection_corrections(model_version);
CREATE INDEX idx_corrections_room_type ON detection_corrections(room_type);
CREATE INDEX idx_corrections_original_label ON detection_corrections(original_label);
CREATE INDEX idx_corrections_corrected_label ON detection_corrections(corrected_label);

-- Full-text search on labels
CREATE INDEX idx_corrections_labels_fts ON detection_corrections
  USING gin(to_tsvector('english', COALESCE(original_label, '') || ' ' || COALESCE(corrected_label, '')));
```

### 1.2 Detection Cache Table

**Purpose**: Cache detection results for identical/similar images to reduce API costs.

```sql
-- Table: detection_cache
-- Caches detection results by perceptual hash

CREATE TABLE detection_cache (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Image Identification
  image_hash VARCHAR(64) NOT NULL UNIQUE,      -- SHA-256 content hash
  perceptual_hash VARCHAR(64) NOT NULL,        -- pHash for similarity matching
  image_url TEXT,
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,
  image_size_bytes INTEGER,

  -- Detection Results (JSON)
  detections JSONB NOT NULL,                   -- Array of Detection objects
  provider_results JSONB,                      -- Individual provider results
  ensemble_metrics JSONB,                      -- Ensemble statistics

  -- Detection Metadata
  detection_mode VARCHAR(20) NOT NULL CHECK (detection_mode IN ('fast', 'standard', 'thorough', 'multi-pass')),
  providers_used TEXT[],                       -- ['yolo-world', 'claude', 'gemini']
  processing_time_ms INTEGER,
  total_objects_detected INTEGER,

  -- Quality Metrics
  image_quality_score DECIMAL(3,2),           -- 0.00 to 1.00
  confidence_avg DECIMAL(5,4),
  confidence_min DECIMAL(5,4),
  confidence_max DECIMAL(5,4),

  -- Cache Management
  hit_count INTEGER DEFAULT 0,                 -- How many times this cache was used
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,         -- TTL for cache eviction

  -- Version Control
  model_version VARCHAR(50) NOT NULL,
  cache_version INTEGER DEFAULT 1,

  -- User Corrections Applied
  has_corrections BOOLEAN DEFAULT FALSE,
  corrections_applied INTEGER DEFAULT 0,
  last_correction_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_cache_image_hash ON detection_cache(image_hash);
CREATE INDEX idx_cache_perceptual_hash ON detection_cache(perceptual_hash);
CREATE INDEX idx_cache_expires_at ON detection_cache(expires_at);
CREATE INDEX idx_cache_created_at ON detection_cache(created_at DESC);
CREATE INDEX idx_cache_model_version ON detection_cache(model_version);
CREATE INDEX idx_cache_has_corrections ON detection_cache(has_corrections);
```

### 1.3 Provider Performance Table

**Purpose**: Track provider performance for adaptive weighting and health monitoring.

```sql
-- Table: provider_performance
-- Tracks real-world accuracy and performance of each provider

CREATE TABLE provider_performance (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider Info
  provider_name VARCHAR(50) NOT NULL,          -- 'yolo-world', 'claude', 'gemini', etc.
  provider_version VARCHAR(50),

  -- Time Window
  measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hour_of_day INTEGER CHECK (hour_of_day >= 0 AND hour_of_day <= 23),

  -- Performance Metrics
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  timeout_requests INTEGER DEFAULT 0,

  -- Detection Metrics
  total_detections INTEGER DEFAULT 0,
  avg_detections_per_image DECIMAL(6,2),
  avg_confidence DECIMAL(5,4),

  -- Accuracy Metrics (from user corrections)
  total_corrections INTEGER DEFAULT 0,
  false_positives INTEGER DEFAULT 0,            -- User removed detection
  false_negatives INTEGER DEFAULT 0,            -- User added detection
  label_corrections INTEGER DEFAULT 0,          -- User modified label

  -- Calculated Accuracy
  precision_score DECIMAL(5,4),                 -- TP / (TP + FP)
  recall_score DECIMAL(5,4),                    -- TP / (TP + FN)
  f1_score DECIMAL(5,4),                        -- Harmonic mean

  -- Performance Metrics
  avg_latency_ms INTEGER,
  p50_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  p99_latency_ms INTEGER,

  -- Cost Metrics
  estimated_cost_usd DECIMAL(10,4),            -- API costs for this period

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Unique constraint: one row per provider per day per hour
  CONSTRAINT unique_provider_measurement UNIQUE (provider_name, measurement_date, hour_of_day)
);

-- Indexes
CREATE INDEX idx_performance_provider ON provider_performance(provider_name);
CREATE INDEX idx_performance_date ON provider_performance(measurement_date DESC);
CREATE INDEX idx_performance_f1 ON provider_performance(f1_score DESC);
```

---

## 2. TypeScript Interfaces & Types

### 2.1 Core Detection Types (Extensions)

```typescript
/**
 * Detection modes for tiered processing
 */
export enum DetectionMode {
  FAST = 'fast',                    // YOLO only (<500ms)
  STANDARD = 'standard',            // YOLO + 1 LLM (<2s)
  THOROUGH = 'thorough',            // YOLO + multi-LLM + region scanning (<10s)
  MULTI_PASS = 'multi-pass',        // Full region scanning with overlap (<15s)
}

/**
 * Region definition for multi-pass scanning
 */
export interface ImageRegion {
  name: string;                     // 'top-left', 'center', 'full', etc.
  cropBox: BoundingBox;             // Normalized coordinates
  overlapRegions: string[];         // Names of overlapping regions for de-duplication
}

/**
 * Region scan result
 */
export interface RegionScanResult {
  region: ImageRegion;
  detections: Detection[];
  processingTimeMs: number;
  provider: string;
  croppedImageSize: {
    width: number;
    height: number;
  };
}

/**
 * Hybrid detection result (Box-first, Label-second)
 */
export interface HybridDetectionResult {
  boundingBox: BoundingBox;         // From YOLO
  yoloLabel: string;                // Initial YOLO label
  yoloConfidence: number;

  llmLabel: string;                 // Refined LLM label
  llmConfidence: number;
  llmProperties: ObjectProperties;

  finalLabel: string;               // Merged label
  finalConfidence: number;

  croppedImageBuffer?: Buffer;      // Crop sent to LLM (for debugging)
}

/**
 * Object properties from LLM analysis
 */
export interface ObjectProperties {
  color?: string;                   // 'navy blue', 'walnut brown'
  material?: string;                // 'leather', 'wood', 'fabric'
  style?: string;                   // 'modern', 'vintage', 'industrial'
  condition?: string;               // 'new', 'good', 'worn'
  brand?: string;                   // 'IKEA', 'West Elm', 'CB2'
  era?: string;                     // '1950s', 'contemporary', 'antique'
  texture?: string;                 // 'smooth', 'textured', 'glossy'
  pattern?: string;                 // 'striped', 'floral', 'solid'
  estimatedValue?: {
    min: number;
    max: number;
    currency: string;
  };
}

/**
 * Extended Detection with properties
 */
export interface EnrichedDetection extends Detection {
  properties?: ObjectProperties;
  regionSource?: string;            // Which region this came from (multi-pass)
  hybridSource?: 'yolo' | 'llm' | 'hybrid';
  imageQuality?: {
    blurScore: number;
    brightnessScore: number;
    visibilityScore: number;         // How clearly visible the object is
  };
}
```

### 2.2 Correction Types

```typescript
/**
 * Correction type enum
 */
export enum CorrectionType {
  ADD = 'add',                      // User added missed detection
  REMOVE = 'remove',                // User removed false positive
  MODIFY = 'modify',                // User changed label or bbox
  MERGE = 'merge',                  // User merged multiple detections
  SPLIT = 'split',                  // User split one detection into multiple
}

/**
 * User confidence level
 */
export enum UserConfidence {
  CERTAIN = 'certain',              // User is 100% sure
  LIKELY = 'likely',                // User is pretty sure (80%+)
  UNSURE = 'unsure',                // User is guessing (<80%)
}

/**
 * Correction status
 */
export enum CorrectionStatus {
  PENDING = 'pending',              // Not yet reviewed
  REVIEWED = 'reviewed',            // Admin reviewed, not yet applied
  APPLIED = 'applied',              // Applied to model/cache
  REJECTED = 'rejected',            // Admin rejected (spam/incorrect)
}

/**
 * Detection correction record
 */
export interface DetectionCorrection {
  id: string;

  // Image identification
  imageHash: string;
  imageUrl?: string;
  imageDimensions: {
    width: number;
    height: number;
  };

  // Correction details
  correctionType: CorrectionType;

  // Original detection (null if type = 'add')
  originalDetection?: {
    id: string;
    label: string;
    confidence: number;
    boundingBox: BoundingBox;
    provider: string;
  };

  // Corrected detection (null if type = 'remove')
  correctedDetection?: {
    label: string;
    boundingBox: BoundingBox;
    properties?: ObjectProperties;
  };

  // Metadata
  deviceId?: string;
  userId?: string;
  modelVersion: string;
  sessionId?: string;

  // Context
  userConfidence: UserConfidence;
  roomType?: string;
  sceneComplexity?: 'simple' | 'moderate' | 'complex' | 'very_complex';

  // Status
  status: CorrectionStatus;
  reviewedBy?: string;
  reviewNotes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  appliedAt?: Date;
}

/**
 * Correction submission request
 */
export interface SubmitCorrectionRequest {
  correctionType: CorrectionType;
  imageHash: string;
  imageDimensions: { width: number; height: number };
  originalDetection?: {
    id: string;
    label: string;
    confidence: number;
    boundingBox: BoundingBox;
  };
  correctedDetection?: {
    label: string;
    boundingBox: BoundingBox;
    properties?: Partial<ObjectProperties>;
  };
  userConfidence: UserConfidence;
  roomType?: string;
  deviceId?: string;
  sessionId?: string;
}

/**
 * Correction statistics
 */
export interface CorrectionStatistics {
  totalCorrections: number;
  uniqueImages: number;
  correctionsByType: Record<CorrectionType, number>;
  topMisclassifications: Array<{
    from: string;
    to: string;
    count: number;
    avgOriginalConfidence: number;
  }>;
  providerAccuracy: Array<{
    provider: string;
    totalDetections: number;
    falsePositives: number;
    falseNegatives: number;
    labelErrors: number;
    precision: number;
    recall: number;
    f1Score: number;
  }>;
  timeSeriesData: Array<{
    date: string;
    corrections: number;
    applied: number;
    pending: number;
  }>;
  estimatedAccuracyImprovement: number; // Percentage
}
```

### 2.3 Service Request/Response Types

```typescript
/**
 * Detection request with mode
 */
export interface DetectionRequest {
  imageBuffer: Buffer;
  mode?: DetectionMode;
  minConfidence?: number;
  roomType?: string;                // Helps LLM context
  enableCache?: boolean;
  enableCorrections?: boolean;      // Apply known corrections
  sessionId?: string;
}

/**
 * Enhanced detection response
 */
export interface EnhancedDetectionResponse extends DetectionResponse {
  mode: DetectionMode;
  cacheHit: boolean;
  correctionsApplied: number;
  regionScans?: RegionScanResult[];
  hybridDetails?: {
    yoloBoxCount: number;
    llmEnrichmentCount: number;
    hybridMergeCount: number;
  };
  recommendations?: {
    suggestedMode?: DetectionMode;
    qualityIssues?: string[];
    performanceNotes?: string[];
  };
}

/**
 * Region scanning configuration
 */
export interface RegionScanConfig {
  enabled: boolean;
  regions: ImageRegion[];
  overlapPercentage: number;        // 0.0 to 1.0 (default 0.1 = 10% overlap)
  minRegionSize: number;            // Minimum pixels (e.g., 200x200)
  parallelScans: boolean;           // Scan regions in parallel
  provider: string;                 // Which provider to use for region scans
}

/**
 * Hybrid detection configuration
 */
export interface HybridDetectionConfig {
  enabled: boolean;
  boxProvider: string;              // 'yolo-world', 'onnx-yolo'
  labelProviders: string[];         // ['claude', 'gemini', 'gpt4o']
  minYoloConfidence: number;        // Only enrich boxes above this
  cropPadding: number;              // Padding around bbox (0.0 to 0.5)
  includeContext: boolean;          // Include surrounding context in crop
}
```

---

## 3. Service Architecture

### 3.1 RegionScannerService

**Purpose**: Implements multi-pass region scanning for dense scenes.

**File**: `/Users/mrarindampaul/Develop/allmythings/api-service/src/services/region-scanner.service.ts`

```typescript
import sharp from 'sharp';
import { ProviderAdapter } from '../adapters/provider-adapter.interface';
import { Detection, BoundingBox } from '../schemas/detection.schema';
import { logger } from '../utils/logger';
import { calculateIoU } from '../utils/iou-calculator';

export interface ImageRegion {
  name: string;
  cropBox: BoundingBox;
  overlapRegions: string[];
}

export interface RegionScanResult {
  region: ImageRegion;
  detections: Detection[];
  processingTimeMs: number;
  provider: string;
  croppedImageSize: { width: number; height: number };
}

export interface RegionScanConfig {
  enabled: boolean;
  regions: ImageRegion[];
  overlapPercentage: number;
  minRegionSize: number;
  parallelScans: boolean;
  provider: string;
}

/**
 * RegionScannerService
 *
 * Divides images into overlapping regions and scans each independently.
 * Merges results with de-duplication for objects in overlap zones.
 */
export class RegionScannerService {
  private readonly DEFAULT_REGIONS: ImageRegion[] = [
    {
      name: 'top-left',
      cropBox: { x: 0, y: 0, width: 0.55, height: 0.55 },
      overlapRegions: ['top-right', 'bottom-left', 'center'],
    },
    {
      name: 'top-right',
      cropBox: { x: 0.45, y: 0, width: 0.55, height: 0.55 },
      overlapRegions: ['top-left', 'bottom-right', 'center'],
    },
    {
      name: 'bottom-left',
      cropBox: { x: 0, y: 0.45, width: 0.55, height: 0.55 },
      overlapRegions: ['top-left', 'bottom-right', 'center'],
    },
    {
      name: 'bottom-right',
      cropBox: { x: 0.45, y: 0.45, width: 0.55, height: 0.55 },
      overlapRegions: ['top-right', 'bottom-left', 'center'],
    },
    {
      name: 'center',
      cropBox: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
      overlapRegions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    },
  ];

  constructor(
    private readonly config: RegionScanConfig,
    private readonly providerAdapter: ProviderAdapter
  ) {}

  /**
   * Scan image in multiple overlapping regions
   */
  async scanRegions(imageBuffer: Buffer): Promise<RegionScanResult[]> {
    const startTime = Date.now();
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width!;
    const imageHeight = metadata.height!;

    logger.info(
      { width: imageWidth, height: imageHeight, regions: this.config.regions.length },
      'Starting region scan'
    );

    // Filter regions by minimum size
    const validRegions = this.config.regions.filter((region) => {
      const pixelWidth = region.cropBox.width * imageWidth;
      const pixelHeight = region.cropBox.height * imageHeight;
      return pixelWidth >= this.config.minRegionSize && pixelHeight >= this.config.minRegionSize;
    });

    // Scan regions (parallel or sequential based on config)
    const scanPromises = validRegions.map((region) =>
      this.scanRegion(imageBuffer, region, imageWidth, imageHeight)
    );

    const results = this.config.parallelScans
      ? await Promise.all(scanPromises)
      : await this.scanSequentially(scanPromises);

    logger.info(
      {
        totalRegions: results.length,
        totalDetections: results.reduce((sum, r) => sum + r.detections.length, 0),
        processingTimeMs: Date.now() - startTime,
      },
      'Region scan complete'
    );

    return results;
  }

  /**
   * Scan a single region
   */
  private async scanRegion(
    imageBuffer: Buffer,
    region: ImageRegion,
    imageWidth: number,
    imageHeight: number
  ): Promise<RegionScanResult> {
    const startTime = Date.now();

    // Calculate pixel coordinates
    const left = Math.floor(region.cropBox.x * imageWidth);
    const top = Math.floor(region.cropBox.y * imageHeight);
    const width = Math.floor(region.cropBox.width * imageWidth);
    const height = Math.floor(region.cropBox.height * imageHeight);

    // Crop region
    const croppedBuffer = await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .toBuffer();

    logger.debug(
      { region: region.name, left, top, width, height },
      'Scanning region'
    );

    // Detect objects in cropped region
    const detections = await this.providerAdapter.detectObjects(croppedBuffer);

    // Transform bounding boxes back to full image coordinates
    const transformedDetections = detections.map((detection) => ({
      ...detection,
      boundingBox: this.transformBoundingBox(
        detection.boundingBox,
        region.cropBox,
        imageWidth,
        imageHeight
      ),
      // Add region metadata
      regionSource: region.name,
    }));

    return {
      region,
      detections: transformedDetections,
      processingTimeMs: Date.now() - startTime,
      provider: this.providerAdapter.getName(),
      croppedImageSize: { width, height },
    };
  }

  /**
   * Transform bounding box from region coordinates to full image coordinates
   */
  private transformBoundingBox(
    bbox: BoundingBox,
    regionBox: BoundingBox,
    imageWidth: number,
    imageHeight: number
  ): BoundingBox {
    // Convert region-relative coordinates to full image coordinates
    return {
      x: regionBox.x + bbox.x * regionBox.width,
      y: regionBox.y + bbox.y * regionBox.height,
      width: bbox.width * regionBox.width,
      height: bbox.height * regionBox.height,
    };
  }

  /**
   * Merge detections from all regions with de-duplication
   */
  mergeRegionDetections(
    regionResults: RegionScanResult[],
    iouThreshold: number = 0.5
  ): Detection[] {
    const allDetections: Detection[] = [];
    for (const result of regionResults) {
      allDetections.push(...result.detections);
    }

    if (allDetections.length === 0) {
      return [];
    }

    // De-duplicate using NMS across all regions
    const merged = this.deduplicateDetections(allDetections, iouThreshold);

    logger.info(
      {
        beforeMerge: allDetections.length,
        afterMerge: merged.length,
        duplicatesRemoved: allDetections.length - merged.length,
      },
      'Region detections merged'
    );

    return merged;
  }

  /**
   * De-duplicate detections using Non-Maximum Suppression
   */
  private deduplicateDetections(detections: Detection[], iouThreshold: number): Detection[] {
    // Sort by confidence (highest first)
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const kept: Detection[] = [];

    for (const detection of sorted) {
      let suppress = false;

      // Check if this detection overlaps significantly with any kept detection
      for (const keptDetection of kept) {
        const iou = calculateIoU(detection.boundingBox, keptDetection.boundingBox);

        // If high overlap and same/similar label, suppress
        if (iou >= iouThreshold && this.areSimilarLabels(detection.label, keptDetection.label)) {
          suppress = true;
          break;
        }
      }

      if (!suppress) {
        kept.push(detection);
      }
    }

    return kept;
  }

  /**
   * Check if two labels are semantically similar
   */
  private areSimilarLabels(label1: string, label2: string): boolean {
    const normalized1 = label1.toLowerCase().trim();
    const normalized2 = label2.toLowerCase().trim();

    // Exact match
    if (normalized1 === normalized2) return true;

    // One contains the other (e.g., "chair" and "dining chair")
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;

    // TODO: Use semantic similarity from label-synonyms utility
    return false;
  }

  /**
   * Sequential scanning (for rate-limited providers)
   */
  private async scanSequentially(
    promises: Promise<RegionScanResult>[]
  ): Promise<RegionScanResult[]> {
    const results: RegionScanResult[] = [];
    for (const promise of promises) {
      results.push(await promise);
    }
    return results;
  }

  /**
   * Get default region configuration
   */
  static getDefaultRegions(): ImageRegion[] {
    return new RegionScannerService(
      { enabled: true, regions: [], overlapPercentage: 0.1, minRegionSize: 200, parallelScans: true, provider: '' },
      {} as ProviderAdapter
    ).DEFAULT_REGIONS;
  }
}
```

### 3.2 HybridDetectionService

**Purpose**: Box-first (YOLO), label-second (LLM) pipeline for accurate bounding boxes with rich labels.

**File**: `/Users/mrarindampaul/Develop/allmythings/api-service/src/services/hybrid-detection.service.ts`

```typescript
import sharp from 'sharp';
import { ProviderAdapter } from '../adapters/provider-adapter.interface';
import { Detection, BoundingBox } from '../schemas/detection.schema';
import { logger } from '../utils/logger';

export interface HybridDetectionConfig {
  enabled: boolean;
  boxProvider: string;
  labelProviders: string[];
  minYoloConfidence: number;
  cropPadding: number;
  includeContext: boolean;
}

export interface HybridDetectionResult {
  boundingBox: BoundingBox;
  yoloLabel: string;
  yoloConfidence: number;
  llmLabel: string;
  llmConfidence: number;
  llmProperties: ObjectProperties;
  finalLabel: string;
  finalConfidence: number;
  croppedImageBuffer?: Buffer;
}

export interface ObjectProperties {
  color?: string;
  material?: string;
  style?: string;
  condition?: string;
  brand?: string;
  era?: string;
  texture?: string;
  pattern?: string;
}

/**
 * HybridDetectionService
 *
 * Two-stage detection pipeline:
 * 1. YOLO for fast, accurate bounding boxes
 * 2. LLM for detailed classification and property extraction
 */
export class HybridDetectionService {
  constructor(
    private readonly config: HybridDetectionConfig,
    private readonly yoloAdapter: ProviderAdapter,
    private readonly llmAdapter: ProviderAdapter
  ) {}

  /**
   * Run hybrid detection pipeline
   */
  async detect(imageBuffer: Buffer): Promise<HybridDetectionResult[]> {
    const startTime = Date.now();

    // Stage 1: Get bounding boxes from YOLO
    logger.info('Stage 1: Running YOLO for bounding boxes');
    const yoloDetections = await this.yoloAdapter.detectObjects(imageBuffer);

    // Filter by confidence
    const highConfidenceBoxes = yoloDetections.filter(
      (d) => d.confidence >= this.config.minYoloConfidence
    );

    logger.info(
      {
        totalBoxes: yoloDetections.length,
        highConfidence: highConfidenceBoxes.length,
        threshold: this.config.minYoloConfidence,
      },
      'YOLO detection complete'
    );

    if (highConfidenceBoxes.length === 0) {
      logger.warn('No high-confidence YOLO boxes found');
      return [];
    }

    // Stage 2: Enrich each box with LLM classification
    logger.info({ boxCount: highConfidenceBoxes.length }, 'Stage 2: LLM enrichment');
    const enrichedResults = await this.enrichWithLLM(imageBuffer, highConfidenceBoxes);

    logger.info(
      {
        totalBoxes: highConfidenceBoxes.length,
        enriched: enrichedResults.length,
        processingTimeMs: Date.now() - startTime,
      },
      'Hybrid detection complete'
    );

    return enrichedResults;
  }

  /**
   * Enrich YOLO boxes with LLM labels and properties
   */
  private async enrichWithLLM(
    imageBuffer: Buffer,
    yoloDetections: Detection[]
  ): Promise<HybridDetectionResult[]> {
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width!;
    const imageHeight = metadata.height!;

    const enrichmentPromises = yoloDetections.map((detection) =>
      this.enrichSingleBox(imageBuffer, detection, imageWidth, imageHeight)
    );

    const results = await Promise.allSettled(enrichmentPromises);

    return results
      .filter((r): r is PromiseFulfilledResult<HybridDetectionResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /**
   * Enrich a single bounding box with LLM
   */
  private async enrichSingleBox(
    imageBuffer: Buffer,
    yoloDetection: Detection,
    imageWidth: number,
    imageHeight: number
  ): Promise<HybridDetectionResult> {
    // Calculate pixel coordinates with padding
    const padding = this.config.cropPadding;
    const bbox = yoloDetection.boundingBox;

    const left = Math.max(0, Math.floor((bbox.x - padding) * imageWidth));
    const top = Math.max(0, Math.floor((bbox.y - padding) * imageHeight));
    const width = Math.min(
      imageWidth - left,
      Math.floor((bbox.width + 2 * padding) * imageWidth)
    );
    const height = Math.min(
      imageHeight - top,
      Math.floor((bbox.height + 2 * padding) * imageHeight)
    );

    // Crop the region
    const croppedBuffer = await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .toBuffer();

    // Send to LLM for classification
    // Note: LLM adapter should have specialized single-object classification prompt
    const llmDetections = await this.llmAdapter.detectObjects(croppedBuffer);

    // Take the highest confidence LLM detection
    const llmDetection = llmDetections.length > 0
      ? llmDetections.sort((a, b) => b.confidence - a.confidence)[0]
      : null;

    // Merge YOLO box with LLM label
    const finalLabel = llmDetection?.label || yoloDetection.label;
    const finalConfidence = llmDetection
      ? (yoloDetection.confidence * 0.4 + llmDetection.confidence * 0.6)
      : yoloDetection.confidence;

    return {
      boundingBox: yoloDetection.boundingBox,
      yoloLabel: yoloDetection.label,
      yoloConfidence: yoloDetection.confidence,
      llmLabel: llmDetection?.label || 'unknown',
      llmConfidence: llmDetection?.confidence || 0,
      llmProperties: this.extractProperties(llmDetection),
      finalLabel,
      finalConfidence,
      croppedImageBuffer: croppedBuffer, // Optional: for debugging
    };
  }

  /**
   * Extract properties from LLM detection
   */
  private extractProperties(detection: Detection | null): ObjectProperties {
    if (!detection || !detection.alternativeLabels) {
      return {};
    }

    const properties: ObjectProperties = {};

    // Parse alternativeLabels for properties
    for (const alt of detection.alternativeLabels) {
      if (alt.label.startsWith('Color: ')) {
        properties.color = alt.label.replace('Color: ', '');
      } else if (alt.label.startsWith('Material: ')) {
        properties.material = alt.label.replace('Material: ', '');
      } else if (alt.label.startsWith('Style: ')) {
        properties.style = alt.label.replace('Style: ', '');
      } else if (alt.label.startsWith('Condition: ')) {
        properties.condition = alt.label.replace('Condition: ', '');
      }
    }

    return properties;
  }

  /**
   * Convert hybrid results to standard Detection format
   */
  convertToDetections(results: HybridDetectionResult[]): Detection[] {
    return results.map((result, index) => ({
      id: `hybrid-${Date.now()}-${index}`,
      label: result.finalLabel,
      confidence: result.finalConfidence,
      boundingBox: result.boundingBox,
      ensembleDetails: {
        providerAgreement: 2, // YOLO + LLM
        confidenceByProvider: {
          yolo: result.yoloConfidence,
          llm: result.llmConfidence,
        },
        labelConsensus: 'hybrid',
      },
      alternativeLabels: [
        {
          label: `YOLO: ${result.yoloLabel}`,
          confidence: result.yoloConfidence,
          provider: 'yolo-world' as any,
        },
        {
          label: `LLM: ${result.llmLabel}`,
          confidence: result.llmConfidence,
          provider: 'claude' as any,
        },
        ...this.propertiesToAlternativeLabels(result.llmProperties),
      ],
    }));
  }

  /**
   * Convert properties to alternativeLabels format
   */
  private propertiesToAlternativeLabels(
    properties: ObjectProperties
  ): Array<{ label: string; confidence: number; provider: any }> {
    const labels: Array<{ label: string; confidence: number; provider: any }> = [];

    if (properties.color) {
      labels.push({ label: `Color: ${properties.color}`, confidence: 0.9, provider: 'claude' as any });
    }
    if (properties.material) {
      labels.push({ label: `Material: ${properties.material}`, confidence: 0.85, provider: 'claude' as any });
    }
    if (properties.style) {
      labels.push({ label: `Style: ${properties.style}`, confidence: 0.8, provider: 'claude' as any });
    }
    if (properties.condition) {
      labels.push({ label: `Condition: ${properties.condition}`, confidence: 0.75, provider: 'claude' as any });
    }

    return labels;
  }
}
```

### 3.3 CorrectionsLearningService

**Purpose**: Apply user corrections to improve detection results in real-time.

**File**: `/Users/mrarindampaul/Develop/allmythings/api-service/src/services/corrections-learning.service.ts`

```typescript
import { Detection, BoundingBox } from '../schemas/detection.schema';
import { DetectionCorrection, CorrectionType } from '../types/corrections.types';
import { CorrectionsService } from './corrections.service';
import { calculateIoU } from '../utils/iou-calculator';
import { logger } from '../utils/logger';

export interface CorrectionApplicationResult {
  originalCount: number;
  afterCorrections: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  correctionsApplied: number;
}

/**
 * CorrectionsLearningService
 *
 * Applies user corrections to detection results in real-time.
 * This provides immediate accuracy improvement before model retraining.
 */
export class CorrectionsLearningService {
  constructor(private readonly correctionsService: CorrectionsService) {}

  /**
   * Apply corrections to detection results
   */
  applyCorrections(
    imageHash: string,
    detections: Detection[]
  ): { detections: Detection[]; stats: CorrectionApplicationResult } {
    const corrections = this.correctionsService.getCorrectionsForImage(imageHash);

    if (corrections.length === 0) {
      return {
        detections,
        stats: {
          originalCount: detections.length,
          afterCorrections: detections.length,
          addedCount: 0,
          removedCount: 0,
          modifiedCount: 0,
          correctionsApplied: 0,
        },
      };
    }

    logger.info(
      { imageHash, correctionsCount: corrections.length, detectionsCount: detections.length },
      'Applying corrections'
    );

    let modified = [...detections];
    let addedCount = 0;
    let removedCount = 0;
    let modifiedCount = 0;

    // Apply each correction
    for (const correction of corrections) {
      switch (correction.correctionType) {
        case CorrectionType.ADD:
          modified = this.applyAddCorrection(modified, correction);
          addedCount++;
          break;
        case CorrectionType.REMOVE:
          modified = this.applyRemoveCorrection(modified, correction);
          removedCount++;
          break;
        case CorrectionType.MODIFY:
          modified = this.applyModifyCorrection(modified, correction);
          modifiedCount++;
          break;
        case CorrectionType.MERGE:
          modified = this.applyMergeCorrection(modified, correction);
          modifiedCount++;
          break;
        case CorrectionType.SPLIT:
          modified = this.applySplitCorrection(modified, correction);
          addedCount++;
          break;
      }
    }

    return {
      detections: modified,
      stats: {
        originalCount: detections.length,
        afterCorrections: modified.length,
        addedCount,
        removedCount,
        modifiedCount,
        correctionsApplied: corrections.length,
      },
    };
  }

  /**
   * Add a missing detection
   */
  private applyAddCorrection(
    detections: Detection[],
    correction: DetectionCorrection
  ): Detection[] {
    if (!correction.correctedDetection) {
      logger.warn({ correctionId: correction.id }, 'ADD correction missing correctedDetection');
      return detections;
    }

    const newDetection: Detection = {
      id: `correction-add-${correction.id}`,
      label: correction.correctedDetection.label,
      confidence: 0.95, // High confidence for user-added
      boundingBox: correction.correctedDetection.boundingBox,
      ensembleDetails: {
        providerAgreement: 1,
        confidenceByProvider: { user: 0.95 },
        labelConsensus: 'user-correction',
      },
      alternativeLabels: [],
    };

    return [...detections, newDetection];
  }

  /**
   * Remove a false positive detection
   */
  private applyRemoveCorrection(
    detections: Detection[],
    correction: DetectionCorrection
  ): Detection[] {
    if (!correction.originalDetection) {
      logger.warn({ correctionId: correction.id }, 'REMOVE correction missing originalDetection');
      return detections;
    }

    // Find matching detection by IoU
    const matchIndex = detections.findIndex((d) =>
      this.matchesOriginalDetection(d, correction.originalDetection!)
    );

    if (matchIndex === -1) {
      logger.warn({ correctionId: correction.id }, 'Could not find detection to remove');
      return detections;
    }

    // Remove the detection
    return detections.filter((_, i) => i !== matchIndex);
  }

  /**
   * Modify an existing detection (label or bbox)
   */
  private applyModifyCorrection(
    detections: Detection[],
    correction: DetectionCorrection
  ): Detection[] {
    if (!correction.originalDetection || !correction.correctedDetection) {
      logger.warn({ correctionId: correction.id }, 'MODIFY correction missing data');
      return detections;
    }

    const matchIndex = detections.findIndex((d) =>
      this.matchesOriginalDetection(d, correction.originalDetection!)
    );

    if (matchIndex === -1) {
      logger.warn({ correctionId: correction.id }, 'Could not find detection to modify');
      return detections;
    }

    // Update the detection
    const modified = [...detections];
    modified[matchIndex] = {
      ...modified[matchIndex],
      label: correction.correctedDetection.label,
      boundingBox: correction.correctedDetection.boundingBox,
      confidence: 0.95, // High confidence for user-corrected
    };

    return modified;
  }

  /**
   * Merge multiple detections into one
   */
  private applyMergeCorrection(
    detections: Detection[],
    correction: DetectionCorrection
  ): Detection[] {
    // TODO: Implement merge logic (requires multiple original detections)
    logger.warn('MERGE correction not yet implemented');
    return detections;
  }

  /**
   * Split one detection into multiple
   */
  private applySplitCorrection(
    detections: Detection[],
    correction: DetectionCorrection
  ): Detection[] {
    // TODO: Implement split logic (requires multiple corrected detections)
    logger.warn('SPLIT correction not yet implemented');
    return detections;
  }

  /**
   * Check if a detection matches the original detection from a correction
   */
  private matchesOriginalDetection(
    detection: Detection,
    originalDetection: DetectionCorrection['originalDetection']
  ): boolean {
    if (!originalDetection) return false;

    // Match by ID if available
    if (detection.id === originalDetection.id) return true;

    // Match by IoU and label similarity
    const iou = calculateIoU(detection.boundingBox, originalDetection.boundingBox);
    const labelMatch = detection.label.toLowerCase() === originalDetection.label.toLowerCase();

    return iou >= 0.7 && labelMatch;
  }

  /**
   * Get learning statistics
   */
  async getLearningStats(): Promise<{
    totalCorrections: number;
    appliedToCache: number;
    avgImprovementPerImage: number;
  }> {
    const stats = this.correctionsService.getStats();

    return {
      totalCorrections: stats.totalCorrections,
      appliedToCache: 0, // TODO: Track this metric
      avgImprovementPerImage: stats.totalCorrections / Math.max(stats.uniqueImages, 1),
    };
  }
}
```

### 3.4 DetectionCacheService

**Purpose**: Cache detection results by image hash to reduce API costs and latency.

**File**: `/Users/mrarindampaul/Develop/allmythings/api-service/src/services/detection-cache.service.ts`

```typescript
import { createHash } from 'crypto';
import { Detection, DetectionResponse } from '../schemas/detection.schema';
import { logger } from '../utils/logger';

export interface CachedDetection {
  imageHash: string;
  perceptualHash: string;
  detections: Detection[];
  metadata: {
    mode: string;
    providersUsed: string[];
    processingTimeMs: number;
    modelVersion: string;
    cachedAt: Date;
    expiresAt: Date;
    hitCount: number;
  };
}

/**
 * DetectionCacheService
 *
 * Caches detection results by content hash for fast retrieval.
 * Uses both content hash (SHA-256) and perceptual hash for similarity matching.
 */
export class DetectionCacheService {
  private cache: Map<string, CachedDetection> = new Map();
  private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly MAX_CACHE_SIZE = 10000;

  /**
   * Compute SHA-256 hash of image
   */
  computeHash(imageBuffer: Buffer): string {
    return createHash('sha256').update(imageBuffer).digest('hex');
  }

  /**
   * Compute perceptual hash for similarity matching
   * TODO: Implement actual pHash algorithm or use library
   */
  computePerceptualHash(imageBuffer: Buffer): string {
    // Placeholder: Use content hash for now
    // In production, use a perceptual hashing library like 'imghash' or 'blockhash'
    return this.computeHash(imageBuffer);
  }

  /**
   * Get cached detection by image hash
   */
  async get(imageHash: string): Promise<CachedDetection | null> {
    const cached = this.cache.get(imageHash);

    if (!cached) {
      return null;
    }

    // Check expiration
    if (new Date() > cached.metadata.expiresAt) {
      this.cache.delete(imageHash);
      logger.debug({ imageHash }, 'Cache entry expired');
      return null;
    }

    // Increment hit count
    cached.metadata.hitCount++;

    logger.info({ imageHash, hitCount: cached.metadata.hitCount }, 'Cache hit');
    return cached;
  }

  /**
   * Store detection result in cache
   */
  async set(
    imageHash: string,
    perceptualHash: string,
    detectionResponse: DetectionResponse,
    mode: string,
    modelVersion: string
  ): Promise<void> {
    // Evict old entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    const cached: CachedDetection = {
      imageHash,
      perceptualHash,
      detections: detectionResponse.detections,
      metadata: {
        mode,
        providersUsed: detectionResponse.providerResults.map((p) => p.provider),
        processingTimeMs: detectionResponse.processingTimeMs,
        modelVersion,
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + this.TTL_MS),
        hitCount: 0,
      },
    };

    this.cache.set(imageHash, cached);
    logger.info({ imageHash, mode, modelVersion }, 'Cached detection result');
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(imageHash: string): Promise<boolean> {
    const deleted = this.cache.delete(imageHash);
    if (deleted) {
      logger.info({ imageHash }, 'Cache entry invalidated');
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    const count = this.cache.size;
    this.cache.clear();
    logger.info({ count }, 'Cache cleared');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalHits: number;
    avgHitsPerEntry: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    let totalHits = 0;
    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;

    for (const entry of this.cache.values()) {
      totalHits += entry.metadata.hitCount;

      if (!oldestEntry || entry.metadata.cachedAt < oldestEntry) {
        oldestEntry = entry.metadata.cachedAt;
      }
      if (!newestEntry || entry.metadata.cachedAt > newestEntry) {
        newestEntry = entry.metadata.cachedAt;
      }
    }

    return {
      totalEntries: this.cache.size,
      totalHits,
      avgHitsPerEntry: this.cache.size > 0 ? totalHits / this.cache.size : 0,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Evict oldest cache entries (LRU)
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());

    // Sort by cached date (oldest first)
    entries.sort((a, b) =>
      a[1].metadata.cachedAt.getTime() - b[1].metadata.cachedAt.getTime()
    );

    // Remove oldest 10%
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }

    logger.info({ removed: toRemove, remaining: this.cache.size }, 'Evicted old cache entries');
  }
}
```

---

## 4. API Endpoints

### 4.1 Enhanced Detection Endpoint

**File**: `/Users/mrarindampaul/Develop/allmythings/api-service/src/routes/detect.route.ts`

```typescript
/**
 * POST /v1/detect
 *
 * Enhanced detection with mode selection and caching
 *
 * Query Parameters:
 * - mode: 'fast' | 'standard' | 'thorough' | 'multi-pass' (default: 'standard')
 * - minConfidence: number (0.0 - 1.0, default: 0.35)
 * - roomType: string (optional, helps LLM context)
 * - enableCache: boolean (default: true)
 * - enableCorrections: boolean (default: true)
 *
 * Request Body:
 * - multipart/form-data with 'image' field
 *
 * Response: EnhancedDetectionResponse
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { DetectionMode } from '../types/detection.types';
import { VisionOrchestratorService } from '../services/vision-orchestrator.service';
import { DetectionCacheService } from '../services/detection-cache.service';
import { CorrectionsLearningService } from '../services/corrections-learning.service';
import { RegionScannerService } from '../services/region-scanner.service';
import { HybridDetectionService } from '../services/hybrid-detection.service';

export async function detectRoute(request: FastifyRequest, reply: FastifyReply) {
  const {
    mode = DetectionMode.STANDARD,
    minConfidence = 0.35,
    roomType,
    enableCache = true,
    enableCorrections = true,
  } = request.query as {
    mode?: DetectionMode;
    minConfidence?: number;
    roomType?: string;
    enableCache?: boolean;
    enableCorrections?: boolean;
  };

  // Get image from multipart
  const data = await request.file();
  if (!data) {
    return reply.status(400).send({ error: 'No image provided' });
  }

  const imageBuffer = await data.toBuffer();

  // Compute hashes
  const cacheService = new DetectionCacheService();
  const imageHash = cacheService.computeHash(imageBuffer);
  const perceptualHash = cacheService.computePerceptualHash(imageBuffer);

  // Check cache
  let cacheHit = false;
  if (enableCache) {
    const cached = await cacheService.get(imageHash);
    if (cached) {
      cacheHit = true;

      // Apply corrections if enabled
      let detections = cached.detections;
      let correctionsApplied = 0;

      if (enableCorrections) {
        const correctionsService = new CorrectionsLearningService(/* ... */);
        const result = correctionsService.applyCorrections(imageHash, detections);
        detections = result.detections;
        correctionsApplied = result.stats.correctionsApplied;
      }

      return reply.send({
        success: true,
        mode: cached.metadata.mode,
        cacheHit: true,
        correctionsApplied,
        processingTimeMs: 0,
        detections,
        providerResults: [],
        ensembleMetrics: {},
      });
    }
  }

  // Run detection based on mode
  let detectionResponse;

  switch (mode) {
    case DetectionMode.FAST:
      // YOLO only
      detectionResponse = await runFastDetection(imageBuffer);
      break;

    case DetectionMode.STANDARD:
      // YOLO + 1 LLM
      detectionResponse = await runStandardDetection(imageBuffer);
      break;

    case DetectionMode.THOROUGH:
      // YOLO + multi-LLM + region scanning
      detectionResponse = await runThoroughDetection(imageBuffer);
      break;

    case DetectionMode.MULTI_PASS:
      // Full region scanning
      detectionResponse = await runMultiPassDetection(imageBuffer);
      break;

    default:
      detectionResponse = await runStandardDetection(imageBuffer);
  }

  // Apply corrections if enabled
  let correctionsApplied = 0;
  if (enableCorrections) {
    const correctionsService = new CorrectionsLearningService(/* ... */);
    const result = correctionsService.applyCorrections(imageHash, detectionResponse.detections);
    detectionResponse.detections = result.detections;
    correctionsApplied = result.stats.correctionsApplied;
  }

  // Cache result
  if (enableCache) {
    await cacheService.set(imageHash, perceptualHash, detectionResponse, mode, 'v2.0');
  }

  return reply.send({
    ...detectionResponse,
    mode,
    cacheHit,
    correctionsApplied,
  });
}
```

### 4.2 Corrections Endpoints

**File**: `/Users/mrarindampaul/Develop/allmythings/api-service/src/routes/corrections.routes.ts`

```typescript
/**
 * Corrections API Routes
 */

// POST /v1/corrections - Submit a new correction
export async function submitCorrectionRoute(request: FastifyRequest, reply: FastifyReply) {
  const correctionData = request.body as SubmitCorrectionRequest;

  // Validate request
  // ... validation logic

  const correctionsService = new CorrectionsService(logger);
  const correction = correctionsService.addCorrection({
    imageHash: correctionData.imageHash,
    correctionType: correctionData.correctionType,
    originalLabel: correctionData.originalDetection?.label || '',
    correctedLabel: correctionData.correctedDetection?.label || '',
    boundingBox: correctionData.correctedDetection?.boundingBox || correctionData.originalDetection!.boundingBox,
    confidence: correctionData.originalDetection?.confidence || 0,
    modelVersion: 'ensemble-v2',
    deviceId: correctionData.deviceId,
  });

  // Invalidate cache for this image
  const cacheService = new DetectionCacheService();
  await cacheService.invalidate(correctionData.imageHash);

  return reply.status(201).send({
    success: true,
    correction,
  });
}

// GET /v1/corrections/:imageHash - Get corrections for an image
export async function getCorrectionsRoute(request: FastifyRequest, reply: FastifyReply) {
  const { imageHash } = request.params as { imageHash: string };

  const correctionsService = new CorrectionsService(logger);
  const corrections = correctionsService.getCorrectionsForImage(imageHash);

  return reply.send({
    success: true,
    imageHash,
    corrections,
    count: corrections.length,
  });
}

// GET /v1/corrections/stats - Get correction statistics
export async function getCorrectionStatsRoute(request: FastifyRequest, reply: FastifyReply) {
  const correctionsService = new CorrectionsService(logger);
  const stats = correctionsService.getStats();

  return reply.send({
    success: true,
    stats,
  });
}

// POST /v1/corrections/export - Export corrections for retraining
export async function exportCorrectionsRoute(request: FastifyRequest, reply: FastifyReply) {
  const { format = 'csv' } = request.body as { format?: 'yolo' | 'coco' | 'csv' };

  const correctionsService = new CorrectionsService(logger);
  const exportPath = correctionsService.exportForRetraining({ format, includeImages: false });

  return reply.send({
    success: true,
    format,
    exportPath,
  });
}
```

---

## 5. Integration Points

### 5.1 Integration with Existing VisionOrchestratorService

```typescript
// File: /Users/mrarindampaul/Develop/allmythings/api-service/src/services/vision-orchestrator.service.ts

// ADD these new providers in initializeProviders():

// Priority 0.3: Claude Vision - Excellent for detailed object analysis
if (envConfig.anthropicApiKey && envConfig.anthropicApiKey.length > 10) {
  try {
    this.providers.set('claude', new ClaudeVisionAdapter());
    initializedProviders.push('claude-vision');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize Claude Vision adapter');
  }
}

// Priority 0.4: GPT-4o Vision - Great for structured output
if (envConfig.openaiApiKey && envConfig.openaiApiKey.length > 10) {
  try {
    this.providers.set('gpt4o', new OpenAIVisionAdapter());
    initializedProviders.push('openai-gpt4o');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize OpenAI Vision adapter');
  }
}

// Priority 1.5: API4AI Furniture - Specialized for furniture
if (envConfig.api4aiApiKey && envConfig.api4aiApiKey.length > 10) {
  try {
    this.providers.set('api4ai', new API4AIFurnitureAdapter());
    initializedProviders.push('api4ai-furniture');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize API4AI Furniture adapter');
  }
}
```

### 5.2 Integration with EnsembleFusionService

```typescript
// File: /Users/mrarindampaul/Develop/allmythings/api-service/src/services/ensemble-fusion.service.ts

// UPDATE provider weights:
private readonly providerWeights: Record<string, number> = {
  'yolo-world': 1.0,       // Best for home objects
  'onnx-yolo': 1.0,        // Local YOLO
  'claude': 0.95,          // NEW: Excellent detailed analysis
  'gpt4o': 0.95,           // NEW: Great structured output
  'api4ai': 0.98,          // NEW: Furniture specialist
  'roboflow': 0.95,
  'replicate': 0.9,
  'google': 0.85,
  'hybrid': 0.85,
  'gemini': 0.7,           // DOWNGRADE: Less reliable boxes
  'aws': 0.8,
  'deepseek': 0.75,
  'mock': 0.1,
};
```

### 5.3 New Provider Adapters Needed

Create these adapter files:

1. **ClaudeVisionAdapter** - `/Users/mrarindampaul/Develop/allmythings/api-service/src/adapters/claude-vision.adapter.ts`
2. **OpenAIVisionAdapter** - `/Users/mrarindampaul/Develop/allmythings/api-service/src/adapters/openai-vision.adapter.ts`
3. **API4AIFurnitureAdapter** - `/Users/mrarindampaul/Develop/allmythings/api-service/src/adapters/api4ai-furniture.adapter.ts`

All should implement the `ProviderAdapter` interface.

---

## 6. Data Flow Diagrams

### 6.1 Standard Detection Flow (with Cache & Corrections)

```
┌─────────────────┐
│  Mobile App     │
│  POST /detect   │
│  (image buffer) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Detection Route Handler                            │
│  1. Compute image hash (SHA-256)                    │
│  2. Check cache                                     │
│  3. If cache hit → apply corrections → return       │
│  4. If cache miss → run detection pipeline          │
└────────┬────────────────────────────────────────────┘
         │ (cache miss)
         ▼
┌─────────────────────────────────────────────────────┐
│  Vision Orchestrator Service                        │
│  - Run providers in parallel (YOLO, Claude, etc.)   │
│  - Collect results                                  │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Ensemble Fusion Service                            │
│  - Apply NMS (IoU-based box merging)                │
│  - Weighted voting for confidence                   │
│  - Label normalization                              │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Corrections Learning Service                       │
│  - Load corrections for image hash                  │
│  - Apply ADD corrections (missing objects)          │
│  - Apply REMOVE corrections (false positives)       │
│  - Apply MODIFY corrections (wrong labels/boxes)    │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Detection Cache Service                            │
│  - Store detections by hash                         │
│  - Set TTL (7 days)                                 │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Return to App  │
│  {detections}   │
└─────────────────┘
```

### 6.2 Multi-Pass Region Scanning Flow

```
┌─────────────────┐
│  Full Image     │
│  (3000x2000)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Region Scanner Service                             │
│  - Divide into 5 overlapping regions                │
│    1. Top-left (0,0) → (55%, 55%)                   │
│    2. Top-right (45%,0) → (100%, 55%)               │
│    3. Bottom-left (0, 45%) → (55%, 100%)            │
│    4. Bottom-right (45%, 45%) → (100%, 100%)        │
│    5. Center (20%, 20%) → (80%, 80%)                │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Parallel Region Detection                          │
│  Region 1 → Claude → 12 objects                     │
│  Region 2 → Claude → 8 objects                      │
│  Region 3 → Claude → 10 objects                     │
│  Region 4 → Claude → 9 objects                      │
│  Region 5 → Claude → 15 objects (center focus)      │
└────────┬────────────────────────────────────────────┘
         │ Total: 54 detections (with duplicates)
         ▼
┌─────────────────────────────────────────────────────┐
│  Transform Coordinates                              │
│  - Convert region-relative coords to full image     │
│  - bbox_full = bbox_region * region_size + offset   │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  De-duplication (NMS)                               │
│  - IoU threshold: 0.5                               │
│  - Remove duplicate detections in overlap zones     │
│  - Keep highest confidence version                  │
└────────┬────────────────────────────────────────────┘
         │ Final: 28 unique objects
         ▼
┌─────────────────┐
│  Return merged  │
│  detections     │
└─────────────────┘
```

### 6.3 Hybrid Detection Flow (Box-first, Label-second)

```
┌─────────────────┐
│  Full Image     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Stage 1: YOLO Detection (Fast)                     │
│  - Run YOLO-World                                   │
│  - Get bounding boxes in <200ms                     │
│  - Confidence threshold: 0.4                        │
│  - Result: 15 boxes with generic labels             │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Stage 2: Crop Each Box                             │
│  - For each YOLO box:                               │
│    - Expand bbox by 10% padding                     │
│    - Crop region from original image                │
│    - Create 15 cropped images                       │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Stage 3: LLM Classification (Parallel)             │
│  - Send each crop to Claude                         │
│  - Specialized prompt: "What is this object?"       │
│  - Extract: label, color, material, style           │
│  - Result: 15 rich classifications                  │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Stage 4: Merge Results                             │
│  - Combine YOLO bbox + Claude label                 │
│  - Confidence: 40% YOLO + 60% Claude                │
│  - Add properties as alternativeLabels              │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Return hybrid  │
│  detections     │
└─────────────────┘
```

---

## 7. Configuration

### 7.1 Environment Variables

Add to `/Users/mrarindampaul/Develop/allmythings/api-service/.env`:

```bash
# Existing providers
GOOGLE_AI_API_KEY=xxx
ROBOFLOW_API_KEY=xxx
REPLICATE_API_TOKEN=xxx
DEEPSEEK_API_KEY=xxx

# New providers
ANTHROPIC_API_KEY=xxx               # Claude Vision
OPENAI_API_KEY=xxx                  # GPT-4o Vision
API4AI_API_KEY=xxx                  # Furniture API

# Detection modes
DEFAULT_DETECTION_MODE=standard     # fast, standard, thorough, multi-pass
ENABLE_DETECTION_CACHE=true
CACHE_TTL_DAYS=7
MAX_CACHE_SIZE=10000

# Region scanning
ENABLE_REGION_SCANNING=true
REGION_OVERLAP_PERCENTAGE=0.1
MIN_REGION_SIZE=200
PARALLEL_REGION_SCANS=true

# Hybrid detection
ENABLE_HYBRID_DETECTION=true
HYBRID_BOX_PROVIDER=yolo-world
HYBRID_LABEL_PROVIDER=claude
MIN_YOLO_CONFIDENCE=0.4
CROP_PADDING=0.1

# Corrections
ENABLE_CORRECTIONS=true
AUTO_APPLY_CORRECTIONS=true
CORRECTIONS_STORAGE_PATH=./models/corrections

# Performance
PROVIDER_TIMEOUT_MS=5000            # Increased for LLMs
```

### 7.2 EnvConfig Interface Update

File: `/Users/mrarindampaul/Develop/allmythings/api-service/src/config/env.config.ts`

```typescript
export interface EnvConfig {
  // ... existing fields ...

  // New provider API keys
  anthropicApiKey: string;
  openaiApiKey: string;
  api4aiApiKey: string;

  // Detection configuration
  defaultDetectionMode: 'fast' | 'standard' | 'thorough' | 'multi-pass';
  enableDetectionCache: boolean;
  cacheTtlDays: number;
  maxCacheSize: number;

  // Region scanning
  enableRegionScanning: boolean;
  regionOverlapPercentage: number;
  minRegionSize: number;
  parallelRegionScans: boolean;

  // Hybrid detection
  enableHybridDetection: boolean;
  hybridBoxProvider: string;
  hybridLabelProvider: string;
  minYoloConfidence: number;
  cropPadding: number;

  // Corrections
  enableCorrections: boolean;
  autoApplyCorrections: boolean;
  correctionsStoragePath: string;
}

export const envConfig: EnvConfig = {
  // ... existing config ...

  // New provider API keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  api4aiApiKey: process.env.API4AI_API_KEY || '',

  // Detection configuration
  defaultDetectionMode: (process.env.DEFAULT_DETECTION_MODE as any) || 'standard',
  enableDetectionCache: process.env.ENABLE_DETECTION_CACHE !== 'false',
  cacheTtlDays: parseInt(process.env.CACHE_TTL_DAYS || '7', 10),
  maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE || '10000', 10),

  // Region scanning
  enableRegionScanning: process.env.ENABLE_REGION_SCANNING === 'true',
  regionOverlapPercentage: parseFloat(process.env.REGION_OVERLAP_PERCENTAGE || '0.1'),
  minRegionSize: parseInt(process.env.MIN_REGION_SIZE || '200', 10),
  parallelRegionScans: process.env.PARALLEL_REGION_SCANS !== 'false',

  // Hybrid detection
  enableHybridDetection: process.env.ENABLE_HYBRID_DETECTION === 'true',
  hybridBoxProvider: process.env.HYBRID_BOX_PROVIDER || 'yolo-world',
  hybridLabelProvider: process.env.HYBRID_LABEL_PROVIDER || 'claude',
  minYoloConfidence: parseFloat(process.env.MIN_YOLO_CONFIDENCE || '0.4'),
  cropPadding: parseFloat(process.env.CROP_PADDING || '0.1'),

  // Corrections
  enableCorrections: process.env.ENABLE_CORRECTIONS !== 'false',
  autoApplyCorrections: process.env.AUTO_APPLY_CORRECTIONS !== 'false',
  correctionsStoragePath: process.env.CORRECTIONS_STORAGE_PATH || './models/corrections',
};
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Days 1-3)
- [ ] Create database migrations for `detection_corrections`, `detection_cache`, `provider_performance`
- [ ] Implement TypeScript interfaces in `src/types/` directory
- [ ] Update `env.config.ts` with new configuration
- [ ] Add new provider API keys to `.env.example`

### Phase 2: Core Services (Days 4-7)
- [ ] Implement `RegionScannerService`
- [ ] Implement `HybridDetectionService`
- [ ] Implement `DetectionCacheService`
- [ ] Implement `CorrectionsLearningService`
- [ ] Write unit tests for all services

### Phase 3: Provider Adapters (Days 8-10)
- [ ] Create `ClaudeVisionAdapter`
- [ ] Create `OpenAIVisionAdapter`
- [ ] Create `API4AIFurnitureAdapter`
- [ ] Integrate adapters with `VisionOrchestratorService`
- [ ] Update provider weights in `EnsembleFusionService`

### Phase 4: API Endpoints (Days 11-12)
- [ ] Update `/v1/detect` route with mode parameter
- [ ] Implement corrections routes
- [ ] Add cache management endpoints
- [ ] Update OpenAPI spec

### Phase 5: Testing & Optimization (Days 13-15)
- [ ] Integration tests for detection pipeline
- [ ] Load testing for caching
- [ ] Validate correction application
- [ ] Performance benchmarking
- [ ] Documentation updates

---

## 9. Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Detection Recall | ~20% | >95% | % of objects found vs. ground truth |
| Detection Precision | ~70% | >90% | % of correct labels |
| Avg Processing Time | ~3s | <2s (standard mode) | API response time |
| Cache Hit Rate | 0% | >60% | Cached vs. fresh detections |
| User Corrections/Image | N/A | <2 | Corrections needed per image |
| Cost per Detection | ~$0.15 | <$0.05 | API costs (amortized with cache) |

---

## 10. Security & Privacy Considerations

1. **Image Data**: Never store original images in corrections database - only hashes and metadata
2. **User Privacy**: Device IDs are anonymized, no PII collected
3. **API Keys**: All provider API keys stored in environment variables, never committed
4. **Rate Limiting**: Implement per-device rate limits on correction submissions
5. **Data Retention**: Corrections auto-expire after 90 days (configurable)
6. **Cache Security**: Cached detections include no user-identifying information

---

## 11. Cost Optimization

**Estimated API Costs (per 1000 detections):**

| Provider | Cost per Image | With Caching (60% hit rate) | Notes |
|----------|----------------|----------------------------|-------|
| YOLO-World (local) | $0.00 | $0.00 | Free (self-hosted) |
| Claude Vision | $0.048 | $0.019 | 60% cache savings |
| GPT-4o Vision | $0.025 | $0.010 | Most cost-effective LLM |
| Gemini Pro | $0.013 | $0.005 | Cheapest, but less accurate |
| API4AI Furniture | $0.050 | $0.020 | Specialized, worth the cost |

**Recommended Configuration for Cost Optimization:**
- **Fast Mode**: YOLO-World only (free)
- **Standard Mode**: YOLO-World + GPT-4o (60% cached = $0.01/image)
- **Thorough Mode**: YOLO-World + Claude + API4AI (60% cached = $0.039/image)

---

## Appendix A: File Checklist

**New Files to Create:**

Services:
- [ ] `/api-service/src/services/region-scanner.service.ts`
- [ ] `/api-service/src/services/hybrid-detection.service.ts`
- [ ] `/api-service/src/services/detection-cache.service.ts`
- [ ] `/api-service/src/services/corrections-learning.service.ts`

Adapters:
- [ ] `/api-service/src/adapters/claude-vision.adapter.ts`
- [ ] `/api-service/src/adapters/openai-vision.adapter.ts`
- [ ] `/api-service/src/adapters/api4ai-furniture.adapter.ts`

Types:
- [ ] `/api-service/src/types/detection.types.ts`
- [ ] `/api-service/src/types/corrections.types.ts`

Database:
- [ ] `/api-service/migrations/001_create_detection_corrections.sql`
- [ ] `/api-service/migrations/002_create_detection_cache.sql`
- [ ] `/api-service/migrations/003_create_provider_performance.sql`

Tests:
- [ ] `/api-service/tests/unit/region-scanner.service.test.ts`
- [ ] `/api-service/tests/unit/hybrid-detection.service.test.ts`
- [ ] `/api-service/tests/unit/detection-cache.service.test.ts`
- [ ] `/api-service/tests/integration/detection-pipeline.integration.test.ts`

**Files to Modify:**

- [ ] `/api-service/src/config/env.config.ts` - Add new config
- [ ] `/api-service/src/routes/detect.route.ts` - Add mode parameter
- [ ] `/api-service/src/services/vision-orchestrator.service.ts` - Register new providers
- [ ] `/api-service/src/services/ensemble-fusion.service.ts` - Update weights
- [ ] `/api-service/src/app.ts` - Register new routes

---

**End of Architecture Design Document**

*This architecture is designed for scalability, maintainability, and cost-effectiveness while achieving 95%+ detection accuracy for home inventory objects.*
