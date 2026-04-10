# Hybrid Multi-Pass Detection Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve object detection from 4/30+ objects to ≥25 by implementing a two-phase hybrid pipeline: fast on-device YOLOE+SAHI pass (~500ms) and multi-pass VLM deep pass (10-15s) with SSE streaming.

**Architecture:** Phase 1 runs YOLOE-11L with SAHI tiling in the Python detection service for instant results. Phase 2 runs 5 parallel VLM calls (1 overview + 4 quadrant crops) through Gemini Flash with cascade to Gemini Pro and Claude Sonnet 4. Results are fused — fast-pass provides precise bounding boxes, deep-pass provides rich labels/attributes. SSE streams both phases to the mobile app progressively.

**Tech Stack:** Python 3.12 (FastAPI, ultralytics, sahi, PIL), Node.js 20 (Fastify, @google/generative-ai, sharp), TypeScript, Vitest, pytest

**Spec:** `docs/superpowers/specs/2026-04-10-hybrid-multipass-detection-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `detection-service/src/detection_service/sahi.py` | SAHI tiling: generate tiles, remap coordinates, NMS dedup |
| `detection-service/src/detection_service/backends/mlx_backend.py` | YOLOE-11L model loading, inference, fast_detect via SAHI |
| `detection-service/main.py` | FastAPI app with `/detect/fast` endpoint |
| `detection-service/src/detection_service/config.py` | YOLOE model path, SAHI tile settings |
| `api-service/src/services/multi-pass-vlm.classifier.ts` | Multi-pass VLM orchestration: image cropping, parallel calls, dedup, provider cascade |
| `api-service/src/services/detection-pipeline.service.ts` | Two-phase pipeline orchestration (fast + deep), SSE emission |
| `api-service/src/services/ensemble-fusion.service.ts` | `fuseFastAndDeep()` method for merging fast/deep results |
| `api-service/src/providers/gemini.classifier.ts` | Remove hardcoded categories, thin single-call VLM wrapper |
| `api-service/src/providers/claude.classifier.ts` | Claude Sonnet 4 classifier adapter |
| `api-service/src/config/env.config.ts` | Claude API key, multi-pass config |
| `api-service/src/routes/detect.route.ts` | SSE streaming + blocking mode |
| `api-service/src/app.ts` | Wire up new pipeline with Claude provider |

---

### Task 1: SAHI Tiling Utilities (Python)

**Files:**
- Create: `detection-service/src/detection_service/sahi.py`
- Test: `detection-service/tests/unit/test_sahi.py`

- [ ] **Step 1: Write failing tests for tile generation**

```python
# detection-service/tests/unit/test_sahi.py
import pytest
from detection_service.sahi import generate_tiles, remap_box_to_full, nms


def test_generate_tiles_produces_5_tiles():
    """2x2 grid + 1 full-image = 5 tiles."""
    tiles = generate_tiles(image_width=1000, image_height=800, grid=(2, 2), overlap=0.2)
    assert len(tiles) == 5


def test_tile_dimensions_with_overlap():
    """Each tile in a 2x2 grid with 20% overlap should be 60% of image size."""
    tiles = generate_tiles(image_width=1000, image_height=800, grid=(2, 2), overlap=0.2)
    # Filter out the full-image tile (index 0 by convention)
    quadrant_tiles = [t for t in tiles if not t["is_full"]]
    assert len(quadrant_tiles) == 4
    for t in quadrant_tiles:
        assert t["width"] == 600  # 1000 * 0.6
        assert t["height"] == 480  # 800 * 0.6


def test_tiles_cover_full_image():
    """Union of all tile regions should cover the full image."""
    tiles = generate_tiles(image_width=100, image_height=100, grid=(2, 2), overlap=0.2)
    # Check corners are covered by at least one quadrant tile
    quadrant_tiles = [t for t in tiles if not t["is_full"]]
    # Top-left corner (0, 0) should be in a tile
    assert any(t["x"] <= 0 and t["y"] <= 0 for t in quadrant_tiles)
    # Bottom-right corner (99, 99) should be in a tile
    assert any(t["x"] + t["width"] >= 100 and t["y"] + t["height"] >= 100 for t in quadrant_tiles)


def test_remap_box_to_full_coordinates():
    """A box at (0.1, 0.2, 0.3, 0.4) in a tile starting at (500, 0) in a 1000x800 image."""
    tile = {"x": 500, "y": 0, "width": 500, "height": 400}
    box = {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}
    remapped = remap_box_to_full(box, tile, image_width=1000, image_height=800)
    # x_abs = 500 + 0.1 * 500 = 550, normalized = 550 / 1000 = 0.55
    assert remapped["x"] == pytest.approx(0.55)
    # y_abs = 0 + 0.2 * 400 = 80, normalized = 80 / 800 = 0.1
    assert remapped["y"] == pytest.approx(0.1)
    # w_abs = 0.3 * 500 = 150, normalized = 150 / 1000 = 0.15
    assert remapped["w"] == pytest.approx(0.15)
    # h_abs = 0.4 * 400 = 160, normalized = 160 / 800 = 0.2
    assert remapped["h"] == pytest.approx(0.2)


