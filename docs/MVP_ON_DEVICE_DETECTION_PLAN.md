# MVP: On-Device Detection + Self-Hosted Learning LLM

## Vision
Build the best home object identification system that:
1. **Detects instantly** on-device (no network latency)
2. **Learns continuously** from user corrections
3. **Becomes smarter** over time to recommend products, replacements, and additions

## Timeline: 2-3 Weeks

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOBILE APP (Flutter)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ON-DEVICE DETECTION                              │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │   │
│  │  │   Camera     │ →  │  YOLOv8n     │ →  │  Detection   │          │   │
│  │  │   Frame      │    │  CoreML/     │    │  Results     │          │   │
│  │  │              │    │  TFLite      │    │  (instant)   │          │   │
│  │  └──────────────┘    └──────────────┘    └──────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼ (background sync)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LEARNING DATA COLLECTOR                          │   │
│  │  • User corrections (label edits)                                   │   │
│  │  • Confirmed detections                                             │   │
│  │  • Property assignments (color, brand, etc.)                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ HTTPS (batched, background)
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LEARNING SERVER (Self-Hosted)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Ollama + LLaVA/Qwen2-VL                          │   │
│  │  • Multimodal vision-language model                                 │   │
│  │  • Fine-tunable on home inventory data                             │   │
│  │  • Property extraction (color, brand, material)                     │   │
│  │  • Product recommendations (future)                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    TRAINING DATA PIPELINE                           │   │
│  │  • Collect user corrections                                         │   │
│  │  • Generate training pairs (image + corrected label)                │   │
│  │  • Periodic fine-tuning (LoRA)                                      │   │
│  │  • Model improvement metrics                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Week 1: On-Device Detection (Both Platforms)

### Day 1-2: Model Preparation

#### Task 1.1: Export YOLOv8n for Mobile
```bash
# Export to CoreML (iOS)
yolo export model=yolov8n.pt format=coreml nms=True

# Export to TFLite (Android)
yolo export model=yolov8n.pt format=tflite
```

**Model Selection Rationale:**
| Model | Size | Latency (iPhone 15) | Latency (Pixel 7) | mAP |
|-------|------|---------------------|-------------------|-----|
| YOLOv8n | 6MB | 15ms | 25ms | 37.3 |
| YOLOv8s | 22MB | 35ms | 60ms | 44.9 |
| YOLOv8m | 52MB | 80ms | 150ms | 50.2 |

**Recommendation:** Start with YOLOv8n for instant detection, upgrade later if needed.

#### Task 1.2: Custom Home Object Classes
Instead of generic COCO classes, create a focused home inventory class set:

```python
HOME_CLASSES = [
    # Furniture (30 classes)
    "sofa", "armchair", "dining_chair", "office_chair", "stool",
    "dining_table", "coffee_table", "side_table", "desk", "nightstand",
    "bed", "wardrobe", "dresser", "bookshelf", "tv_stand",
    "cabinet", "shoe_rack", "coat_rack", "ottoman", "bench",

    # Electronics (20 classes)
    "television", "laptop", "desktop_computer", "monitor", "tablet",
    "smartphone", "speaker", "headphones", "camera", "game_console",
    "router", "smart_speaker", "smart_display", "printer", "keyboard",

    # Kitchen (25 classes)
    "refrigerator", "microwave", "toaster", "coffee_maker", "blender",
    "mixer", "instant_pot", "air_fryer", "kettle", "dishwasher",
    "oven", "stovetop", "cutting_board", "knife_block", "pot",
    "pan", "dish", "glass", "mug", "utensil",

    # Decor (15 classes)
    "lamp", "ceiling_light", "candle", "vase", "plant",
    "picture_frame", "mirror", "clock", "rug", "curtain",
    "pillow", "blanket", "basket", "sculpture", "art",

    # Storage (10 classes)
    "box", "bin", "drawer", "shelf", "trunk",
    "safe", "filing_cabinet", "organizer", "rack", "hook",
]  # Total: 100 focused classes
```

### Day 3-4: iOS CoreML Integration

