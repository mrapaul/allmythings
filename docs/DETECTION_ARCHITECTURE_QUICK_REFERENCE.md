# Detection Architecture - Quick Reference Guide

**Date**: 2025-12-06
**Full Design**: See `DETECTION_ARCHITECTURE_DESIGN.md`

---

## TL;DR - What's New

### Problem
- Current detection finds only ~20% of objects in room scenes
- YOLO models trained on COCO dataset (street scenes, not furniture)
- Single-pass detection misses small/occluded objects

### Solution
1. **Tiered Hybrid Pipeline**: YOLO for boxes → LLM for labels
2. **Multi-Pass Region Scanning**: Divide image into overlapping regions
3. **Better Providers**: Claude Vision, GPT-4o, API4AI Furniture
4. **User Feedback Loop**: Corrections database + real-time application
5. **Smart Caching**: Reduce API costs by 60%+

### Expected Results
- **Recall**: 20% → 95%+ (5x improvement)
- **Precision**: 70% → 90%+
- **Speed**: ~3s → <2s (with caching)
- **Cost**: $0.15 → $0.05 per image

---

## Database Schema - Quick Copy-Paste

### 1. Detection Corrections

```sql
CREATE TABLE detection_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Image
  image_hash VARCHAR(64) NOT NULL,
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,

  -- Correction type
  correction_type VARCHAR(20) NOT NULL CHECK (correction_type IN ('add', 'remove', 'modify', 'merge', 'split')),

  -- Original detection (NULL if type='add')
  original_label VARCHAR(255),
  original_confidence DECIMAL(5,4),
  original_bbox_x DECIMAL(8,6),
  original_bbox_y DECIMAL(8,6),
  original_bbox_width DECIMAL(8,6),
  original_bbox_height DECIMAL(8,6),
  original_provider VARCHAR(50),

  -- Corrected detection (NULL if type='remove')
  corrected_label VARCHAR(255),
  corrected_bbox_x DECIMAL(8,6),
  corrected_bbox_y DECIMAL(8,6),
  corrected_bbox_width DECIMAL(8,6),
  corrected_bbox_height DECIMAL(8,6),
  corrected_properties JSONB,

  -- Metadata
  device_id VARCHAR(255),
  model_version VARCHAR(50) NOT NULL,
  user_confidence VARCHAR(20) CHECK (user_confidence IN ('certain', 'likely', 'unsure')),
  room_type VARCHAR(50),

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'applied', 'rejected')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_corrections_image_hash ON detection_corrections(image_hash);
CREATE INDEX idx_corrections_status ON detection_corrections(status);
CREATE INDEX idx_corrections_created_at ON detection_corrections(created_at DESC);
```

### 2. Detection Cache

```sql
CREATE TABLE detection_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Image identification
  image_hash VARCHAR(64) NOT NULL UNIQUE,
  perceptual_hash VARCHAR(64) NOT NULL,

  -- Detection results (JSON)
  detections JSONB NOT NULL,
  provider_results JSONB,
  ensemble_metrics JSONB,

  -- Metadata
  detection_mode VARCHAR(20) NOT NULL,
  providers_used TEXT[],
  processing_time_ms INTEGER,
  model_version VARCHAR(50) NOT NULL,

  -- Cache management
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_cache_image_hash ON detection_cache(image_hash);
CREATE INDEX idx_cache_expires_at ON detection_cache(expires_at);
```

---

## Environment Variables - Add to .env

```bash
# New Providers
ANTHROPIC_API_KEY=sk-ant-xxx           # Claude Vision (best for detailed analysis)
OPENAI_API_KEY=sk-xxx                  # GPT-4o Vision (best structured output)
API4AI_API_KEY=xxx                     # Furniture specialist API

# Detection Configuration
DEFAULT_DETECTION_MODE=standard        # fast | standard | thorough | multi-pass
ENABLE_DETECTION_CACHE=true
CACHE_TTL_DAYS=7
MAX_CACHE_SIZE=10000

# Region Scanning
ENABLE_REGION_SCANNING=false           # Enable for thorough/multi-pass modes
REGION_OVERLAP_PERCENTAGE=0.1
MIN_REGION_SIZE=200
PARALLEL_REGION_SCANS=true

# Hybrid Detection
ENABLE_HYBRID_DETECTION=true
HYBRID_BOX_PROVIDER=yolo-world         # YOLO for boxes
HYBRID_LABEL_PROVIDER=claude           # Claude for labels
MIN_YOLO_CONFIDENCE=0.4
CROP_PADDING=0.1

# Corrections
ENABLE_CORRECTIONS=true
AUTO_APPLY_CORRECTIONS=true
CORRECTIONS_STORAGE_PATH=./models/corrections
```