def test_nms_removes_duplicates():
    """Two boxes with IoU > 0.5 should collapse to one, keeping highest confidence."""
    boxes = [
        {"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.3, "label": "cup", "confidence": 0.9},
        {"x": 0.12, "y": 0.12, "w": 0.28, "h": 0.28, "label": "mug", "confidence": 0.7},
    ]
    result = nms(boxes, iou_threshold=0.5)
    assert len(result) == 1
    assert result[0]["confidence"] == 0.9


def test_nms_preserves_distinct_boxes():
    """Non-overlapping boxes should all be kept."""
    boxes = [
        {"x": 0.0, "y": 0.0, "w": 0.2, "h": 0.2, "label": "a", "confidence": 0.9},
        {"x": 0.5, "y": 0.5, "w": 0.2, "h": 0.2, "label": "b", "confidence": 0.8},
        {"x": 0.0, "y": 0.5, "w": 0.2, "h": 0.2, "label": "c", "confidence": 0.7},
    ]
    result = nms(boxes, iou_threshold=0.5)
    assert len(result) == 3


def test_nms_empty_input():
    assert nms([], iou_threshold=0.5) == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run pytest tests/unit/test_sahi.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'detection_service.sahi'`

- [ ] **Step 3: Implement SAHI utilities**

```python
# detection-service/src/detection_service/sahi.py
"""SAHI tiling utilities: generate tiles, remap coordinates, NMS deduplication."""
from __future__ import annotations


def generate_tiles(
    image_width: int,
    image_height: int,
    grid: tuple[int, int] = (2, 2),
    overlap: float = 0.2,
) -> list[dict]:
    """Generate tile specs for SAHI: grid of overlapping tiles + 1 full-image tile.

    Each tile is a dict with keys: x, y, width, height, is_full.
    Coordinates are in pixel space. overlap=0.2 means each tile is 60% of the
    image dimension (50% base + 10% overlap on each side, but the outer edges
    are clamped).
    """
    cols, rows = grid
    # Tile size: base fraction + overlap fraction
    tile_w = int(image_width * (1.0 / cols + overlap))
    tile_h = int(image_height * (1.0 / rows + overlap))

    tiles: list[dict] = []

    # Full-image tile first
    tiles.append({"x": 0, "y": 0, "width": image_width, "height": image_height, "is_full": True})

    # Grid tiles
    for row in range(rows):
        for col in range(cols):
            x = int(col * image_width / cols)
            y = int(row * image_height / rows)
            # Clamp to image bounds
            x2 = min(x + tile_w, image_width)
            y2 = min(y + tile_h, image_height)
            tiles.append({"x": x, "y": y, "width": x2 - x, "height": y2 - y, "is_full": False})

    return tiles


def remap_box_to_full(
    box: dict,
    tile: dict,
    image_width: int,
    image_height: int,
) -> dict:
    """Remap a normalized box (0..1 within a tile) to normalized coords in the full image.

    Args:
        box: {"x": float, "y": float, "w": float, "h": float} in tile-local 0..1 coords
        tile: {"x": int, "y": int, "width": int, "height": int} in pixel coords
        image_width: full image width in pixels
        image_height: full image height in pixels

    Returns:
        {"x": float, "y": float, "w": float, "h": float} in full-image 0..1 coords
    """
    x_abs = tile["x"] + box["x"] * tile["width"]
    y_abs = tile["y"] + box["y"] * tile["height"]
    w_abs = box["w"] * tile["width"]
    h_abs = box["h"] * tile["height"]

    return {
        "x": x_abs / image_width,
        "y": y_abs / image_height,
        "w": w_abs / image_width,
        "h": h_abs / image_height,
    }


def _iou(a: dict, b: dict) -> float:
    """IoU between two boxes in {x, y, w, h} normalized format."""
    xa = max(a["x"], b["x"])
    ya = max(a["y"], b["y"])
    xb = min(a["x"] + a["w"], b["x"] + b["w"])
    yb = min(a["y"] + a["h"], b["y"] + b["h"])

    inter = max(0.0, xb - xa) * max(0.0, yb - ya)
    area_a = a["w"] * a["h"]
    area_b = b["w"] * b["h"]
    union = area_a + area_b - inter

    if union <= 0:
        return 0.0
    return inter / union


def nms(
    boxes: list[dict],
    iou_threshold: float = 0.5,
) -> list[dict]:
    """Non-Maximum Suppression. Each box dict must have x, y, w, h, confidence keys.

    Returns boxes sorted by confidence (descending), with overlapping duplicates removed.
    """
    if not boxes:
        return []

    sorted_boxes = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
    keep: list[dict] = []

    for box in sorted_boxes:
        is_dup = False
        for kept in keep:
            if _iou(box, kept) > iou_threshold:
                is_dup = True
                break
        if not is_dup:
            keep.append(box)

    return keep
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run pytest tests/unit/test_sahi.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add detection-service/src/detection_service/sahi.py detection-service/tests/unit/test_sahi.py && git commit -m "feat(detection-service): SAHI tiling utilities with NMS deduplication"
```

---

### Task 2: MLXBackend — YOLOE Fast Detection (Python)

**Files:**
- Modify: `detection-service/src/detection_service/backends/mlx_backend.py`
- Modify: `detection-service/src/detection_service/config.py`
- Test: `detection-service/tests/unit/test_fast_detect.py`

- [ ] **Step 1: Add YOLOE config fields**

In `detection-service/src/detection_service/config.py`, add these fields to the `Settings` class:

```python
    # YOLOE
    yoloe_model: str = "yolo11n.pt"
    yoloe_prompt: str = "object . item . thing"
    yoloe_confidence: float = 0.15
    sahi_grid_cols: int = 2
    sahi_grid_rows: int = 2
    sahi_overlap: float = 0.2
    sahi_nms_threshold: float = 0.5
```

- [ ] **Step 2: Write failing tests for fast_detect**

```python
# detection-service/tests/unit/test_fast_detect.py
import pytest
from unittest.mock import patch, MagicMock
from PIL import Image
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.backends.base import FastDetection


def _dummy_image() -> Image.Image:
    return Image.new("RGB", (1000, 800), (128, 128, 128))


def test_load_fast_models_sets_flag():
    """After load_fast_models(), _fast_loaded should be True."""
    backend = MLXBackend()
    with patch("detection_service.backends.mlx_backend.YOLO") as mock_yolo:
        mock_yolo.return_value = MagicMock()
        backend.load_fast_models()
    assert backend._fast_loaded is True
    assert backend._yoloe is not None


def test_fast_detect_returns_list_of_fast_detection():
    """fast_detect should return a list of FastDetection dataclasses."""
    backend = MLXBackend()

    # Mock the YOLO model
    mock_model = MagicMock()
    mock_result = MagicMock()
    mock_result.boxes = MagicMock()
    mock_result.boxes.xyxyn = MagicMock()
    # Simulate a tensor-like with .cpu().numpy()
    import numpy as np
    mock_result.boxes.xyxyn.cpu.return_value.numpy.return_value = np.array([
        [0.1, 0.2, 0.4, 0.6],  # x1, y1, x2, y2 normalized
    ])
    mock_result.boxes.conf.cpu.return_value.numpy.return_value = np.array([0.85])
    mock_result.names = {0: "chair"}
    mock_result.boxes.cls.cpu.return_value.numpy.return_value = np.array([0])
    mock_model.return_value = [mock_result]

    backend._yoloe = mock_model
    backend._fast_loaded = True

    detections = backend.fast_detect(_dummy_image())

    assert isinstance(detections, list)
    assert len(detections) >= 1
    assert all(isinstance(d, FastDetection) for d in detections)
    assert detections[0].source == "yoloe"


def test_fast_detect_raises_without_load():
    """Calling fast_detect before load_fast_models should raise RuntimeError."""
    backend = MLXBackend()
    with pytest.raises(RuntimeError, match="not loaded"):
        backend.fast_detect(_dummy_image())
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run pytest tests/unit/test_fast_detect.py -v
```

Expected: FAIL — `load_fast_models` raises `NotImplementedError`.

- [ ] **Step 4: Implement MLXBackend.load_fast_models and fast_detect**

Replace the entire content of `detection-service/src/detection_service/backends/mlx_backend.py`:

```python
from __future__ import annotations
import logging
from typing import Optional
import numpy as np
from PIL import Image
from ultralytics import YOLO

from .base import (
    BoundingBox, GatekeeperResult, FastDetection, VLMDetection, VLMPoint, ItemAttributes,
)
from ..config import settings
from ..sahi import generate_tiles, remap_box_to_full, nms

log = logging.getLogger(__name__)


class MLXBackend:
    """Apple Silicon inference backend using MLX + Core ML + Metal.

    Implements fast_detect using YOLOE-11L with SAHI tiling.
    """

    def __init__(self) -> None:
        self._fast_loaded = False
        self._deep_loaded = False
        self._yoloe: Optional[YOLO] = None

    def load_fast_models(self) -> None:
        """Load YOLOE model for fast detection."""
        log.info("Loading YOLOE model: %s", settings.yoloe_model)
        self._yoloe = YOLO(settings.yoloe_model)
        self._fast_loaded = True
        log.info("YOLOE model loaded successfully")

    def load_deep_models(self) -> None:
        raise NotImplementedError("Deep models not implemented in this pipeline")

    def unload_deep_models(self) -> None:
        self._deep_loaded = False

    def gatekeeper(self, image: Image.Image, accept_prompts: list[str], reject_prompts: list[str]) -> GatekeeperResult:
        raise NotImplementedError("Gatekeeper not implemented in this pipeline")

    def fast_detect(self, image: Image.Image) -> list[FastDetection]:
        """Run YOLOE with SAHI tiling for comprehensive small-object detection."""
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")

        img_w, img_h = image.size
        tiles = generate_tiles(
            image_width=img_w,
            image_height=img_h,
            grid=(settings.sahi_grid_cols, settings.sahi_grid_rows),
            overlap=settings.sahi_overlap,
        )

        all_detections: list[dict] = []

        for tile in tiles:
            # Crop the tile from the image
            if tile["is_full"]:
                tile_img = image
            else:
                tile_img = image.crop((
                    tile["x"],
                    tile["y"],
                    tile["x"] + tile["width"],
                    tile["y"] + tile["height"],
                ))

            # Run YOLOE inference on the tile
            results = self._yoloe(
                tile_img,
                conf=settings.yoloe_confidence,
                verbose=False,
            )

            if not results or len(results) == 0:
                continue

            result = results[0]
            boxes_xyxyn = result.boxes.xyxyn.cpu().numpy()
            confidences = result.boxes.conf.cpu().numpy()
            class_ids = result.boxes.cls.cpu().numpy().astype(int)

            for i in range(len(boxes_xyxyn)):
                x1, y1, x2, y2 = boxes_xyxyn[i]
                box_local = {
                    "x": float(x1),
                    "y": float(y1),
                    "w": float(x2 - x1),
                    "h": float(y2 - y1),
                }

                # Remap tile-local coordinates to full image
                if tile["is_full"]:
                    box_full = box_local
                else:
                    box_full = remap_box_to_full(box_local, tile, img_w, img_h)

                label = result.names.get(class_ids[i], "object")

                all_detections.append({
                    **box_full,
                    "label": label,
                    "confidence": float(confidences[i]),
                })

        # NMS to deduplicate across tiles
        deduped = nms(all_detections, iou_threshold=settings.sahi_nms_threshold)

        return [
            FastDetection(
                label=d["label"],
                box=BoundingBox(x=d["x"], y=d["y"], w=d["w"], h=d["h"]),
                confidence=d["confidence"],
                source="yoloe",
            )
            for d in deduped
        ]

    def embed_crop(self, crop: Image.Image) -> np.ndarray:
        raise NotImplementedError("Embeddings not implemented in this pipeline")

    def embed_text(self, text: str) -> np.ndarray:
        raise NotImplementedError("Embeddings not implemented in this pipeline")

    def vlm_enumerate(self, image: Image.Image, prompt: str) -> list[VLMDetection]:
        raise NotImplementedError("VLM not implemented in this pipeline")

    def vlm_points(self, image: Image.Image, prompt: str) -> list[VLMPoint]:
        raise NotImplementedError("VLM not implemented in this pipeline")

    def vlm_attributes(self, image: Image.Image, boxes: list[BoundingBox], prompt: str) -> list[ItemAttributes]:
        raise NotImplementedError("VLM not implemented in this pipeline")
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run pytest tests/unit/test_fast_detect.py tests/unit/test_backend_contract.py -v
```

Expected: All tests PASS (including existing backend contract tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add detection-service/src/detection_service/backends/mlx_backend.py detection-service/src/detection_service/config.py detection-service/tests/unit/test_fast_detect.py && git commit -m "feat(detection-service): YOLOE fast_detect with SAHI tiling in MLXBackend"
```

---

### Task 3: Fast Detection Endpoint (Python)

**Files:**
- Modify: `detection-service/main.py`
- Test: `detection-service/tests/test_fast_endpoint.py`

- [ ] **Step 1: Write failing test for /detect/fast endpoint**

```python
# detection-service/tests/test_fast_endpoint.py
import io
import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from PIL import Image

from detection_service.backends.base import FastDetection, BoundingBox


@pytest.fixture
def dummy_jpeg_bytes() -> bytes:
    img = Image.new("RGB", (640, 480), (100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def mock_backend():
    mock = MagicMock()
    mock.fast_detect.return_value = [
        FastDetection(label="chair", box=BoundingBox(x=0.1, y=0.2, w=0.3, h=0.4), confidence=0.85),
        FastDetection(label="lamp", box=BoundingBox(x=0.5, y=0.1, w=0.1, h=0.2), confidence=0.72),
    ]
    return mock


@pytest.mark.asyncio
async def test_detect_fast_returns_detections(dummy_jpeg_bytes, mock_backend):
    with patch("main._backend", mock_backend):
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/detect/fast",
                files={"file": ("test.jpg", dummy_jpeg_bytes, "image/jpeg")},
            )
    assert response.status_code == 200
    data = response.json()
    assert "detections" in data
    assert len(data["detections"]) == 2
    assert data["detections"][0]["label"] == "chair"
    assert data["detections"][0]["provider"] == "yoloe"
    assert "processing_ms" in data
    assert "tiles_used" in data


@pytest.mark.asyncio
async def test_detect_fast_rejects_non_image(mock_backend):
    with patch("main._backend", mock_backend):
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/detect/fast",
                files={"file": ("test.txt", b"not an image", "text/plain")},
            )
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run pytest tests/test_fast_endpoint.py -v
```

Expected: FAIL — no `/detect/fast` route exists.

- [ ] **Step 3: Implement the /detect/fast endpoint in main.py**

Replace the content of `detection-service/main.py`:

```python
from __future__ import annotations
import time
import io
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image

from detection_service.config import settings
from detection_service.telemetry import configure_telemetry, mount_prometheus
from detection_service.backends.mlx_backend import MLXBackend

log = logging.getLogger(__name__)

_backend: MLXBackend | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _backend
    _backend = MLXBackend()
    _backend.load_fast_models()
    log.info("MLXBackend fast models loaded at startup")
    yield
    _backend = None


app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)

configure_telemetry(app=app)
mount_prometheus(app)


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}


@app.post("/detect/fast")
async def detect_fast(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    start = time.monotonic()
    detections = _backend.fast_detect(image)
    elapsed_ms = int((time.monotonic() - start) * 1000)

    return {
        "detections": [
            {
                "box": [d.box.x, d.box.y, d.box.w, d.box.h],
                "label": d.label,
                "confidence": d.confidence,
                "provider": d.source,
            }
            for d in detections
        ],
        "processing_ms": elapsed_ms,
        "tiles_used": 1 + settings.sahi_grid_cols * settings.sahi_grid_rows,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run pytest tests/test_fast_endpoint.py tests/test_smoke.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add detection-service/main.py detection-service/tests/test_fast_endpoint.py && git commit -m "feat(detection-service): /detect/fast endpoint with YOLOE + SAHI"
```

---

### Task 4: Env Config + Claude Classifier Adapter (API Service)

**Files:**
- Modify: `api-service/src/config/env.config.ts`
- Create: `api-service/src/providers/claude.classifier.ts`
- Test: `api-service/tests/unit/claude-classifier.unit.test.ts`

- [ ] **Step 1: Update env config with new fields**

Add these fields to the `EnvConfig` interface and `envConfig` object in `api-service/src/config/env.config.ts`:

```typescript
// Add to EnvConfig interface:
  claudeApiKey: string;
  claudeModel: string;
  multiPassRetryThreshold: number;
  multiPassQuadrantOverlap: number;

// Add to envConfig object:
  claudeApiKey: process.env.CLAUDE_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  multiPassRetryThreshold: parseInt(process.env.MULTI_PASS_RETRY_THRESHOLD || '15', 10),
  multiPassQuadrantOverlap: parseFloat(process.env.MULTI_PASS_QUADRANT_OVERLAP || '0.55'),
```

- [ ] **Step 2: Add @anthropic-ai/sdk dependency**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npm install @anthropic-ai/sdk
```

- [ ] **Step 3: Write failing test for Claude classifier**

```typescript
// api-service/tests/unit/claude-classifier.unit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ClaudeClassifier } from '../../src/providers/claude.classifier';

describe('ClaudeClassifier', () => {
  const config = {
    claudeApiKey: 'test-key',
    claudeModel: 'claude-sonnet-4-20250514',
    classificationTimeoutMs: 30000,
  } as any;

  it('should have name "claude"', () => {
    const classifier = new ClaudeClassifier(config);
    expect(classifier.name).toBe('claude');
  });

  it('should implement healthCheck', async () => {
    const classifier = new ClaudeClassifier(config);
    const result = await classifier.healthCheck();
    expect(typeof result).toBe('boolean');
  });

  it('should parse VLM response into ClassifiedObject array', () => {
    const classifier = new ClaudeClassifier(config);
    const json = JSON.stringify([
      {
        label: 'wooden dining table',
        category: 'Furniture',
        bounding_box: [100, 200, 500, 800],
        confidence: 0.9,
        colors: ['brown'],
        materials: ['oak wood'],
        condition: 'good',
        estimated_value_usd: 300,
      },
    ]);

    const result = (classifier as any).parseVlmResponse(json);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('wooden dining table');
    expect(result[0].boundingBox.x).toBeCloseTo(0.2);
    expect(result[0].boundingBox.y).toBeCloseTo(0.1);
    expect(result[0].boundingBox.width).toBeCloseTo(0.6);
    expect(result[0].boundingBox.height).toBeCloseTo(0.4);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run tests/unit/claude-classifier.unit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement ClaudeClassifier**

```typescript
// api-service/src/providers/claude.classifier.ts
import Anthropic from '@anthropic-ai/sdk';
import { ObjectClassifier, ClassifiedObject } from './classifier.interface';
import { BoundingBoxResult } from './detector.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export class ClaudeClassifier implements ObjectClassifier {
  readonly name = 'claude';
  private client: Anthropic;
  private modelId: string;

  constructor(config: EnvConfig) {
    this.client = new Anthropic({ apiKey: config.claudeApiKey });
    this.modelId = config.claudeModel;
  }

  async classify(image: Buffer, _detections: BoundingBoxResult[]): Promise<ClassifiedObject[]> {
    const prompt = this.buildPrompt();

    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') },
            },
            { type: 'text', text: prompt },
          ],
        }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return this.parseVlmResponse(text);
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Claude classification failed');
      throw error;
    }
  }

  async generateDetectionPrompt(_image: Buffer): Promise<string> {
    return 'object . item . thing';
  }

  private buildPrompt(): string {
    return `Enumerate every visible object in this image. Return a JSON array where each element has:
- "label": specific descriptive name (e.g. "brass floor lamp", "ceramic coffee mug")
- "category": freeform category that fits the object
- "bounding_box": [ymin, xmin, ymax, xmax] in normalized 0-1000 coordinates
- "confidence": 0.0 to 1.0
- "colors": array of colors
- "materials": array of materials
- "condition": "new", "good", "fair", or "worn"
- "estimated_value_usd": rough estimate as integer

Be exhaustive — aim for completeness over brevity. Include small items on surfaces, textiles, wall decor, and anything partially visible. Use any label and category that fits the object.
Return ONLY valid JSON array, no other text.`;
  }

  parseVlmResponse(text: string): ClassifiedObject[] {
    const jsonStr = this.extractJson(text);
    const parsed = JSON.parse(jsonStr);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    return items
      .map((item: any) => this.mapToClassifiedObject(item))
      .filter((obj: ClassifiedObject) => obj.confidence > 0.1);
  }

  private extractJson(text: string): string {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) return jsonMatch[1].trim();

    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) return text.slice(start, end + 1);

    return text.trim();
  }

  private mapToClassifiedObject(item: any): ClassifiedObject {
    let boundingBox = { x: 0, y: 0, width: 0, height: 0 };

    if (item.bounding_box && Array.isArray(item.bounding_box) && item.bounding_box.length === 4) {
      const [ymin, xmin, ymax, xmax] = item.bounding_box;
      boundingBox = {
        x: xmin / 1000,
        y: ymin / 1000,
        width: (xmax - xmin) / 1000,
        height: (ymax - ymin) / 1000,
      };
    }

    return {
      boxIndex: 0,
      label: item.label || 'unknown',
      category: item.category || 'uncategorized',
      brand: item.brand || null,
      model: item.model || null,
      colors: item.colors || [],
      materials: item.materials || [],
      condition: item.condition || null,
      estimatedValue: item.estimated_value_usd
        ? { low: Math.round(item.estimated_value_usd * 0.7), high: Math.round(item.estimated_value_usd * 1.3) }
        : null,
      description: item.description || null,
      confidence: item.confidence ?? 0,
      boundingBox,
    };
  }

  async healthCheck(): Promise<boolean> {
    return !!this.client;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run tests/unit/claude-classifier.unit.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add api-service/src/config/env.config.ts api-service/src/providers/claude.classifier.ts api-service/tests/unit/claude-classifier.unit.test.ts api-service/package.json api-service/package-lock.json && git commit -m "feat(api-service): Claude Sonnet 4 classifier adapter + env config updates"
```

---

### Task 5: Remove Hardcoded Categories from Gemini Classifier

**Files:**
- Modify: `api-service/src/providers/gemini.classifier.ts`

- [ ] **Step 1: Update the Gemini prompt to remove hardcoded category list**

In `api-service/src/providers/gemini.classifier.ts`, replace the `buildFullImagePrompt()` method:

```typescript
  private buildFullImagePrompt(): string {
    return `Enumerate every visible object in this image. Return a JSON array where each element has:
- "label": specific descriptive name (e.g. "brass floor lamp", "ceramic coffee mug")
- "category": freeform category that fits the object
- "bounding_box": [ymin, xmin, ymax, xmax] in normalized 0-1000 coordinates
- "confidence": 0.0 to 1.0
- "colors": array of colors
- "materials": array of materials
- "condition": "new", "good", "fair", or "worn"
- "estimated_value_usd": rough estimate as integer

Be exhaustive — aim for completeness over brevity. Include small items on surfaces, textiles, wall decor, and anything partially visible. Use any label and category that fits the object.
Return ONLY valid JSON array, no other text.`;
  }
```

Also update `mapToClassifiedObject` to handle the `estimated_value_usd` field:

```typescript
  private mapToClassifiedObject(item: any): ClassifiedObject {
    let boundingBox = { x: 0, y: 0, width: 0, height: 0 };

    if (item.bounding_box && Array.isArray(item.bounding_box) && item.bounding_box.length === 4) {
      const [ymin, xmin, ymax, xmax] = item.bounding_box;
      boundingBox = {
        x: xmin / 1000,
        y: ymin / 1000,
        width: (xmax - xmin) / 1000,
        height: (ymax - ymin) / 1000,
      };
    }

    return {
      boxIndex: 0,
      label: item.label || 'unknown',
      category: item.category || 'uncategorized',
      brand: item.brand || null,
      model: item.model || null,
      colors: item.colors || [],
      materials: item.materials || [],
      condition: item.condition || null,
      estimatedValue: item.estimated_value_usd
        ? { low: Math.round(item.estimated_value_usd * 0.7), high: Math.round(item.estimated_value_usd * 1.3) }
        : null,
      description: item.description || null,
      confidence: item.confidence ?? 0,
      boundingBox,
    };
  }
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run
```

Expected: All existing tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add api-service/src/providers/gemini.classifier.ts && git commit -m "fix(api-service): remove hardcoded 9-category list from Gemini classifier"
```

---

### Task 6: Multi-Pass VLM Classifier (API Service)

**Files:**
- Create: `api-service/src/services/multi-pass-vlm.classifier.ts`
- Test: `api-service/tests/unit/multi-pass-vlm.unit.test.ts`

- [ ] **Step 1: Write failing tests for multi-pass dedup and orchestration**

```typescript
// api-service/tests/unit/multi-pass-vlm.unit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MultiPassVlmClassifier, deduplicateObjects, cropQuadrant, jaccardSimilarity } from '../../src/services/multi-pass-vlm.classifier';
import { ClassifiedObject } from '../../src/providers/classifier.interface';

function makeObj(overrides: Partial<ClassifiedObject> = {}): ClassifiedObject {
  return {
    boxIndex: 0,
    label: 'lamp',
    category: 'Lighting',
    brand: null,
    model: null,
    colors: [],
    materials: [],
    condition: null,
    estimatedValue: null,
    description: null,
    confidence: 0.8,
    boundingBox: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 },
    ...overrides,
  };
}

describe('jaccardSimilarity', () => {
  it('should return 1.0 for identical labels', () => {
    expect(jaccardSimilarity('table lamp', 'table lamp')).toBe(1.0);
  });

  it('should return > 0.3 for overlapping labels', () => {
    expect(jaccardSimilarity('ceramic lamp', 'lamp')).toBeGreaterThan(0.3);
  });

  it('should return 0.0 for completely different labels', () => {
    expect(jaccardSimilarity('lamp', 'plant')).toBe(0.0);
  });

  it('should be case-insensitive', () => {
    expect(jaccardSimilarity('Table Lamp', 'table lamp')).toBe(1.0);
  });
});

describe('deduplicateObjects', () => {
  it('should merge spatially close objects with similar labels', () => {
    const objects = [
      makeObj({ label: 'table lamp', boundingBox: { x: 0.5, y: 0.3, width: 0.1, height: 0.15 }, confidence: 0.9 }),
      makeObj({ label: 'lamp', boundingBox: { x: 0.52, y: 0.32, width: 0.08, height: 0.12 }, confidence: 0.7 }),
    ];
    const result = deduplicateObjects(objects);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9); // keeps higher confidence
  });

  it('should keep spatially distant objects even with same label', () => {
    const objects = [
      makeObj({ label: 'chair', boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } }),
      makeObj({ label: 'chair', boundingBox: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 } }),
    ];
    const result = deduplicateObjects(objects);
    expect(result).toHaveLength(2);
  });

  it('should keep spatially close objects with different labels', () => {
    const objects = [
      makeObj({ label: 'lamp', boundingBox: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } }),
      makeObj({ label: 'vase', boundingBox: { x: 0.52, y: 0.52, width: 0.08, height: 0.08 } }),
    ];
    const result = deduplicateObjects(objects);
    expect(result).toHaveLength(2);
  });
});