#### Task 1.3: Create iOS Platform Channel
```swift
// ios/Runner/LocalDetector.swift
import CoreML
import Vision
import Flutter

class LocalDetector {
    private var model: VNCoreMLModel?

    init() {
        loadModel()
    }

    private func loadModel() {
        guard let modelURL = Bundle.main.url(forResource: "yolov8n", withExtension: "mlmodelc") else {
            return
        }

        do {
            let mlModel = try MLModel(contentsOf: modelURL)
            model = try VNCoreMLModel(for: mlModel)
        } catch {
            print("Failed to load CoreML model: \(error)")
        }
    }

    func detect(image: UIImage, completion: @escaping ([[String: Any]]) -> Void) {
        guard let model = model, let cgImage = image.cgImage else {
            completion([])
            return
        }

        let request = VNCoreMLRequest(model: model) { request, error in
            guard let results = request.results as? [VNRecognizedObjectObservation] else {
                completion([])
                return
            }

            let detections = results.map { observation -> [String: Any] in
                let bbox = observation.boundingBox
                return [
                    "label": observation.labels.first?.identifier ?? "unknown",
                    "confidence": observation.labels.first?.confidence ?? 0,
                    "x": bbox.origin.x,
                    "y": 1 - bbox.origin.y - bbox.height, // Flip Y
                    "width": bbox.width,
                    "height": bbox.height
                ]
            }

            DispatchQueue.main.async {
                completion(detections)
            }
        }

        request.imageCropAndScaleOption = .scaleFill

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        DispatchQueue.global(qos: .userInitiated).async {
            try? handler.perform([request])
        }
    }
}
```

#### Task 1.4: Flutter Method Channel (iOS)
```dart
// lib/core/detection/local_detector_ios.dart
import 'package:flutter/services.dart';

class LocalDetectorIOS {
  static const _channel = MethodChannel('com.allmythings/local_detector');

  Future<List<Detection>> detect(Uint8List imageBytes) async {
    final result = await _channel.invokeMethod('detect', {
      'image': imageBytes,
    });

    return (result as List).map((d) => Detection(
      label: d['label'],
      confidence: d['confidence'],
      boundingBox: BoundingBox(
        x: d['x'],
        y: d['y'],
        width: d['width'],
        height: d['height'],
      ),
    )).toList();
  }
}
```

### Day 5-6: Android TFLite Integration

#### Task 1.5: Create Android Platform Channel
```kotlin
// android/app/src/main/kotlin/com/allmythings/LocalDetector.kt
package com.allmythings

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder

class LocalDetector(private val context: Context) {
    private var interpreter: Interpreter? = null
    private var gpuDelegate: GpuDelegate? = null

    private val inputSize = 640
    private val numClasses = 100

    init {
        loadModel()
    }

    private fun loadModel() {
        val modelBuffer = context.assets.open("yolov8n.tflite").use {
            it.readBytes()
        }

        val options = Interpreter.Options().apply {
            setNumThreads(4)
            // Try GPU acceleration
            try {
                gpuDelegate = GpuDelegate()
                addDelegate(gpuDelegate)
            } catch (e: Exception) {
                // Fall back to CPU
            }
        }

        interpreter = Interpreter(ByteBuffer.wrap(modelBuffer), options)
    }

    fun detect(bitmap: Bitmap): List<Map<String, Any>> {
        val input = preprocessBitmap(bitmap)
        val output = Array(1) { Array(25200) { FloatArray(numClasses + 5) } }

        interpreter?.run(input, output)

        return postprocess(output[0], bitmap.width, bitmap.height)
    }

    private fun preprocessBitmap(bitmap: Bitmap): ByteBuffer {
        val resized = Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)
        val buffer = ByteBuffer.allocateDirect(1 * inputSize * inputSize * 3 * 4)
        buffer.order(ByteOrder.nativeOrder())

        val pixels = IntArray(inputSize * inputSize)
        resized.getPixels(pixels, 0, inputSize, 0, 0, inputSize, inputSize)

        for (pixel in pixels) {
            buffer.putFloat(((pixel shr 16) and 0xFF) / 255f) // R
            buffer.putFloat(((pixel shr 8) and 0xFF) / 255f)  // G
            buffer.putFloat((pixel and 0xFF) / 255f)          // B
        }

        return buffer
    }

    private fun postprocess(output: Array<FloatArray>, imgW: Int, imgH: Int): List<Map<String, Any>> {
        val detections = mutableListOf<Map<String, Any>>()

        for (i in output.indices) {
            val confidence = output[i][4]
            if (confidence < 0.25f) continue

            val classScores = output[i].sliceArray(5 until output[i].size)
            val classId = classScores.indices.maxByOrNull { classScores[it] } ?: continue
            val classScore = classScores[classId]

            if (classScore < 0.25f) continue

            val x = output[i][0] / inputSize
            val y = output[i][1] / inputSize
            val w = output[i][2] / inputSize
            val h = output[i][3] / inputSize

            detections.add(mapOf(
                "label" to HOME_CLASSES[classId],
                "confidence" to (confidence * classScore).toDouble(),
                "x" to (x - w / 2).toDouble(),
                "y" to (y - h / 2).toDouble(),
                "width" to w.toDouble(),
                "height" to h.toDouble()
            ))
        }

        return nms(detections, 0.5f)
    }
}
```