---

## API Changes

### Enhanced Detection Endpoint

```typescript
// POST /v1/detect
// Query params:
{
  mode?: 'fast' | 'standard' | 'thorough' | 'multi-pass',  // NEW
  minConfidence?: number,
  roomType?: string,                                        // NEW (helps LLM)
  enableCache?: boolean,                                    // NEW
  enableCorrections?: boolean                               // NEW
}

// Response:
{
  success: boolean;
  mode: string;                    // NEW
  cacheHit: boolean;               // NEW
  correctionsApplied: number;      // NEW
  processingTimeMs: number;
  detections: Detection[];
  providerResults: ProviderResult[];
  ensembleMetrics: EnsembleMetrics;
  hybridDetails?: {                // NEW
    yoloBoxCount: number;
    llmEnrichmentCount: number;
    hybridMergeCount: number;
  };
}
```

### New Corrections Endpoints

```typescript
// POST /v1/corrections - Submit user correction
{
  correctionType: 'add' | 'remove' | 'modify',
  imageHash: string,
  originalDetection?: { id, label, confidence, boundingBox },
  correctedDetection?: { label, boundingBox, properties },
  userConfidence: 'certain' | 'likely' | 'unsure',
  roomType?: string
}

// GET /v1/corrections/:imageHash - Get corrections for image

// GET /v1/corrections/stats - Get correction statistics

// POST /v1/corrections/export - Export for retraining
{
  format: 'yolo' | 'coco' | 'csv'
}
```

---

## Detection Modes Explained

### Fast Mode (<500ms, Free)
- YOLO-World only
- Local inference, no API costs
- Good for: Real-time preview, budget-conscious

### Standard Mode (<2s, ~$0.01/image with cache)
- YOLO-World for boxes
- GPT-4o for labels (one LLM)
- Good for: Most use cases, balanced speed/accuracy

### Thorough Mode (<10s, ~$0.04/image with cache)
- YOLO-World + Claude + API4AI
- Multi-provider ensemble
- Good for: Important inventories, high-value items

### Multi-Pass Mode (<15s, ~$0.06/image with cache)
- Full region scanning (5 overlapping regions)
- Each region analyzed separately
- Good for: Dense scenes (20+ objects), critical accuracy

---

## Integration Checklist

### Step 1: Database Setup
```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service
# Create migration files (see SQL above)
# Run migrations
npm run migrate
```

### Step 2: Install New Dependencies
```bash
cd api-service
npm install @anthropic-ai/sdk openai sharp
```

### Step 3: Add Type Definitions
Create `/api-service/src/types/detection.types.ts` with:
- `DetectionMode` enum
- `ImageRegion` interface
- `HybridDetectionResult` interface
- `ObjectProperties` interface

### Step 4: Create New Services
- `RegionScannerService` - Multi-pass scanning
- `HybridDetectionService` - Box-first, label-second
- `DetectionCacheService` - Cache management
- `CorrectionsLearningService` - Apply corrections

### Step 5: Create Provider Adapters
- `ClaudeVisionAdapter` - Anthropic API
- `OpenAIVisionAdapter` - OpenAI GPT-4o
- `API4AIFurnitureAdapter` - Furniture specialist

### Step 6: Update Existing Services
- `VisionOrchestratorService` - Register new providers
- `EnsembleFusionService` - Update provider weights
- `detect.route.ts` - Add mode parameter

### Step 7: Update Config
- `env.config.ts` - Add new configuration
- `.env` - Add API keys

### Step 8: Testing
```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Load test with real images
npm run test:e2e
```

---

## Provider Weights (Updated)