describe('cropQuadrant', () => {
  it('should return correct crop coords for top-left with 55% overlap', () => {
    const crop = cropQuadrant('top-left', 1000, 800, 0.55);
    expect(crop).toEqual({ x: 0, y: 0, width: 550, height: 440 });
  });

  it('should return correct crop coords for bottom-right', () => {
    const crop = cropQuadrant('bottom-right', 1000, 800, 0.55);
    expect(crop).toEqual({ x: 450, y: 360, width: 550, height: 440 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run tests/unit/multi-pass-vlm.unit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement MultiPassVlmClassifier**

```typescript
// api-service/src/services/multi-pass-vlm.classifier.ts
import sharp from 'sharp';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { EnvConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function cropQuadrant(
  quadrant: Quadrant,
  imageWidth: number,
  imageHeight: number,
  overlapFraction: number,
): { x: number; y: number; width: number; height: number } {
  const cropW = Math.round(imageWidth * overlapFraction);
  const cropH = Math.round(imageHeight * overlapFraction);

  switch (quadrant) {
    case 'top-left':
      return { x: 0, y: 0, width: cropW, height: cropH };
    case 'top-right':
      return { x: imageWidth - cropW, y: 0, width: cropW, height: cropH };
    case 'bottom-left':
      return { x: 0, y: imageHeight - cropH, width: cropW, height: cropH };
    case 'bottom-right':
      return { x: imageWidth - cropW, y: imageHeight - cropH, width: cropW, height: cropH };
  }
}

function boxCenterDistance(a: ClassifiedObject, b: ClassifiedObject): number {
  const acx = a.boundingBox.x + a.boundingBox.width / 2;
  const acy = a.boundingBox.y + a.boundingBox.height / 2;
  const bcx = b.boundingBox.x + b.boundingBox.width / 2;
  const bcy = b.boundingBox.y + b.boundingBox.height / 2;
  return Math.sqrt((acx - bcx) ** 2 + (acy - bcy) ** 2);
}

export function deduplicateObjects(objects: ClassifiedObject[]): ClassifiedObject[] {
  if (objects.length === 0) return [];

  const sorted = [...objects].sort((a, b) => b.confidence - a.confidence);
  const kept: ClassifiedObject[] = [];

  for (const obj of sorted) {
    const isDuplicate = kept.some(
      (existing) =>
        boxCenterDistance(obj, existing) < 0.15 &&
        jaccardSimilarity(obj.label, existing.label) >= 0.3,
    );
    if (!isDuplicate) {
      kept.push(obj);
    }
  }

  return kept;
}

function remapQuadrantBoxToFull(
  obj: ClassifiedObject,
  crop: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): ClassifiedObject {
  const bb = obj.boundingBox;
  return {
    ...obj,
    boundingBox: {
      x: (crop.x + bb.x * crop.width) / imageWidth,
      y: (crop.y + bb.y * crop.height) / imageHeight,
      width: (bb.width * crop.width) / imageWidth,
      height: (bb.height * crop.height) / imageHeight,
    },
  };
}

export class MultiPassVlmClassifier {
  private classifiers: ObjectClassifier[];
  private config: EnvConfig;

  constructor(classifiers: ObjectClassifier[], config: EnvConfig) {
    this.classifiers = classifiers;
    this.config = config;
  }

  async detect(image: Buffer): Promise<ClassifiedObject[]> {
    const metadata = await sharp(image).metadata();
    const imageWidth = metadata.width!;
    const imageHeight = metadata.height!;
    const overlap = this.config.multiPassQuadrantOverlap;

    // Build all 5 image variants: 1 full + 4 quadrants
    const quadrants: Quadrant[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const crops = quadrants.map((q) => ({
      quadrant: q,
      ...cropQuadrant(q, imageWidth, imageHeight, overlap),
    }));

    const cropBuffers = await Promise.all(
      crops.map((c) =>
        sharp(image).extract({ left: c.x, top: c.y, width: c.width, height: c.height }).toBuffer(),
      ),
    );

    // Try primary classifier (Gemini Flash)
    const primary = this.findClassifier('gemini');
    if (primary) {
      try {
        const results = await this.runMultiPass(primary, image, cropBuffers, crops, imageWidth, imageHeight);
        if (results.length >= this.config.multiPassRetryThreshold) {
          return results;
        }

        // Below threshold — retry overview with next classifier (Gemini Pro or Claude)
        logger.info({ count: results.length, threshold: this.config.multiPassRetryThreshold }, 'Below retry threshold, trying secondary');
        const secondary = this.findClassifier('claude') || this.findClassifier('ollama');
        if (secondary) {
          const overviewRetry = await this.callClassifier(secondary, image);
          const combined = deduplicateObjects([...results, ...overviewRetry]);
          return combined;
        }

        return results;
      } catch (error) {
        logger.warn({ error: (error as Error).message }, 'Primary VLM failed, trying fallback');
      }
    }

    // Fallback: try Claude or Ollama for full multi-pass
    for (const classifier of this.classifiers) {
      if (classifier.name === 'gemini') continue;
      try {
        return await this.runMultiPass(classifier, image, cropBuffers, crops, imageWidth, imageHeight);
      } catch (error) {
        logger.warn({ provider: classifier.name, error: (error as Error).message }, 'Fallback VLM failed');
      }
    }

    return [];
  }

  private async runMultiPass(
    classifier: ObjectClassifier,
    fullImage: Buffer,
    cropBuffers: Buffer[],
    crops: Array<{ quadrant: Quadrant; x: number; y: number; width: number; height: number }>,
    imageWidth: number,
    imageHeight: number,
  ): Promise<ClassifiedObject[]> {
    // Fire all 5 calls in parallel
    const [overviewResults, ...quadrantResults] = await Promise.all([
      this.callClassifier(classifier, fullImage),
      ...cropBuffers.map((buf) => this.callClassifier(classifier, buf)),
    ]);

    // Remap quadrant bounding boxes to full-image coordinates
    const remappedQuadrants = quadrantResults.flatMap((results, i) =>
      results.map((obj) => remapQuadrantBoxToFull(obj, crops[i], imageWidth, imageHeight)),
    );

    // Merge and deduplicate
    const allObjects = [...overviewResults, ...remappedQuadrants];
    return deduplicateObjects(allObjects);
  }

  private async callClassifier(classifier: ObjectClassifier, image: Buffer): Promise<ClassifiedObject[]> {
    try {
      return await classifier.classify(image, []);
    } catch (error) {
      logger.warn({ provider: classifier.name, error: (error as Error).message }, 'VLM call failed');
      return [];
    }
  }

  private findClassifier(name: string): ObjectClassifier | undefined {
    return this.classifiers.find((c) => c.name === name);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run tests/unit/multi-pass-vlm.unit.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add api-service/src/services/multi-pass-vlm.classifier.ts api-service/tests/unit/multi-pass-vlm.unit.test.ts && git commit -m "feat(api-service): multi-pass VLM classifier with quadrant cropping and dedup"
```

---

### Task 7: Fusion — fuseFastAndDeep (API Service)

**Files:**
- Modify: `api-service/src/services/ensemble-fusion.service.ts`
- Test: `api-service/tests/unit/fusion-fast-deep.unit.test.ts`

- [ ] **Step 1: Write failing tests for fuseFastAndDeep**

```typescript
// api-service/tests/unit/fusion-fast-deep.unit.test.ts
import { describe, it, expect } from 'vitest';
import { EnsembleFusionService } from '../../src/services/ensemble-fusion.service';
import { ClassifiedObject } from '../../src/providers/classifier.interface';

function makeObj(overrides: Partial<ClassifiedObject> & { label: string }): ClassifiedObject {
  return {
    boxIndex: 0,
    category: 'Furniture',
    brand: null,
    model: null,
    colors: [],
    materials: [],
    condition: null,
    estimatedValue: null,
    description: null,
    confidence: 0.8,
    boundingBox: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 },
    ...overrides,
  };
}

interface FastPassDetection {
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

describe('EnsembleFusionService.fuseFastAndDeep', () => {
  const service = new EnsembleFusionService();

  it('should match fast and deep detections by proximity + label', () => {
    const fast: FastPassDetection[] = [
      { label: 'lamp', confidence: 0.85, boundingBox: { x: 0.5, y: 0.3, width: 0.1, height: 0.15 } },
    ];
    const deep: ClassifiedObject[] = [
      makeObj({ label: 'brass floor lamp', boundingBox: { x: 0.52, y: 0.32, width: 0.08, height: 0.12 }, confidence: 0.9 }),
    ];

    const result = service.fuseFastAndDeep(fast, deep);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('brass floor lamp'); // deep-pass label
    expect(result[0].boundingBox).toEqual(fast[0].boundingBox); // fast-pass box
    expect(result[0].source).toBe('matched');
  });

  it('should keep deep-only objects with VLM bounding box', () => {
    const fast: FastPassDetection[] = [];
    const deep: ClassifiedObject[] = [
      makeObj({ label: 'painting', boundingBox: { x: 0.3, y: 0.1, width: 0.2, height: 0.3 } }),
    ];

    const result = service.fuseFastAndDeep(fast, deep);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('deep_only');
    expect(result[0].boundingBox).toEqual(deep[0].boundingBox);
  });

  it('should keep fast-only objects with null attributes', () => {
    const fast: FastPassDetection[] = [
      { label: 'chair', confidence: 0.75, boundingBox: { x: 0.7, y: 0.6, width: 0.1, height: 0.15 } },
    ];
    const deep: ClassifiedObject[] = [];

    const result = service.fuseFastAndDeep(fast, deep);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('fast_only');
    expect(result[0].label).toBe('chair');
    expect(result[0].colors).toEqual([]);
    expect(result[0].materials).toEqual([]);
  });

  it('should return union of all detections (no drops)', () => {
    const fast: FastPassDetection[] = [
      { label: 'lamp', confidence: 0.85, boundingBox: { x: 0.5, y: 0.3, width: 0.1, height: 0.15 } },
      { label: 'chair', confidence: 0.75, boundingBox: { x: 0.1, y: 0.8, width: 0.15, height: 0.15 } },
    ];
    const deep: ClassifiedObject[] = [
      makeObj({ label: 'floor lamp', boundingBox: { x: 0.52, y: 0.32, width: 0.08, height: 0.12 } }),
      makeObj({ label: 'vase', boundingBox: { x: 0.8, y: 0.1, width: 0.05, height: 0.08 } }),
    ];

    const result = service.fuseFastAndDeep(fast, deep);
    // lamp matched with floor lamp = 1, chair = fast_only, vase = deep_only → 3 total
    expect(result).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run tests/unit/fusion-fast-deep.unit.test.ts
```

Expected: FAIL — `fuseFastAndDeep` doesn't exist.

- [ ] **Step 3: Add fuseFastAndDeep to EnsembleFusionService**

Add the following types and method to `api-service/src/services/ensemble-fusion.service.ts`. Add the imports and interface at the top, and the new method after the existing `calculateIoU` method:

Add at the top of the file, after the existing import:

```typescript
export interface FastPassDetection {
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface FusedDetection extends ClassifiedObject {
  source: 'matched' | 'fast_only' | 'deep_only';
}
```

Add these methods to the `EnsembleFusionService` class:

```typescript
  /**
   * Fuse fast-pass (YOLOE) and deep-pass (VLM) results.
   * Deep pass = authority on labels/attributes. Fast pass = authority on bounding boxes.
   */
  fuseFastAndDeep(fast: FastPassDetection[], deep: ClassifiedObject[]): FusedDetection[] {
    const results: FusedDetection[] = [];
    const matchedFastIndices = new Set<number>();

    for (const deepObj of deep) {
      const bestMatch = this.findBestFastMatch(deepObj, fast, matchedFastIndices);

      if (bestMatch !== null) {
        matchedFastIndices.add(bestMatch.index);
        // Matched: deep-pass labels + fast-pass bounding box
        results.push({
          ...deepObj,
          boundingBox: fast[bestMatch.index].boundingBox,
          source: 'matched',
        });
      } else {
        // Deep-only: keep as-is
        results.push({ ...deepObj, source: 'deep_only' });
      }
    }

    // Fast-only: objects YOLOE found but VLM missed
    for (let i = 0; i < fast.length; i++) {
      if (matchedFastIndices.has(i)) continue;
      results.push({
        boxIndex: 0,
        label: fast[i].label,
        category: 'uncategorized',
        brand: null,
        model: null,
        colors: [],
        materials: [],
        condition: null,
        estimatedValue: null,
        description: null,
        confidence: fast[i].confidence,
        boundingBox: fast[i].boundingBox,
        source: 'fast_only',
      });
    }

    return results;
  }

  private findBestFastMatch(
    deepObj: ClassifiedObject,
    fast: FastPassDetection[],
    excludeIndices: Set<number>,
  ): { index: number; score: number } | null {
    let best: { index: number; score: number } | null = null;

    const deepCx = deepObj.boundingBox.x + deepObj.boundingBox.width / 2;
    const deepCy = deepObj.boundingBox.y + deepObj.boundingBox.height / 2;

    for (let i = 0; i < fast.length; i++) {
      if (excludeIndices.has(i)) continue;

      const fastCx = fast[i].boundingBox.x + fast[i].boundingBox.width / 2;
      const fastCy = fast[i].boundingBox.y + fast[i].boundingBox.height / 2;
      const dist = Math.sqrt((deepCx - fastCx) ** 2 + (deepCy - fastCy) ** 2);

      if (dist >= 0.15) continue; // Too far apart

      const labelSim = this.jaccardSimilarity(deepObj.label, fast[i].label);
      if (labelSim < 0.3) continue; // Labels too different

      const score = labelSim * (1 - dist);
      if (!best || score > best.score) {
        best = { index: i, score };
      }
    }

    return best;
  }

  private jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
    const union = new Set([...tokensA, ...tokensB]);
    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run tests/unit/fusion-fast-deep.unit.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run all existing tests to check nothing breaks**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add api-service/src/services/ensemble-fusion.service.ts api-service/tests/unit/fusion-fast-deep.unit.test.ts && git commit -m "feat(api-service): fuseFastAndDeep method for merging YOLOE + VLM results"
```

---

### Task 8: Detection Pipeline — Two-Phase Orchestration + SSE (API Service)

**Files:**
- Modify: `api-service/src/services/detection-pipeline.service.ts`
- Modify: `api-service/src/routes/detect.route.ts`
- Modify: `api-service/src/app.ts`
- Test: `api-service/tests/unit/detection-pipeline.unit.test.ts`

- [ ] **Step 1: Write failing test for two-phase pipeline**

```typescript
// api-service/tests/unit/detection-pipeline.unit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { DetectionPipelineService } from '../../src/services/detection-pipeline.service';

describe('DetectionPipelineService (two-phase)', () => {
  it('should return fast and deep results via detectFull', async () => {
    const mockFastDetector = {
      name: 'fast-detector',
      detectFast: vi.fn().mockResolvedValue([
        { label: 'chair', confidence: 0.8, boundingBox: { x: 0.1, y: 0.2, width: 0.1, height: 0.1 } },
      ]),
    };

    const mockMultiPassVlm = {
      detect: vi.fn().mockResolvedValue([
        {
          boxIndex: 0, label: 'wooden chair', category: 'Furniture',
          brand: null, model: null, colors: ['brown'], materials: ['wood'],
          condition: 'good', estimatedValue: null, description: null,
          confidence: 0.9, boundingBox: { x: 0.12, y: 0.22, width: 0.08, height: 0.08 },
        },
      ]),
    };

    const pipeline = new DetectionPipelineService({
      fastDetectorUrl: 'http://localhost:14001',
      multiPassVlm: mockMultiPassVlm as any,
      classifiers: [],
      detectors: [],
    });
    // Override the internal fast detect call
    (pipeline as any).callFastDetector = mockFastDetector.detectFast;

    const result = await pipeline.detectFull(Buffer.from('fake'));

    expect(result.fastPass).toBeDefined();
    expect(result.deepPass).toBeDefined();
    expect(result.fused.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run tests/unit/detection-pipeline.unit.test.ts
```

Expected: FAIL — `detectFull` doesn't exist.

- [ ] **Step 3: Rewrite DetectionPipelineService for two-phase flow**

Replace the content of `api-service/src/services/detection-pipeline.service.ts`:

```typescript
import { ObjectDetector, BoundingBoxResult } from '../providers/detector.interface';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { logger } from '../utils/logger';
import { ServiceUnavailableError } from '../utils/errors';
import { EnsembleFusionService, FastPassDetection, FusedDetection } from './ensemble-fusion.service';
import { MultiPassVlmClassifier } from './multi-pass-vlm.classifier';
import { envConfig } from '../config/env.config';

export interface FastPassResult {
  detections: FastPassDetection[];
  processingTimeMs: number;
}

export interface DeepPassResult {
  detections: ClassifiedObject[];
  processingTimeMs: number;
  provider: string;
}

export interface FullPipelineResult {
  fastPass: FastPassResult | null;
  deepPass: DeepPassResult | null;
  fused: FusedDetection[];
  totalProcessingMs: number;
}

export interface PipelineResult {
  detections: ClassifiedObject[];
  processingTimeMs: number;
  detector: string;
  classifier: string;
  corroborationCount?: number;
}

interface PipelineOptions {
  fastDetectorUrl: string;
  multiPassVlm: MultiPassVlmClassifier;
  classifiers: ObjectClassifier[];
  detectors: ObjectDetector[];
}

export class DetectionPipelineService {
  private fastDetectorUrl: string;
  private multiPassVlm: MultiPassVlmClassifier;
  private fusionService: EnsembleFusionService;
  private detectors: { provider: ObjectDetector; breaker: CircuitBreaker }[];
  private classifiers: { provider: ObjectClassifier; breaker: CircuitBreaker }[];

  constructor(options: PipelineOptions) {
    this.fastDetectorUrl = options.fastDetectorUrl;
    this.multiPassVlm = options.multiPassVlm;
    this.fusionService = new EnsembleFusionService();

    const breakerOptions = { failureThreshold: 3, resetTimeout: 30000, halfOpenRequests: 2 };
    this.detectors = options.detectors.map((d) => ({ provider: d, breaker: new CircuitBreaker(d.name, breakerOptions) }));
    this.classifiers = options.classifiers.map((c) => ({ provider: c, breaker: new CircuitBreaker(c.name, breakerOptions) }));
  }

  /**
   * Two-phase detection: fast pass + deep pass, returns all results for SSE streaming.
   */
  async detectFull(image: Buffer): Promise<FullPipelineResult> {
    const start = Date.now();

    // Run fast pass and deep pass concurrently
    const [fastPass, deepPass] = await Promise.all([
      this.runFastPass(image),
      this.runDeepPass(image),
    ]);

    // Fuse results
    const fastDetections = fastPass?.detections || [];
    const deepDetections = deepPass?.detections || [];
    const fused = this.fusionService.fuseFastAndDeep(fastDetections, deepDetections);

    return {
      fastPass,
      deepPass,
      fused,
      totalProcessingMs: Date.now() - start,
    };
  }

  /**
   * Blocking detect — backward-compatible API, returns fused results in a single response.
   */
  async detect(image: Buffer): Promise<PipelineResult> {
    const result = await this.detectFull(image);

    return {
      detections: result.fused,
      processingTimeMs: result.totalProcessingMs,
      detector: result.fastPass ? 'yoloe' : 'none',
      classifier: result.deepPass?.provider || 'none',
    };
  }

  private async runFastPass(image: Buffer): Promise<FastPassResult | null> {
    const start = Date.now();
    try {
      const detections = await this.callFastDetector(image);
      return { detections, processingTimeMs: Date.now() - start };
    } catch (error) {
      logger.warn({ error: (error as Error).message }, 'Fast pass failed, continuing with deep pass only');
      return null;
    }
  }

  private async callFastDetector(image: Buffer): Promise<FastPassDetection[]> {
    const formData = new FormData();
    formData.append('file', new Blob([image], { type: 'image/jpeg' }), 'image.jpg');

    const response = await fetch(`${this.fastDetectorUrl}/detect/fast`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Fast detector returned ${response.status}`);
    }

    const data: any = await response.json();
    return (data.detections || []).map((d: any) => ({
      label: d.label,
      confidence: d.confidence,
      boundingBox: {
        x: d.box[0],
        y: d.box[1],
        width: d.box[2],
        height: d.box[3],
      },
    }));
  }

  private async runDeepPass(image: Buffer): Promise<DeepPassResult | null> {
    const start = Date.now();
    try {
      const detections = await this.multiPassVlm.detect(image);
      return {
        detections,
        processingTimeMs: Date.now() - start,
        provider: 'multi-pass-vlm',
      };
    } catch (error) {
      logger.warn({ error: (error as Error).message }, 'Deep pass failed');
      return null;
    }
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const { provider } of this.detectors) {
      results[provider.name] = await provider.healthCheck();
    }
    for (const { provider } of this.classifiers) {
      results[provider.name] = await provider.healthCheck();
    }
    return results;
  }
}
```

- [ ] **Step 4: Update detect route for SSE + blocking mode**

Replace the content of `api-service/src/routes/detect.route.ts`:

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DetectionPipelineService } from '../services/detection-pipeline.service';
import { ImageQualityService } from '../services/image-quality.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function detectRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as DetectionPipelineService;
  const qualityService = new ImageQualityService();

  app.post('/v1/detect', { preHandler: authMiddleware }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) throw new BadRequestError('No image file uploaded');

    const imageBuffer = await data.toBuffer();
    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      throw new PayloadTooLargeError(`Image exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`);
    }
    if (data.mimetype && !SUPPORTED_TYPES.includes(data.mimetype)) {
      throw new BadRequestError(`Unsupported image type: ${data.mimetype}`);
    }

    logger.info({ filename: data.filename, size: imageBuffer.length }, 'Processing detection request');

    const quality = await qualityService.analyzeQuality(imageBuffer);
    const mode = (request.query as { mode?: string }).mode;

    // Blocking mode: single JSON response
    if (mode === 'full') {
      const result = await pipeline.detectFull(imageBuffer);
      return reply.code(200).send({
        ...result,
        imageQuality: { blur: quality.blurScore, brightness: quality.brightness, contrast: quality.contrast },
      });
    }

    // SSE streaming mode (default)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendSSE = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const fullResult = await pipeline.detectFull(imageBuffer);

    if (fullResult.fastPass) {
      sendSSE('fast_pass', {
        phase: 'fast',
        detections: fullResult.fastPass.detections,
        count: fullResult.fastPass.detections.length,
        processing_ms: fullResult.fastPass.processingTimeMs,
      });
    }

    if (fullResult.deepPass) {
      sendSSE('deep_pass', {
        phase: 'deep',
        detections: fullResult.fused,
        count: fullResult.fused.length,
        processing_ms: fullResult.deepPass.processingTimeMs,
      });
    }

    const matchedCount = fullResult.fused.filter((d) => d.source === 'matched').length;
    const fastOnlyCount = fullResult.fused.filter((d) => d.source === 'fast_only').length;
    const deepOnlyCount = fullResult.fused.filter((d) => d.source === 'deep_only').length;

    sendSSE('done', {
      total: fullResult.fused.length,
      fast_only: fastOnlyCount,
      deep_only: deepOnlyCount,
      matched: matchedCount,
      imageQuality: { blur: quality.blurScore, brightness: quality.brightness, contrast: quality.contrast },
    });

    reply.raw.end();
  });
}
```

- [ ] **Step 5: Update app.ts to wire up new pipeline**

In `api-service/src/app.ts`, update the imports and `createDefaultPipeline` function:

Add imports at the top:

```typescript
import { ClaudeClassifier } from './providers/claude.classifier';
import { MultiPassVlmClassifier } from './services/multi-pass-vlm.classifier';
```

Replace `createDefaultPipeline`:

```typescript
function createDefaultPipeline(): DetectionPipelineService {
  const detectors = [];
  const classifiers = [];

  if (envConfig.useMockAi) {
    logger.info('Using Mock AI for detection pipeline');
    classifiers.push(new MockClassifier());
    const multiPassVlm = new MultiPassVlmClassifier(classifiers, envConfig);
    return new DetectionPipelineService({
      fastDetectorUrl: envConfig.detectionServiceUrl,
      multiPassVlm,
      classifiers: [],
      detectors: [],
    });
  }

  detectors.push(new GroundingDinoDetector(envConfig));
  if (envConfig.googleProjectId) {
    detectors.push(new GoogleVisionDetector(envConfig));
  }

  if (envConfig.geminiApiKey) {
    classifiers.push(new GeminiClassifier(envConfig));
  }
  if (envConfig.claudeApiKey) {
    classifiers.push(new ClaudeClassifier(envConfig));
  }
  if (envConfig.ollamaEnabled) {
    classifiers.push(new OllamaClassifier(envConfig));
  }

  const multiPassVlm = new MultiPassVlmClassifier(classifiers, envConfig);

  return new DetectionPipelineService({
    fastDetectorUrl: envConfig.detectionServiceUrl,
    multiPassVlm,
    classifiers,
    detectors,
  });
}
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run
```

Expected: All tests PASS. Existing integration tests may need minor updates if they construct `DetectionPipelineService` with the old constructor signature — fix those by passing the new `PipelineOptions` shape.

- [ ] **Step 7: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add api-service/src/services/detection-pipeline.service.ts api-service/src/routes/detect.route.ts api-service/src/app.ts api-service/tests/unit/detection-pipeline.unit.test.ts && git commit -m "feat(api-service): two-phase pipeline with SSE streaming and blocking mode"
```

---

### Task 9: Update Existing Tests + Fix Integration

**Files:**
- Modify: `api-service/tests/integration/detect-endpoint.integration.test.ts`
- Modify: `api-service/tests/integration/ensemble-fusion.integration.test.ts`

- [ ] **Step 1: Read existing integration tests**

Read both integration test files to understand their current constructor usage and assertions.

- [ ] **Step 2: Update integration tests to use new PipelineOptions constructor**

Any test that creates `new DetectionPipelineService(detectors, classifiers)` needs to be updated to `new DetectionPipelineService({ fastDetectorUrl, multiPassVlm, classifiers, detectors })`. The `multiPassVlm` can be instantiated with the same classifiers.

Update assertions if they check the exact response shape — the detect route now returns SSE in streaming mode and a `FullPipelineResult` in blocking mode.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 4: Run Python tests too**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run pytest -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add api-service/tests/ && git commit -m "fix(api-service): update integration tests for new pipeline constructor"
```

---

### Task 10: Type-Check + Lint All Code

**Files:** All modified files across both services.

- [ ] **Step 1: Run TypeScript type-check**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx tsc --noEmit
```

Fix any type errors that surface.

- [ ] **Step 2: Run ESLint**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npm run lint:fix
```

- [ ] **Step 3: Run Python linter**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run ruff check src/ tests/ --fix
```

- [ ] **Step 4: Run Python type-check**

```bash
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run mypy src/detection_service/
```

- [ ] **Step 5: Run full test suites**

```bash
cd /Users/mrarindampaul/Develop/allmythings/api-service && npx vitest run
cd /Users/mrarindampaul/Develop/allmythings/detection-service && uv run pytest -v
```

Expected: All tests PASS, no lint errors, no type errors.

- [ ] **Step 6: Commit any fixes**

```bash
cd /Users/mrarindampaul/Develop/allmythings && git add -A && git commit -m "chore: fix lint and type errors across both services"
```