### Day 7: Unified Flutter Interface

#### Task 1.6: Platform-Agnostic Detection Service
```dart
// lib/core/detection/local_detection_service.dart
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class LocalDetectionService {
  static const _channel = MethodChannel('com.allmythings/local_detector');

  /// Detect objects in image using on-device ML
  /// Returns detections in <15ms on iOS, <25ms on Android
  Future<List<Detection>> detectObjects(Uint8List imageBytes) async {
    try {
      final result = await _channel.invokeMethod<List>('detect', {
        'image': imageBytes,
      });

      if (result == null) return [];

      return result.map((d) {
        final map = Map<String, dynamic>.from(d);
        return Detection(
          id: UniqueKey().toString(),
          label: map['label'] as String,
          confidence: (map['confidence'] as num).toDouble(),
          boundingBox: BoundingBox(
            x: (map['x'] as num).toDouble(),
            y: (map['y'] as num).toDouble(),
            width: (map['width'] as num).toDouble(),
            height: (map['height'] as num).toDouble(),
          ),
          source: DetectionSource.onDevice,
        );
      }).toList();
    } catch (e) {
      debugPrint('Local detection failed: $e');
      return [];
    }
  }

  /// Check if on-device detection is available
  Future<bool> isAvailable() async {
    try {
      return await _channel.invokeMethod<bool>('isAvailable') ?? false;
    } catch (e) {
      return false;
    }
  }

  /// Get model info (version, size, classes)
  Future<ModelInfo> getModelInfo() async {
    final result = await _channel.invokeMethod<Map>('getModelInfo');
    return ModelInfo.fromMap(Map<String, dynamic>.from(result ?? {}));
  }
}

enum DetectionSource {
  onDevice,
  cloudFallback,
}

class ModelInfo {
  final String version;
  final int sizeBytes;
  final int classCount;
  final DateTime lastUpdated;

  ModelInfo({
    required this.version,
    required this.sizeBytes,
    required this.classCount,
    required this.lastUpdated,
  });

  factory ModelInfo.fromMap(Map<String, dynamic> map) {
    return ModelInfo(
      version: map['version'] ?? '1.0.0',
      sizeBytes: map['sizeBytes'] ?? 0,
      classCount: map['classCount'] ?? 100,
      lastUpdated: DateTime.tryParse(map['lastUpdated'] ?? '') ?? DateTime.now(),
    );
  }
}
```

---

## Week 2: Self-Hosted Learning LLM

### Day 8-9: Ollama Setup with Vision Model

#### Task 2.1: Deploy Ollama with LLaVA
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull LLaVA (vision-language model)
ollama pull llava:13b

# Or use Qwen2-VL for better accuracy
ollama pull qwen2-vl:7b
```

#### Task 2.2: Create Learning Server
```python
# learning-server/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import ollama
import base64
from PIL import Image
import io
from pydantic import BaseModel
from typing import List, Optional
import json
from datetime import datetime

