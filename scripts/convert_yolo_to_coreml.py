#!/usr/bin/env python3
"""
Convert yolo11n.pt to yolo11n.mlpackage for iOS bundling.
Run once from the project root: python scripts/convert_yolo_to_coreml.py
Output: mobile-app/ios/Runner/yolo11n.mlpackage
"""
import shutil
from pathlib import Path

from ultralytics import YOLO

SRC = Path("detection-service/yolo11n.pt")
DST_DIR = Path("mobile-app/ios/Runner")

if not SRC.exists():
    raise FileNotFoundError(f"Source model not found: {SRC}")

DST_DIR.mkdir(parents=True, exist_ok=True)

model = YOLO(str(SRC))
# Export with NMS baked in so VNCoreMLRequest gets bounding box observations directly
export_path = model.export(
    format="coreml",
    nms=True,
    imgsz=640,
)

dst = DST_DIR / "yolo11n.mlpackage"
if dst.exists():
    shutil.rmtree(dst)
shutil.move(export_path, str(dst))
print(f"Exported to {dst}")
