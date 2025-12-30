#!/usr/bin/env python3
"""
Export YOLO models for mobile deployment.
Creates CoreML for iOS and TFLite for Android.

Prerequisites:
  pip install ultralytics>=8.3.0
"""

import shutil
import json
import subprocess
from pathlib import Path

def check_ultralytics():
    """Check if ultralytics is installed."""
    try:
        from ultralytics import YOLO
        return True
    except ImportError:
        print("ERROR: ultralytics not installed.")
        print("Run: pip install ultralytics>=8.3.0")
        return False

def export_coreml(model, output_dir: Path, model_name: str) -> dict:
    """Export model to CoreML format for iOS."""
    print(f"\n[iOS] Exporting {model_name} to CoreML...")

    try:
        # Export with NMS (Non-Maximum Suppression) included
        coreml_path = model.export(
            format="coreml",
            nms=True,
            imgsz=640,
        )

        output_path = output_dir / f"{model_name}.mlpackage"
        if Path(coreml_path).exists():
            if output_path.exists():
                shutil.rmtree(output_path)
            shutil.copytree(coreml_path, output_path)

            # Get file size
            size_mb = sum(f.stat().st_size for f in output_path.rglob('*') if f.is_file()) / (1024 * 1024)
            print(f"  CoreML exported: {output_path} ({size_mb:.2f} MB)")

            return {
                "format": "coreml",
                "path": str(output_path),
                "size_mb": round(size_mb, 2),
                "status": "success"
            }
    except Exception as e:
        print(f"  CoreML export failed: {e}")
        return {"format": "coreml", "status": "failed", "error": str(e)}

def export_tflite(model, output_dir: Path, model_name: str) -> dict:
    """Export model to TFLite format for Android."""
    print(f"\n[Android] Exporting {model_name} to TFLite...")

    try:
        # Export to TFLite
        tflite_path = model.export(
            format="tflite",
            imgsz=640,
        )

        output_path = output_dir / f"{model_name}.tflite"
        if Path(tflite_path).exists():
            shutil.copy(tflite_path, output_path)
            size_mb = output_path.stat().st_size / (1024 * 1024)
            print(f"  TFLite exported: {output_path} ({size_mb:.2f} MB)")

            return {
                "format": "tflite",
                "path": str(output_path),
                "size_mb": round(size_mb, 2),
                "status": "success"
            }
    except Exception as e:
        print(f"  TFLite export failed: {e}")
        return {"format": "tflite", "status": "failed", "error": str(e)}

def get_class_labels(model) -> list:
    """Extract class labels from the model."""
    return list(model.names.values())

def export_labels(output_dir: Path, labels: list):
    """Export class labels to JSON for mobile apps."""
    labels_path = output_dir / "labels.json"
    with open(labels_path, 'w') as f:
        json.dump({
            "count": len(labels),
            "labels": labels
        }, f, indent=2)
    print(f"  Labels exported: {labels_path} ({len(labels)} classes)")
    return str(labels_path)

def deploy_to_mobile_app(exports: dict, project_root: Path):
    """Deploy exported models to mobile app directories."""
    mobile_app = project_root / "mobile-app"

    # Deploy CoreML to iOS
    if exports.get("coreml", {}).get("status") == "success":
        ios_dest = mobile_app / "ios" / "Runner" / "yolo11n.mlpackage"
        src = Path(exports["coreml"]["path"])
        if src.exists():
            if ios_dest.exists():
                shutil.rmtree(ios_dest)
            shutil.copytree(src, ios_dest)
            print(f"  Deployed CoreML to: {ios_dest}")

    # Deploy TFLite to Android
    if exports.get("tflite", {}).get("status") == "success":
        android_assets = mobile_app / "android" / "app" / "src" / "main" / "assets"
        android_assets.mkdir(parents=True, exist_ok=True)
        android_dest = android_assets / "yolo11n.tflite"
        src = Path(exports["tflite"]["path"])
        if src.exists():
            shutil.copy(src, android_dest)
            print(f"  Deployed TFLite to: {android_dest}")

    # Deploy labels to both platforms
    if exports.get("labels"):
        # iOS
        ios_labels = mobile_app / "ios" / "Runner" / "labels.json"
        shutil.copy(exports["labels"], ios_labels)
        print(f"  Deployed labels to iOS: {ios_labels}")

        # Android
        android_labels = mobile_app / "android" / "app" / "src" / "main" / "assets" / "labels.json"
        shutil.copy(exports["labels"], android_labels)
        print(f"  Deployed labels to Android: {android_labels}")

def main():
    if not check_ultralytics():
        return

    from ultralytics import YOLO

    # Paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    models_dir = project_root / "models"
    output_dir = models_dir / "exports"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("="*60)
    print("Mobile Model Export Tool")
    print("="*60)

    # Use YOLO11n for best mobile performance
    model_name = "yolo11n"
    model_path = models_dir / "yolo11n.pt"

    if not model_path.exists():
        print(f"Downloading {model_name}...")
        model = YOLO(model_name)  # Auto-downloads
    else:
        print(f"Loading {model_path}...")
        model = YOLO(str(model_path))

    # Get model info
    params = sum(p.numel() for p in model.model.parameters())
    print(f"Model: {model_name}")
    print(f"Parameters: {params:,}")

    # Export to both formats
    exports = {}

    # CoreML for iOS
    coreml_result = export_coreml(model, output_dir, model_name)
    exports["coreml"] = coreml_result

    # TFLite for Android
    tflite_result = export_tflite(model, output_dir, model_name)
    exports["tflite"] = tflite_result

    # Export class labels
    labels = get_class_labels(model)
    exports["labels"] = export_labels(output_dir, labels)

    # Deploy to mobile app
    print("\n" + "="*60)
    print("Deploying to mobile app...")
    print("="*60)
    deploy_to_mobile_app(exports, project_root)

    # Save export manifest
    manifest = {
        "model": model_name,
        "parameters": params,
        "exports": exports,
        "classes": len(labels)
    }
    manifest_path = output_dir / "export_manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print("\n" + "="*60)
    print("Export Summary")
    print("="*60)
    print(f"Model: {model_name}")
    print(f"Parameters: {params:,}")
    print(f"Classes: {len(labels)}")
    print(f"CoreML: {coreml_result.get('status', 'unknown')}")
    print(f"TFLite: {tflite_result.get('status', 'unknown')}")
    print(f"\nManifest saved to: {manifest_path}")

if __name__ == "__main__":
    main()
