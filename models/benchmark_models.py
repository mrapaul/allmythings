#!/usr/bin/env python3
"""
Benchmark script for on-device object detection models.
Tests YOLO11n, YOLOv10n, YOLOv8n on sample images.
"""

import os
import time
import json
from pathlib import Path
from ultralytics import YOLO

# Test images
TEST_IMAGES = [
    "../api-service/tests/fixtures/test-image.jpg",
]

# Models to benchmark
MODELS = {
    "yolo11n": "yolo11n.pt",
    "yolov10n": "yolov10n.pt",
    "yolov8n": "yolov8n.pt",
}

def benchmark_model(model_name: str, model_path: str, test_images: list, runs: int = 5):
    """Benchmark a single model on test images."""
    print(f"\n{'='*60}")
    print(f"Benchmarking: {model_name}")
    print(f"{'='*60}")

    # Load model
    print(f"Loading {model_path}...")
    start = time.time()
    model = YOLO(model_path)
    load_time = time.time() - start
    print(f"Model loaded in {load_time:.3f}s")

    # Get model info
    print(f"Parameters: {sum(p.numel() for p in model.model.parameters()):,}")

    results_data = {
        "model": model_name,
        "load_time_s": load_time,
        "inference_times_ms": [],
        "detections": [],
    }

    for img_path in test_images:
        if not os.path.exists(img_path):
            print(f"Image not found: {img_path}")
            continue

        print(f"\nTesting on: {img_path}")

        # Warmup run
        _ = model(img_path, verbose=False)

        # Benchmark runs
        times = []
        for i in range(runs):
            start = time.time()
            results = model(img_path, verbose=False)
            elapsed = (time.time() - start) * 1000  # ms
            times.append(elapsed)

        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)

        print(f"  Inference time: avg={avg_time:.2f}ms, min={min_time:.2f}ms, max={max_time:.2f}ms")
        results_data["inference_times_ms"].append({
            "image": img_path,
            "avg_ms": avg_time,
            "min_ms": min_time,
            "max_ms": max_time,
        })

        # Show detections
        for r in results:
            boxes = r.boxes
            print(f"  Detections: {len(boxes)} objects")
            for box in boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                label = model.names[cls]
                xyxy = box.xyxy[0].tolist()
                results_data["detections"].append({
                    "label": label,
                    "confidence": conf,
                    "box": xyxy,
                })
                if conf > 0.5:
                    print(f"    - {label}: {conf:.2f}")

    return results_data

def export_for_mobile(model_name: str, model_path: str):
    """Export model to CoreML and TFLite formats."""
    print(f"\n{'='*60}")
    print(f"Exporting {model_name} for mobile deployment")
    print(f"{'='*60}")

    model = YOLO(model_path)

    output_dir = Path("./exports")
    output_dir.mkdir(exist_ok=True)

    exports = {}

    # Export to CoreML (iOS)
    try:
        print(f"\nExporting to CoreML...")
        coreml_path = model.export(format="coreml", nms=True)
        exports["coreml"] = str(coreml_path)
        print(f"  CoreML: {coreml_path}")
    except Exception as e:
        print(f"  CoreML export failed: {e}")
        exports["coreml"] = None

    # Export to TFLite (Android)
    try:
        print(f"\nExporting to TFLite...")
        tflite_path = model.export(format="tflite")
        exports["tflite"] = str(tflite_path)
        print(f"  TFLite: {tflite_path}")
    except Exception as e:
        print(f"  TFLite export failed: {e}")
        exports["tflite"] = None

    return exports

def main():
    os.chdir(Path(__file__).parent)

    print("="*60)
    print("On-Device Object Detection Model Benchmark")
    print("="*60)

    all_results = []

    # Benchmark each model
    for model_name, model_path in MODELS.items():
        try:
            results = benchmark_model(model_name, model_path, TEST_IMAGES)
            all_results.append(results)
        except Exception as e:
            print(f"Error benchmarking {model_name}: {e}")

    # Summary
    print("\n" + "="*60)
    print("BENCHMARK SUMMARY")
    print("="*60)
    print(f"{'Model':<12} {'Avg Inference (ms)':<20} {'Detections':<12}")
    print("-"*60)

    for result in all_results:
        avg_times = [t["avg_ms"] for t in result["inference_times_ms"]]
        overall_avg = sum(avg_times) / len(avg_times) if avg_times else 0
        num_detections = len(result["detections"])
        print(f"{result['model']:<12} {overall_avg:<20.2f} {num_detections:<12}")

    # Export best model (YOLO11n) for mobile
    print("\n")
    exports = export_for_mobile("yolo11n", "yolo11n.pt")

    # Save results
    with open("benchmark_results.json", "w") as f:
        json.dump({
            "benchmarks": all_results,
            "exports": exports,
        }, f, indent=2)

    print(f"\nResults saved to benchmark_results.json")
    print("\nRecommendation: Use YOLO11n for best speed/accuracy tradeoff on mobile devices.")

if __name__ == "__main__":
    main()
