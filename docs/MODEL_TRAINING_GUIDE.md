# Model Training and Fine-Tuning Guide

This document outlines strategies for improving detection precision in the Visual Home Inventory system.

## Current Architecture

The detection pipeline uses an ensemble approach:

1. **ONNX YOLO (YOLOv8m)** - Primary detection, COCO-80 classes
2. **Google Cloud Vision** - Fallback provider, good for general objects
3. **Gemini Vision** - Property enrichment and small object detection
4. **Ensemble Fusion** - Combines and deduplicates results

## Known Limitations

### COCO-80 Class Set
The YOLO model is trained on COCO dataset with only 80 classes:
- Covers common furniture (chair, couch, bed, dining table)
- Missing small decor items (candles, figurines, trays, coasters)
- Missing specific furniture variants (nightstand, console table)

### Detection Issues
1. **Over-specific labels**: "dining chair" instead of "chair"
2. **Missing small objects**: Items under ~32x32 pixels often missed
3. **Similar objects merged**: NMS can over-aggressively merge distinct items

## Improvement Strategies

### 1. Label Normalization (Implemented)

Location: `api-service/src/utils/label-synonyms.ts`

Normalizes specific labels to canonical forms:
```typescript
'chair': [
  'dining chair', 'office chair', 'armchair', 'recliner',
  'accent chair', 'side chair', 'lounge chair'...
]
```

### 2. Confidence Threshold Tuning (Implemented)

Location: `api-service/src/config/env.config.ts`

Lowered from 0.7 to 0.35 to catch more detections:
```
ENSEMBLE_CONFIDENCE_THRESHOLD=0.35
```

Trade-off: More false positives but fewer missed objects.

### 3. Gemini Vision Enhancement (Enabled)

Location: `api-service/src/services/property-enrichment.service.ts`

Uses Gemini to detect objects YOLO misses:
- Small decor items
- Decorative objects
- Artwork and frames
- Books and accessories

### 4. Custom Model Training (Future)

For significant precision improvements, train a custom YOLO model:

#### Option A: Fine-tune on Home Inventory Dataset

**Dataset Requirements:**
- 1,000-5,000 annotated images of home interiors
- Bounding box annotations for target classes
- Include varied lighting, angles, and room types

**Target Classes to Add:**
- Home decor: candle, vase, figurine, tray, coaster, bowl
- Furniture: nightstand, console table, ottoman, bench
- Wall decor: mirror, clock, artwork, frame
- Lighting: lamp, floor lamp, chandelier, sconce

**Tools:**
- Roboflow for annotation and dataset management
- Ultralytics for training
- CVAT for manual annotation

**Training Command:**
```bash
yolo train model=yolov8m.pt data=home_inventory.yaml epochs=100 imgsz=640
```

#### Option B: Use YOLO-World (Open-Vocabulary)

YOLO-World can detect arbitrary text prompts without retraining:

Location: `api-service/src/adapters/yolo-world.adapter.ts`

Enable in config:
```
YOLO_WORLD_ENABLED=true
YOLO_WORLD_SERVICE_URL=http://localhost:8001
```

Prompts for home inventory:
```python
prompts = [
    "chair", "sofa", "table", "bed", "lamp",
    "vase", "candle", "picture frame", "mirror",
    "plant", "clock", "rug", "curtain", "pillow"
]
```

### 5. Multi-Scale Detection

For small objects, use tiled inference:

```python
# Tile image into overlapping patches
# Run detection on each tile
# Merge results with NMS
```

Configuration in `detection.schema.ts`:
```typescript
multiScale: true,
scales: [1.0, 0.5, 0.25]  // Process at multiple resolutions
```

## Dataset Creation Pipeline

### Step 1: Collect Images
- Use existing inventory images from app
- Scrape interior design sites (with permission)
- Take photos of real rooms

### Step 2: Annotate with Roboflow
```bash
# Upload to Roboflow workspace
roboflow upload ./images --project home-inventory

# Export in YOLO format
roboflow download home-inventory -f yolov8
```

### Step 3: Train Custom Model
```bash
# Install ultralytics
pip install ultralytics

# Train on custom dataset
yolo train \
  model=yolov8m.pt \
  data=./home_inventory/data.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  name=home_inventory_v1
```

### Step 4: Export to ONNX
```bash
yolo export model=runs/detect/home_inventory_v1/weights/best.pt format=onnx
```

### Step 5: Deploy
Replace model path in config:
```
YOLO_MODEL_PATH=./models/home_inventory_v1.onnx
```

## Performance Metrics

Track these metrics to measure improvement:

| Metric | Current | Target |
|--------|---------|--------|
| mAP@50 | ~0.45 | >0.65 |
| Recall | ~0.60 | >0.80 |
| Small object recall | ~0.30 | >0.60 |
| False positive rate | ~0.15 | <0.10 |

## Quick Wins (No Retraining)

1. **Lower confidence threshold** - Done (0.7 -> 0.35)
2. **Add label synonyms** - Done (extensive chair/decor mapping)
3. **Enable Gemini enrichment** - Done (detects additional objects)
4. **Use YOLO-World** - Requires Python service setup

## Recommended Next Steps

1. **Short-term**: Monitor detection quality with current changes
2. **Medium-term**: Set up YOLO-World service for open-vocabulary detection
3. **Long-term**: Collect annotated dataset and train custom model

## References

- [Ultralytics YOLO Documentation](https://docs.ultralytics.com/)
- [Roboflow Training Guide](https://docs.roboflow.com/train)
- [YOLO-World Paper](https://arxiv.org/abs/2401.17270)
- [COCO Dataset Classes](https://cocodataset.org/#explore)
