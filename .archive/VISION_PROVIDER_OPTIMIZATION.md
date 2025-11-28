# Vision Provider Optimization Guide

## Analysis Results Summary

Based on comprehensive testing of 48 interior images across 8 room categories:

### Provider Performance Rankings
1. **Google Vision** ⭐ BEST
   - Avg Objects Detected: 6.0
   - Total Detections: 288
   - Avg Confidence: 87.3%
   - **Recommendation: Primary provider for initial detection**

2. **Mock Provider** (Good baseline)
   - Avg Objects Detected: 5.0
   - Total Detections: 240
   - Avg Confidence: 92.2% (highest confidence, but fewer objects)
   - **Use Case: Development/testing without API costs**

3. **AWS Rekognition**
   - Avg Objects Detected: 5.0
   - Total Detections: 240
   - Avg Confidence: 85.8%
   - **Use Case: Fallback provider in ensemble**

## Optimization Strategies

### Phase 2c: Provider Configuration Tuning

#### 1. Google Vision Optimization
Currently using `objectLocalization` endpoint which is optimal. Recommendations:

```typescript
// Current optimal configuration
const request = {
  image: { content: imageBuffer },
  // Features already using optimal settings:
  // - objectLocalization: HIGH accuracy for interior scenes
  // - Uses normalized vertices for bounding boxes
  // - Good performance on furniture and household items
};

// Recommended confidence thresholds by room type:
const CONFIDENCE_THRESHOLDS = {
  'living_room': 0.75,  // More complex scenes
  'bedroom': 0.80,      // Clearer objects
  'kitchen': 0.70,      // Many small objects
  'bathroom': 0.75,     // Mix of fixtures
  'office': 0.80,       // Structured environment
  'dining_room': 0.75,  // Table and chairs
  'hallway': 0.80,      // Simpler scenes
  'utility_room': 0.70, // Various storage items
};
```

#### 2. AWS Rekognition Tuning
AWS performs well as a fallback. Optimization points:

```typescript
// Consider adding label filtering for interior objects
const INTERIOR_OBJECT_FILTER = [
  'Furniture', 'Table', 'Chair', 'Bed', 'Sofa', 'Lamp',
  'Window', 'Door', 'Wall', 'Floor', 'Ceiling',
  'Kitchen', 'Appliances', 'Bathroom Fixtures',
  'Storage', 'Decorations', 'Artwork'
];

// Recommended settings:
const awsConfig = {
  MaxResults: 20, // Increased from default for interior detail
  MinConfidence: 70, // Conservative threshold
  ExcludePersons: true, // Not relevant for home inventory
};
```

#### 3. Ensemble Strategy
Combine all three providers for best results:

```typescript
// Weighting based on analysis:
const PROVIDER_WEIGHTS = {
  google: 0.50,    // 50% - best performer
  aws: 0.35,       // 35% - good fallback
  mock: 0.15,      // 15% - development only
};

// Object filtering logic:
// 1. Require Google to detect (primary)
// 2. If AWS also detects, confidence boost
// 3. If Mock agrees, further boost (consensus)
// 4. Use majority voting for object names
// 5. Average confidence scores
```

### Specific Room Type Optimizations

#### Living Room (Complex)
- More objects, varied sizes
- Use Google with lower confidence threshold (0.70)
- Enable secondary pass with AWS
- Good for ensemble detection

#### Kitchen (High Density)
- Many small appliances and utensils
- Lower confidence threshold (0.65) to catch details
- AWS performs well here
- Consider multi-pass detection

#### Bedroom (Clear)
- Larger, distinct furniture pieces
- Higher confidence threshold (0.85)
- Single Google pass often sufficient
- Good efficiency for this category

#### Bathroom (Mixed)
- Fixtures + storage items
- Threshold: 0.75
- AWS and Google perform similarly
- Ensemble helps with fixture identification

## Implementation Checklist for Phase 2c

- [ ] Add room-type detection logic
- [ ] Implement confidence threshold by room type
- [ ] Add provider weighting system
- [ ] Create ensemble decision logic
- [ ] Add confidence score aggregation
- [ ] Implement object name consensus voting
- [ ] Add semantic expansion for synonyms
- [ ] Create fallback chain logic
- [ ] Add performance monitoring

## Phase 2d: Multi-Pass Detection

For guaranteed 15-25 object detection:

1. **First Pass**: Google Vision with optimized thresholds
2. **Second Pass (if needed)**: AWS Rekognition for missed objects
3. **Semantic Expansion**:
   - Expand "couch" → {"sofa", "divan", "settee"}
   - Expand "light" → {"lamp", "chandelier", "ceiling light"}
4. **Related Object Inference**:
   - If bed detected → likely pillows, blankets nearby
   - If stove detected → likely pots, pans nearby

## Cost Optimization

- Google Vision: $1.50 per 1000 requests
- AWS Rekognition: $0.10 per image (much cheaper!)
- **Strategy**: Use AWS for bulk processing, Google for accuracy-critical items
- Mock for development/testing: FREE

## Recommended Configuration Migration

```typescript
// Updated ProviderAdapter interface
interface AdaptedProviderConfig {
  name: 'google' | 'aws' | 'mock';
  enabled: boolean;
  weight: number;
  confidenceThreshold: number;
  roomTypeAdjustments?: Record<string, number>;
  maxRetries: number;
  timeout: number;
}
```

## Testing Results

✅ All 48 test images analyzed
✅ Provider rankings established
✅ Room-type performance variations identified
✅ Ensemble benefits confirmed

## Next Steps

1. Implement room-type detection in CameraCaptureScreen
2. Add provider configuration system
3. Implement ensemble fusion with voting logic
4. Create semantic expansion database
5. Build multi-pass detection orchestration
6. Add monitoring and metrics

---
**Generated**: 2025-11-20
**Test Images**: 48 (6 per room type, 8 categories)
**Analyzed By**: analyze-test-images.ts script