```typescript
private readonly providerWeights: Record<string, number> = {
  'yolo-world': 1.0,       // Best for home objects (185 classes)
  'onnx-yolo': 1.0,        // Local YOLO
  'api4ai': 0.98,          // NEW: Furniture specialist
  'claude': 0.95,          // NEW: Excellent detailed analysis
  'gpt4o': 0.95,           // NEW: Great structured output
  'roboflow': 0.95,
  'replicate': 0.9,
  'google': 0.85,
  'hybrid': 0.85,
  'aws': 0.8,
  'deepseek': 0.75,
  'gemini': 0.7,           // DOWNGRADED: Less reliable boxes
  'mock': 0.1,
};
```

---

## Quick Implementation Guide

### 1. Immediate Quick Wins (1 day)
```typescript
// File: api-service/src/adapters/gemini-vision.adapter.ts
// Change model from:
model: 'gemini-1.5-flash'
// To:
model: 'gemini-2.5-pro-preview'

// Update prompt to include systematic grid scanning
```

### 2. Add Claude Vision (1 day)
```typescript
// File: api-service/src/adapters/claude-vision.adapter.ts
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeVisionAdapter implements ProviderAdapter {
  async detectObjects(imageBuffer: Buffer): Promise<Detection[]> {
    const client = new Anthropic({ apiKey: envConfig.anthropicApiKey });
    const base64Image = imageBuffer.toString('base64');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
          { type: 'text', text: SYSTEMATIC_DETECTION_PROMPT }
        ]
      }]
    });

    return this.parseResponse(response);
  }
}
```

### 3. Enable Caching (1 day)
```typescript
// File: api-service/src/routes/detect.route.ts
const cacheService = new DetectionCacheService();
const imageHash = cacheService.computeHash(imageBuffer);

// Check cache
const cached = await cacheService.get(imageHash);
if (cached) {
  return reply.send({ ...cached, cacheHit: true });
}

// Run detection...
// Store in cache
await cacheService.set(imageHash, perceptualHash, result, mode, 'v2.0');
```

### 4. User Corrections (2 days)
```typescript
// Mobile app: Add "Report Issue" button on detection results
// API: Store correction in database
// Next detection: Apply corrections automatically

const correctionsService = new CorrectionsLearningService();
const { detections, stats } = correctionsService.applyCorrections(imageHash, rawDetections);
// stats.correctionsApplied = 3 (added 2 missed objects, removed 1 false positive)
```

---

## Cost Breakdown

### Per-Image Costs (1000 images/month)

| Mode | Providers | Cost/Image (fresh) | Cost/Image (60% cached) | Monthly Cost |
|------|-----------|-------------------|------------------------|--------------|
| Fast | YOLO only | $0.00 | $0.00 | $0.00 |
| Standard | YOLO + GPT-4o | $0.025 | $0.010 | $10.00 |
| Thorough | YOLO + Claude + API4AI | $0.098 | $0.039 | $39.00 |
| Multi-Pass | 5x regions × Claude | $0.240 | $0.096 | $96.00 |

**Recommended**: Use **Standard mode** with caching for 95%+ accuracy at $10/month.

---

## Testing Strategy

### Unit Tests
```typescript
describe('RegionScannerService', () => {
  it('should divide image into 5 overlapping regions', async () => {
    const regions = RegionScannerService.getDefaultRegions();
    expect(regions).toHaveLength(5);
    expect(regions[0].name).toBe('top-left');
  });

  it('should transform region coordinates to full image', async () => {
    const bbox = { x: 0.5, y: 0.5, width: 0.2, height: 0.2 };
    const region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const transformed = service.transformBoundingBox(bbox, region, 1000, 1000);
    expect(transformed.x).toBe(0.5); // 0.25 + 0.5 * 0.5
  });
});
```