app = FastAPI(title="Home Inventory Learning Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Training data storage
TRAINING_DATA_PATH = "/data/training"
CORRECTIONS_PATH = "/data/corrections"

class Detection(BaseModel):
    label: str
    confidence: float
    x: float
    y: float
    width: float
    height: float

class CorrectionFeedback(BaseModel):
    image_id: str
    original_detections: List[Detection]
    corrected_detections: List[Detection]
    user_id: Optional[str] = None
    timestamp: Optional[datetime] = None

class PropertyRequest(BaseModel):
    image_base64: str
    detections: List[Detection]

class PropertyResponse(BaseModel):
    detections: List[dict]  # Enhanced with properties

@app.post("/api/v1/enrich-properties")
async def enrich_properties(request: PropertyRequest) -> PropertyResponse:
    """
    Use LLaVA/Qwen2-VL to extract properties from detected objects.
    Properties: color, material, brand, style, era, condition
    """
    prompt = """Analyze this image and provide detailed properties for each detected object.

Detected objects and their bounding boxes:
{}

For each object, provide:
- color: Primary color(s)
- material: What it's made of (wood, metal, fabric, plastic, etc.)
- brand: If identifiable
- style: Design style (modern, vintage, industrial, minimalist, etc.)
- era: Approximate age/period
- condition: new, good, fair, worn

Respond in JSON format:
[{{"label": "...", "color": "...", "material": "...", "brand": "...", "style": "...", "era": "...", "condition": "..."}}]
"""

    detections_text = "\n".join([
        f"- {d.label} at ({d.x:.2f}, {d.y:.2f}, {d.width:.2f}, {d.height:.2f})"
        for d in request.detections
    ])

    response = ollama.chat(
        model='llava:13b',  # or 'qwen2-vl:7b'
        messages=[{
            'role': 'user',
            'content': prompt.format(detections_text),
            'images': [request.image_base64]
        }]
    )

    try:
        # Parse JSON from LLM response
        result_text = response['message']['content']
        # Extract JSON from response
        json_start = result_text.find('[')
        json_end = result_text.rfind(']') + 1
        properties = json.loads(result_text[json_start:json_end])

        # Merge properties with original detections
        enriched = []
        for i, det in enumerate(request.detections):
            props = properties[i] if i < len(properties) else {}
            enriched.append({
                **det.dict(),
                'properties': {
                    'color': props.get('color', 'unknown'),
                    'material': props.get('material', 'unknown'),
                    'brand': props.get('brand', None),
                    'style': props.get('style', 'unknown'),
                    'era': props.get('era', 'unknown'),
                    'condition': props.get('condition', 'unknown'),
                }
            })

        return PropertyResponse(detections=enriched)

    except Exception as e:
        # Return original detections if enrichment fails
        return PropertyResponse(
            detections=[{**d.dict(), 'properties': {}} for d in request.detections]
        )

@app.post("/api/v1/submit-correction")
async def submit_correction(correction: CorrectionFeedback):
    """
    Collect user corrections for future model training.
    These corrections help the model learn from mistakes.
    """
    correction.timestamp = datetime.utcnow()

    # Store correction for training
    correction_file = f"{CORRECTIONS_PATH}/{correction.image_id}.json"
    with open(correction_file, 'w') as f:
        json.dump(correction.dict(), f, default=str)

    return {"status": "received", "corrections_count": len(correction.corrected_detections)}

@app.post("/api/v1/identify-unknown")
async def identify_unknown(image: UploadFile = File(...)):
    """
    When on-device detection fails or is uncertain,
    use LLaVA to identify the object.
    """
    image_bytes = await image.read()
    image_b64 = base64.b64encode(image_bytes).decode()

    prompt = """What objects do you see in this image?
Focus on home inventory items like furniture, electronics, appliances, decor.

For each object, provide:
- label: What the object is
- confidence: How certain you are (0-1)
- location: Where in the image (top-left, center, bottom-right, etc.)

Respond in JSON format."""

    response = ollama.chat(
        model='llava:13b',
        messages=[{
            'role': 'user',
            'content': prompt,
            'images': [image_b64]
        }]
    )

    return {"identifications": response['message']['content']}

@app.get("/api/v1/training-stats")
async def get_training_stats():
    """Get statistics about collected training data"""
    import os

    corrections_count = len(os.listdir(CORRECTIONS_PATH)) if os.path.exists(CORRECTIONS_PATH) else 0

    return {
        "total_corrections": corrections_count,
        "ready_for_training": corrections_count >= 100,
        "next_training_threshold": 100,
        "model_version": "1.0.0",
        "last_training": None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

### Day 10-11: Learning Data Pipeline

#### Task 2.3: Create Training Data Collector
```python
# learning-server/training_pipeline.py
import os
import json
from pathlib import Path
from typing import List, Dict
import shutil
from datetime import datetime

class TrainingDataCollector:
    """Collects and prepares training data from user corrections"""

    def __init__(self, data_dir: str = "/data"):
        self.corrections_dir = Path(data_dir) / "corrections"
        self.training_dir = Path(data_dir) / "training"
        self.images_dir = Path(data_dir) / "images"

        for d in [self.corrections_dir, self.training_dir, self.images_dir]:
            d.mkdir(parents=True, exist_ok=True)

    def add_correction(self, image_id: str, image_bytes: bytes,
                       original: List[Dict], corrected: List[Dict]):
        """Store a user correction for training"""

        # Save image
        image_path = self.images_dir / f"{image_id}.jpg"
        with open(image_path, 'wb') as f:
            f.write(image_bytes)

        # Save correction
        correction = {
            "image_id": image_id,
            "image_path": str(image_path),
            "original_detections": original,
            "corrected_detections": corrected,
            "timestamp": datetime.utcnow().isoformat(),
            "processed": False
        }

        correction_path = self.corrections_dir / f"{image_id}.json"
        with open(correction_path, 'w') as f:
            json.dump(correction, f, indent=2)

    def prepare_training_batch(self, batch_size: int = 100) -> Path:
        """Prepare a batch of corrections for YOLO fine-tuning"""

        # Get unprocessed corrections
        corrections = []
        for f in self.corrections_dir.glob("*.json"):
            with open(f) as file:
                data = json.load(file)
                if not data.get("processed"):
                    corrections.append(data)

        if len(corrections) < batch_size:
            raise ValueError(f"Need {batch_size} corrections, only have {len(corrections)}")

        # Create YOLO training format
        batch_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        batch_dir = self.training_dir / batch_id
        images_out = batch_dir / "images"
        labels_out = batch_dir / "labels"

        images_out.mkdir(parents=True)
        labels_out.mkdir(parents=True)

        for correction in corrections[:batch_size]:
            # Copy image
            src_img = Path(correction["image_path"])
            dst_img = images_out / src_img.name
            shutil.copy(src_img, dst_img)

            # Create YOLO label file
            label_path = labels_out / f"{src_img.stem}.txt"
            with open(label_path, 'w') as f:
                for det in correction["corrected_detections"]:
                    # YOLO format: class_id center_x center_y width height
                    class_id = self.get_class_id(det["label"])
                    cx = det["x"] + det["width"] / 2
                    cy = det["y"] + det["height"] / 2
                    f.write(f"{class_id} {cx} {cy} {det['width']} {det['height']}\n")

            # Mark as processed
            correction["processed"] = True
            correction_path = self.corrections_dir / f"{correction['image_id']}.json"
            with open(correction_path, 'w') as f:
                json.dump(correction, f, indent=2)

        # Create data.yaml for training
        data_yaml = batch_dir / "data.yaml"
        with open(data_yaml, 'w') as f:
            f.write(f"""
path: {batch_dir}
train: images
val: images
names: {self.get_class_names()}
""")

        return batch_dir

    def get_class_id(self, label: str) -> int:
        """Map label to class ID"""
        classes = self.get_class_names()
        return classes.index(label) if label in classes else 0

    def get_class_names(self) -> List[str]:
        """Get list of class names"""
        return [
            "sofa", "armchair", "dining_chair", "office_chair", "stool",
            "dining_table", "coffee_table", "side_table", "desk", "nightstand",
            # ... (full 100 classes)
        ]


class ModelTrainer:
    """Fine-tune YOLO model on collected corrections"""

    def __init__(self, base_model: str = "yolov8n.pt"):
        self.base_model = base_model

    def train(self, data_dir: Path, epochs: int = 10) -> str:
        """Fine-tune model using LoRA for efficiency"""
        from ultralytics import YOLO

        model = YOLO(self.base_model)

        results = model.train(
            data=str(data_dir / "data.yaml"),
            epochs=epochs,
            imgsz=640,
            batch=16,
            device='mps',  # or 'cuda' for NVIDIA
            project=str(data_dir),
            name='fine_tuned',
            exist_ok=True,
            # LoRA-style efficient training
            freeze=10,  # Freeze first 10 layers
            lr0=0.001,
            lrf=0.01,
        )

        # Export fine-tuned model
        best_model = data_dir / "fine_tuned" / "weights" / "best.pt"

        # Export to mobile formats
        model = YOLO(str(best_model))
        model.export(format='coreml', nms=True)
        model.export(format='tflite')

        return str(best_model)
```

### Day 12-13: Mobile App Integration

#### Task 2.4: Update Mobile App for Learning
```dart
// lib/data/repositories/learning_repository.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class LearningRepository {
  final String _serverUrl;

  LearningRepository({required String serverUrl}) : _serverUrl = serverUrl;

  /// Submit user correction to learning server
  Future<void> submitCorrection({
    required String imageId,
    required List<Detection> originalDetections,
    required List<Detection> correctedDetections,
    required Uint8List imageBytes,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_serverUrl/api/v1/submit-correction'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'image_id': imageId,
          'image_base64': base64Encode(imageBytes),
          'original_detections': originalDetections.map((d) => d.toJson()).toList(),
          'corrected_detections': correctedDetections.map((d) => d.toJson()).toList(),
        }),
      );

      if (response.statusCode != 200) {
        throw Exception('Failed to submit correction');
      }
    } catch (e) {
      // Queue for later sync if offline
      await _queueForSync(imageId, originalDetections, correctedDetections, imageBytes);
    }
  }

  /// Enrich detections with properties from LLM
  Future<List<Detection>> enrichWithProperties({
    required List<Detection> detections,
    required Uint8List imageBytes,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_serverUrl/api/v1/enrich-properties'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'image_base64': base64Encode(imageBytes),
          'detections': detections.map((d) => d.toJson()).toList(),
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return (data['detections'] as List)
            .map((d) => Detection.fromJsonWithProperties(d))
            .toList();
      }
    } catch (e) {
      // Return original detections if enrichment fails
    }

    return detections;
  }

  /// Check for model updates
  Future<ModelUpdateInfo?> checkForModelUpdate(String currentVersion) async {
    try {
      final response = await http.get(
        Uri.parse('$_serverUrl/api/v1/model-info'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['version'] != currentVersion) {
          return ModelUpdateInfo(
            version: data['version'],
            downloadUrl: data['download_url'],
            sizeBytes: data['size_bytes'],
            improvements: List<String>.from(data['improvements'] ?? []),
          );
        }
      }
    } catch (e) {
      // Ignore update check failures
    }

    return null;
  }

  Future<void> _queueForSync(
    String imageId,
    List<Detection> original,
    List<Detection> corrected,
    Uint8List imageBytes,
  ) async {
    // Store in local database for later sync
    // Implementation using Drift
  }
}
```

---

## Week 3: Integration & Polish

### Day 14-15: Real-time Detection UI

#### Task 3.1: Camera Preview with Live Detection
```dart
// lib/presentation/camera/live_detection_screen.dart
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class LiveDetectionScreen extends ConsumerStatefulWidget {
  const LiveDetectionScreen({super.key});

  @override
  ConsumerState<LiveDetectionScreen> createState() => _LiveDetectionScreenState();
}

class _LiveDetectionScreenState extends ConsumerState<LiveDetectionScreen> {
  CameraController? _cameraController;
  List<Detection> _detections = [];
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    final cameras = await availableCameras();
    _cameraController = CameraController(
      cameras.first,
      ResolutionPreset.high,
      enableAudio: false,
    );

    await _cameraController!.initialize();

    // Start streaming frames for detection
    _cameraController!.startImageStream(_processFrame);

    setState(() {});
  }

  void _processFrame(CameraImage image) async {
    if (_isProcessing) return;
    _isProcessing = true;

    try {
      // Convert camera image to bytes
      final bytes = await _convertCameraImage(image);

      // Run on-device detection
      final detector = ref.read(localDetectionServiceProvider);
      final detections = await detector.detectObjects(bytes);

      setState(() {
        _detections = detections;
      });
    } finally {
      _isProcessing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      body: Stack(
        children: [
          // Camera preview
          CameraPreview(_cameraController!),

          // Detection overlays
          CustomPaint(
            painter: DetectionOverlayPainter(
              detections: _detections,
              imageSize: Size(
                _cameraController!.value.previewSize!.height,
                _cameraController!.value.previewSize!.width,
              ),
            ),
            size: Size.infinite,
          ),

          // Capture button
          Positioned(
            bottom: 32,
            left: 0,
            right: 0,
            child: Center(
              child: FloatingActionButton.large(
                onPressed: _captureAndSave,
                child: const Icon(Icons.camera),
              ),
            ),
          ),

          // Detection count
          Positioned(
            top: MediaQuery.of(context).padding.top + 16,
            left: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                '${_detections.length} objects detected',
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _captureAndSave() async {
    // Take photo
    final image = await _cameraController!.takePicture();
    final bytes = await image.readAsBytes();

    // Final detection on high-res image
    final detector = ref.read(localDetectionServiceProvider);
    final detections = await detector.detectObjects(bytes);

    // Enrich with properties (background)
    final learningRepo = ref.read(learningRepositoryProvider);
    final enrichedDetections = await learningRepo.enrichWithProperties(
      detections: detections,
      imageBytes: bytes,
    );

    // Navigate to results
    context.push('/detection-results', extra: {
      'image': bytes,
      'detections': enrichedDetections,
    });
  }
}
```

### Day 16-17: User Correction Flow

#### Task 3.2: Edit Detection UI
```dart
// lib/presentation/detection/edit_detection_screen.dart
class EditDetectionScreen extends ConsumerStatefulWidget {
  final Detection detection;
  final Uint8List imageBytes;

  const EditDetectionScreen({
    super.key,
    required this.detection,
    required this.imageBytes,
  });

  @override
  ConsumerState<EditDetectionScreen> createState() => _EditDetectionScreenState();
}

class _EditDetectionScreenState extends ConsumerState<EditDetectionScreen> {
  late TextEditingController _labelController;
  late Detection _editedDetection;

  @override
  void initState() {
    super.initState();
    _editedDetection = widget.detection;
    _labelController = TextEditingController(text: widget.detection.label);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit Detection'),
        actions: [
          TextButton(
            onPressed: _saveCorrection,
            child: const Text('Save'),
          ),
        ],
      ),
      body: Column(
        children: [
          // Image with bounding box
          Expanded(
            flex: 2,
            child: Stack(
              children: [
                Image.memory(widget.imageBytes, fit: BoxFit.contain),
                // Draggable/resizable bounding box
                BoundingBoxEditor(
                  detection: _editedDetection,
                  onChanged: (updated) {
                    setState(() {
                      _editedDetection = updated;
                    });
                  },
                ),
              ],
            ),
          ),

          // Label editor
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Label', style: TextStyle(fontWeight: FontWeight.bold)),
                  TextField(
                    controller: _labelController,
                    decoration: const InputDecoration(
                      hintText: 'e.g., Velvet Sofa',
                    ),
                    onChanged: (value) {
                      _editedDetection = _editedDetection.copyWith(label: value);
                    },
                  ),

                  const SizedBox(height: 16),

                  // Suggested labels based on similar items
                  const Text('Suggestions', style: TextStyle(fontWeight: FontWeight.bold)),
                  Wrap(
                    spacing: 8,
                    children: [
                      'Sofa', 'Couch', 'Sectional', 'Loveseat', 'Armchair'
                    ].map((label) => ActionChip(
                      label: Text(label),
                      onPressed: () {
                        _labelController.text = label;
                        _editedDetection = _editedDetection.copyWith(label: label);
                      },
                    )).toList(),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveCorrection() async {
    final learningRepo = ref.read(learningRepositoryProvider);

    // Submit correction for model learning
    await learningRepo.submitCorrection(
      imageId: widget.detection.id,
      originalDetections: [widget.detection],
      correctedDetections: [_editedDetection],
      imageBytes: widget.imageBytes,
    );

    // Update local inventory
    final inventoryRepo = ref.read(inventoryRepositoryProvider);
    await inventoryRepo.updateDetection(_editedDetection);

    context.pop(_editedDetection);
  }
}
```

### Day 18-19: Testing & Optimization

#### Task 3.3: Performance Benchmarks
```dart
// test/performance/detection_benchmark_test.dart
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('On-Device Detection Performance', () {
    late LocalDetectionService detector;
    late Uint8List testImage;

    setUpAll(() async {
      detector = LocalDetectionService();
      testImage = await loadTestImage('living_room.jpg');
    });

    test('should detect in under 50ms on device', () async {
      final stopwatch = Stopwatch()..start();

      final detections = await detector.detectObjects(testImage);

      stopwatch.stop();

      expect(stopwatch.elapsedMilliseconds, lessThan(50));
      expect(detections, isNotEmpty);
    });

    test('should handle 30 fps processing', () async {
      final times = <int>[];

      for (var i = 0; i < 30; i++) {
        final stopwatch = Stopwatch()..start();
        await detector.detectObjects(testImage);
        stopwatch.stop();
        times.add(stopwatch.elapsedMilliseconds);
      }

      final avgTime = times.reduce((a, b) => a + b) / times.length;
      expect(avgTime, lessThan(33)); // 30 fps = 33ms per frame
    });

    test('should detect common home objects', () async {
      final testCases = [
        ('sofa.jpg', 'sofa'),
        ('dining_table.jpg', 'dining_table'),
        ('television.jpg', 'television'),
        ('refrigerator.jpg', 'refrigerator'),
      ];

      for (final (imageName, expectedLabel) in testCases) {
        final image = await loadTestImage(imageName);
        final detections = await detector.detectObjects(image);

        expect(
          detections.any((d) => d.label.toLowerCase().contains(expectedLabel)),
          isTrue,
          reason: 'Should detect $expectedLabel in $imageName',
        );
      }
    });
  });
}
```

---

## Deliverables Summary

### Week 1 Deliverables
- [ ] YOLOv8n exported to CoreML and TFLite
- [ ] iOS LocalDetector with CoreML
- [ ] Android LocalDetector with TFLite
- [ ] Unified Flutter detection service
- [ ] Detection latency < 25ms

### Week 2 Deliverables
- [ ] Ollama server with LLaVA/Qwen2-VL
- [ ] Property enrichment endpoint
- [ ] Correction collection endpoint
- [ ] Training data pipeline
- [ ] Model fine-tuning capability

### Week 3 Deliverables
- [ ] Live camera detection UI
- [ ] User correction flow
- [ ] Background sync to learning server
- [ ] Performance benchmarks
- [ ] Model update mechanism

---

## Future Roadmap (Post-MVP)

### Phase 2: Product Intelligence
- Product identification (Amazon, IKEA, etc.)
- Price estimation
- Replacement suggestions
- Similar product recommendations

### Phase 3: Smart Home Integration
- Room organization suggestions
- Interior design recommendations
- Space optimization
- Furniture placement AI

### Phase 4: Marketplace
- Sell items directly
- Find used alternatives
- Price comparison
- Donation suggestions