### Integration Tests
```typescript
describe('Detection Pipeline', () => {
  it('should detect 95%+ of objects in test image', async () => {
    const imageBuffer = fs.readFileSync('test_images/ikea_rooms/bedroom.jpg');
    const response = await detectRoute({ imageBuffer, mode: 'thorough' });

    // Ground truth: bedroom has 28 objects
    expect(response.detections.length).toBeGreaterThanOrEqual(26); // 93%+
  });

  it('should apply user corrections', async () => {
    const imageHash = 'abc123';

    // Submit correction: add "nightstand"
    await submitCorrection({ imageHash, correctionType: 'add', correctedDetection: {...} });

    // Detect same image again
    const response = await detectRoute({ imageBuffer, enableCorrections: true });
    expect(response.correctionsApplied).toBe(1);
    expect(response.detections.some(d => d.label === 'nightstand')).toBe(true);
  });
});
```

---

## Performance Optimization Tips

### 1. Cache Aggressively
- Cache hits save 60%+ on API costs
- Set TTL to 7+ days for inventory images (rarely change)
- Use perceptual hashing for similar images

### 2. Parallelize Providers
- Already implemented in VisionOrchestratorService
- Use `Promise.all()` for independent provider calls
- Set timeout to 5s max per provider

### 3. Smart Mode Selection
- Fast mode for preview/thumbnails
- Standard mode for most detections
- Thorough/Multi-pass only for critical inventories

### 4. Batch Processing
- For bulk uploads, use Fast mode first
- Let user flag low-quality results
- Reprocess flagged images with Thorough mode

---

## Monitoring & Metrics

### Key Metrics to Track

```typescript
// Provider performance
{
  provider: 'claude',
  totalRequests: 1500,
  successRate: 0.98,
  avgLatency: 1800,      // ms
  avgConfidence: 0.87,
  costPerRequest: 0.048   // USD
}

// Detection quality
{
  imageHash: 'abc123',
  detectionsCount: 28,
  avgConfidence: 0.85,
  userCorrections: 2,     // 2 corrections needed
  correctionTypes: ['add', 'modify']
}

// Cache effectiveness
{
  totalRequests: 5000,
  cacheHits: 3200,       // 64% hit rate
  cacheMisses: 1800,
  costSavings: 102.40     // USD saved
}
```

### Health Check Endpoint

```typescript
// GET /v1/health
{
  status: 'healthy',
  providers: {
    'yolo-world': { healthy: true, avgLatency: 150 },
    'claude': { healthy: true, avgLatency: 1800 },
    'gpt4o': { healthy: true, avgLatency: 1200 },
    'api4ai': { healthy: false, error: 'timeout' }  // Fallback to other providers
  },
  cache: {
    size: 4521,
    hitRate: 0.64,
    oldestEntry: '2025-11-29T10:00:00Z'
  },
  corrections: {
    pending: 45,
    applied: 234,
    totalImages: 189
  }
}
```

---

## Troubleshooting

### Issue: Low Detection Count

**Check:**
1. Provider health: `GET /v1/health`
2. Confidence threshold too high? Lower `minConfidence`
3. Try different mode: `thorough` or `multi-pass`
4. Check provider weights in `EnsembleFusionService`

### Issue: Slow Detection

**Check:**
1. Enable caching: `enableCache=true`
2. Use faster mode: `fast` or `standard`
3. Check provider timeouts (should be <5s)
4. Parallelize region scans: `PARALLEL_REGION_SCANS=true`

### Issue: High API Costs

**Check:**
1. Cache hit rate (should be >60%)
2. Use cheaper providers: GPT-4o instead of Claude for standard mode
3. Batch process instead of one-by-one
4. Use Fast mode for previews

### Issue: Incorrect Labels

**Check:**
1. User corrections being applied?
2. Provider weights correct?
3. Semantic expansion enabled?
4. Try Hybrid mode (YOLO boxes + Claude labels)

---

## Next Steps

1. **Review full design**: `DETECTION_ARCHITECTURE_DESIGN.md`
2. **Set up database**: Run migrations for corrections + cache tables
3. **Add API keys**: ANTHROPIC_API_KEY, OPENAI_API_KEY, API4AI_API_KEY
4. **Implement services**: Start with DetectionCacheService (quick win)
5. **Create adapters**: ClaudeVisionAdapter first (best ROI)
6. **Test with real images**: Use `/test_images/ikea_rooms/` directory
7. **Monitor & iterate**: Track metrics, apply corrections, retrain

---

**Questions?** See full architecture document or contact backend architect.
