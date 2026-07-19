#!/usr/bin/env python3
"""
Home Inventory Vision Pipeline
===============================
Two-pass object detection, classification, and feature tagging for home inventory.

Uses a Vision-Language Model (VLM) to detect objects, draw bounding boxes,
classify categories, and tag each item with detailed attributes.

Requirements:
    pip install Pillow httpx

Usage:
    # As a script
    python home_inventory_pipeline.py --image room_photo.jpg --output inventory.json

    # As a library
    from home_inventory_pipeline import HomeInventoryPipeline
    pipeline = HomeInventoryPipeline(api_key="your-key", provider="openrouter")
    result = await pipeline.analyze("room_photo.jpg", output_path="inventory.json")
"""

import json
import asyncio
import base64
import argparse
from pathlib import Path
from io import BytesIO
from collections import Counter
from dataclasses import dataclass, field, asdict
from typing import Literal

from PIL import Image, ImageDraw

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class BoundingBox:
    """Normalized bounding box (0.0 - 1.0 relative to image dimensions)."""
    x_min: float
    y_min: float
    x_max: float
    y_max: float

    def to_pixels(self, width: int, height: int) -> tuple[int, int, int, int]:
        """Convert normalized coords to pixel coords."""
        return (
            int(self.x_min * width),
            int(self.y_min * height),
            int(self.x_max * width),
            int(self.y_max * height),
        )


@dataclass
class ItemTags:
    """Detailed feature tags for a detected home object."""
    color: str = "unknown"
    material: str = "unknown"
    style: str = "unknown"
    condition: Literal["new", "good", "fair", "worn", "damaged", "unknown"] = "unknown"
    size_estimate: str = "unknown"
    brand: str | None = None
    notable_features: list[str] = field(default_factory=list)


@dataclass
class InventoryItem:
    """A single detected home object with classification and tags."""
    id: int
    object: str
    category: str
    bounding_box: BoundingBox
    confidence: float
    tags: ItemTags
    detection_pass: int = 1
    missed_reason: str | None = None


@dataclass
class InventoryResult:
    """Complete inventory result for an analyzed image."""
    image_path: str
    image_dimensions: dict[str, int]
    room_type: str
    detection_passes: int
    items: list[InventoryItem]

    @property
    def total_items(self) -> int:
        return len(self.items)

    @property
    def category_breakdown(self) -> dict[str, int]:
        return dict(Counter(item.category for item in self.items))

    @property
    def avg_confidence(self) -> float:
        if not self.items:
            return 0.0
        return sum(i.confidence for i in self.items) / len(self.items)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(asdict(self), indent=indent)

    def save_json(self, path: str | Path) -> None:
        Path(path).write_text(self.to_json())


# ---------------------------------------------------------------------------
# Category color map for visualization
# ---------------------------------------------------------------------------

CATEGORY_COLORS = {
    "Furniture": "#FF6B6B",
    "Lighting": "#FFD93D",
    "Decor": "#6BCB77",
    "Textile": "#4D96FF",
    "Plant": "#2ECC71",
    "Art": "#E056A0",
    "Accessory": "#F39C12",
    "Tableware": "#1ABC9C",
    "Electronics": "#3498DB",
    "Storage": "#9B59B6",
    "Kitchenware": "#E67E22",
    "Flooring": "#BDC3C7",
    "Window_Treatment": "#16A085",
    "Other": "#95A5A6",
}

VALID_CATEGORIES = list(CATEGORY_COLORS.keys())


# ---------------------------------------------------------------------------
# VLM Client (supports OpenRouter, OpenAI, Google AI Studio)
# ---------------------------------------------------------------------------

class VLMClient:
    """Handles communication with vision-language model APIs."""

    PROVIDER_CONFIGS = {
        "openrouter": {
            "base_url": "https://openrouter.ai/api/v1/chat/completions",
            "default_model": "google/gemini-2.5-flash",
            "auth_header": "Authorization",
            "auth_prefix": "Bearer ",
        },
        "openai": {
            "base_url": "https://api.openai.com/v1/chat/completions",
            "default_model": "gpt-4o",
            "auth_header": "Authorization",
            "auth_prefix": "Bearer ",
        },
        "google": {
            "base_url": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            "default_model": "gemini-2.5-flash",
            "auth_header": None,  # uses query param
            "auth_prefix": None,
        },
    }

    def __init__(
        self,
        api_key: str,
        provider: str = "openrouter",
        model: str | None = None,
    ):
        self.api_key = api_key
        self.provider = provider
        config = self.PROVIDER_CONFIGS[provider]
        self.base_url = config["base_url"]
        self.model = model or config["default_model"]
        self.config = config

    def _encode_image(self, image_path: str, max_size: int = 1024) -> str:
        """Load and resize image, return base64-encoded JPEG."""
        img = Image.open(image_path)
        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    async def query(self, prompt: str, image_path: str) -> str:
        """Send a prompt + image to the VLM and return the text response."""
        import httpx

        img_b64 = self._encode_image(image_path)

        if self.provider == "google":
            return await self._query_google(prompt, img_b64)

        # OpenAI-compatible API (OpenRouter, OpenAI, etc.)
        headers = {
            "Content-Type": "application/json",
            self.config["auth_header"]: f"{self.config['auth_prefix']}{self.api_key}",
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{img_b64}"
                            },
                        },
                    ],
                }
            ],
            "max_tokens": 8192,
            "temperature": 0.1,
        }

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(self.base_url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def _query_google(self, prompt: str, img_b64: str) -> str:
        """Google AI Studio / Gemini API."""
        import httpx

        url = self.base_url.format(model=self.model) + f"?key={self.api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": img_b64,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 8192},
        }

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def build_pass1_prompt(img_w: int, img_h: int) -> str:
    """Build the first-pass detection prompt."""
    categories = "|".join(VALID_CATEGORIES)
    return f"""You are a precise home inventory vision system. Analyze this room photograph ({img_w}x{img_h} pixels) and identify EVERY distinct home object visible.

For EACH object, return a JSON object with:
- "id": sequential integer starting at 1
- "object": specific object name (e.g. "tufted sofa", not just "sofa")
- "category": one of [{categories}]
- "bounding_box": {{"x_min": float, "y_min": float, "x_max": float, "y_max": float}} as normalized coordinates (0.0 to 1.0 relative to image dimensions)
- "confidence": float 0.0-1.0, your confidence in the detection
- "tags": {{
    "color": primary color(s),
    "material": detected or inferred material (e.g. "velvet", "wood", "brass", "glass"),
    "style": design style (e.g. "mid-century modern", "art deco", "traditional"),
    "condition": "new" | "good" | "fair" | "worn" | "damaged" | "unknown",
    "size_estimate": approximate dimensions or size category ("small", "medium", "large"),
    "brand": brand if identifiable, else null,
    "notable_features": list of distinguishing characteristics
  }}

Rules:
- Be exhaustive: include small decorative items, throw pillows, vases, plants, lamps, artwork, rugs, etc.
- Bounding boxes must be tight and accurate around each object.
- Do NOT include architectural elements (walls, ceiling, floor, windows) as inventory items.
- DO include window treatments, light fixtures, and anything mounted on walls.
- If objects overlap, still list each one separately.
- Return ONLY valid JSON: {{"image_dimensions": {{"width": {img_w}, "height": {img_h}}}, "room_type": "...", "items": [...]}}
- No markdown, no explanation, just the JSON."""


def build_pass2_prompt(
    img_w: int, img_h: int, pass1_items: list[dict]
) -> str:
    """Build the second-pass audit prompt to find missed items."""
    item_summary = json.dumps(
        [{"id": i["id"], "object": i["object"]} for i in pass1_items],
        indent=1,
    )
    next_id = len(pass1_items) + 1
    categories = "|".join(VALID_CATEGORIES)

    return f"""You are a meticulous home inventory auditor. A first-pass detection found these {len(pass1_items)} items in this room photo ({img_w}x{img_h} pixels):

{item_summary}

Your job: find EVERY object that was MISSED. Look carefully for:
- Items partially hidden behind or under other objects
- Small items on tables, shelves, mantels (candles, coasters, remotes, trays, figurines)
- Items at the very edges of the frame
- Hardware and fixtures (door handles, hinges, radiators)
- Picture frames as separate from the art inside
- Throw blankets draped over furniture
- Decorative objects clustered together counted as one
- Side tables, end tables, nesting tables
- Trays, boxes, baskets used as organizers
- Separate flowers/dried arrangements from their vases

Return ONLY newly found items. Continue IDs from {next_id}. Same JSON format:
{{"new_items": [
  {{
    "id": int,
    "object": "specific name",
    "category": "{categories}",
    "bounding_box": {{"x_min": float, "y_min": float, "x_max": float, "y_max": float}},
    "confidence": float,
    "tags": {{
      "color": "...", "material": "...", "style": "...",
      "condition": "new"|"good"|"fair"|"worn"|"damaged"|"unknown",
      "size_estimate": "...", "brand": null,
      "notable_features": ["..."]
    }},
    "missed_reason": "why this was likely missed"
  }}
]}}

All bounding_box values must be normalized (0.0 to 1.0).
If nothing was missed, return {{"new_items": []}}.
Return ONLY valid JSON, no markdown fences."""


# ---------------------------------------------------------------------------
# JSON parsing helpers
# ---------------------------------------------------------------------------

def parse_vlm_json(raw: str) -> dict:
    """Strip markdown fences and parse JSON from VLM output."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    # Also handle ```json prefix
    if text.startswith("json\n"):
        text = text[5:]
    elif text.startswith("json"):
        text = text[4:]
    return json.loads(text)


def normalize_bbox(bbox: dict, img_w: int, img_h: int) -> dict:
    """Ensure bounding box values are normalized to 0.0 - 1.0."""
    if any(v > 1.0 for v in bbox.values()):
        return {
            "x_min": round(bbox["x_min"] / img_w, 4),
            "y_min": round(bbox["y_min"] / img_h, 4),
            "x_max": round(bbox["x_max"] / img_w, 4),
            "y_max": round(bbox["y_max"] / img_h, 4),
        }
    return bbox


def parse_item(raw_item: dict, img_w: int, img_h: int, detection_pass: int) -> InventoryItem:
    """Parse a raw JSON item dict into an InventoryItem dataclass."""
    bb = normalize_bbox(raw_item["bounding_box"], img_w, img_h)
    tags = raw_item.get("tags", {})
    return InventoryItem(
        id=raw_item["id"],
        object=raw_item["object"],
        category=raw_item.get("category", "Other"),
        bounding_box=BoundingBox(**bb),
        confidence=raw_item.get("confidence", 0.5),
        tags=ItemTags(
            color=tags.get("color", "unknown"),
            material=tags.get("material", "unknown"),
            style=tags.get("style", "unknown"),
            condition=tags.get("condition", "unknown"),
            size_estimate=tags.get("size_estimate", "unknown"),
            brand=tags.get("brand"),
            notable_features=tags.get("notable_features", []),
        ),
        detection_pass=detection_pass,
        missed_reason=raw_item.get("missed_reason"),
    )


# ---------------------------------------------------------------------------
# Visualization
# ---------------------------------------------------------------------------

def draw_inventory(
    image_path: str,
    items: list[InventoryItem],
    output_path: str | None = None,
    show_labels: bool = True,
) -> Image.Image:
    """Draw bounding boxes and labels on the image."""
    img = Image.open(image_path)
    draw = ImageDraw.Draw(img)
    w, h = img.size

    for item in items:
        x1, y1, x2, y2 = item.bounding_box.to_pixels(w, h)
        color = CATEGORY_COLORS.get(item.category, "#FFFFFF")
        line_width = 3 if item.detection_pass == 2 else 2
        draw.rectangle([x1, y1, x2, y2], outline=color, width=line_width)

        if show_labels:
            label = f"{item.id}:{item.object[:25]}"
            text_bb = draw.textbbox((x1, y1 - 14), label)
            draw.rectangle(
                [text_bb[0] - 1, text_bb[1] - 1, text_bb[2] + 1, text_bb[3] + 1],
                fill=color,
            )
            draw.text((x1, y1 - 14), label, fill="black")

    if output_path:
        img.save(output_path)

    return img


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

class HomeInventoryPipeline:
    """Two-pass home inventory detection pipeline.

    Usage:
        pipeline = HomeInventoryPipeline(api_key="sk-...", provider="openrouter")
        result = await pipeline.analyze("living_room.jpg")
        result.save_json("inventory.json")
        annotated = pipeline.visualize(result, "annotated.png")
    """

    def __init__(
        self,
        api_key: str,
        provider: str = "openrouter",
        model: str | None = None,
        two_pass: bool = True,
        max_image_size: int = 1024,
    ):
        self.client = VLMClient(api_key=api_key, provider=provider, model=model)
        self.two_pass = two_pass
        self.max_image_size = max_image_size

    async def analyze(
        self,
        image_path: str | Path,
        output_path: str | Path | None = None,
    ) -> InventoryResult:
        """Run the full detection pipeline on an image.

        Args:
            image_path: Path to the room photograph.
            output_path: Optional path to save the JSON inventory.

        Returns:
            InventoryResult with all detected items.
        """
        image_path = str(image_path)
        img = Image.open(image_path)
        img_w, img_h = img.size

        # --- Pass 1: Initial detection ---
        print(f"[Pass 1] Detecting objects in {image_path} ({img_w}x{img_h})...")
        prompt1 = build_pass1_prompt(img_w, img_h)
        raw1 = await self.client.query(prompt1, image_path)
        data1 = parse_vlm_json(raw1)

        items = [
            parse_item(raw, img_w, img_h, detection_pass=1)
            for raw in data1.get("items", [])
        ]
        print(f"[Pass 1] Found {len(items)} items")

        # --- Pass 2: Audit for missed items ---
        if self.two_pass:
            print("[Pass 2] Auditing for missed items...")
            prompt2 = build_pass2_prompt(img_w, img_h, data1.get("items", []))
            raw2 = await self.client.query(prompt2, image_path)
            data2 = parse_vlm_json(raw2)

            new_items = [
                parse_item(raw, img_w, img_h, detection_pass=2)
                for raw in data2.get("new_items", [])
            ]
            items.extend(new_items)
            print(f"[Pass 2] Found {len(new_items)} additional items")

        result = InventoryResult(
            image_path=image_path,
            image_dimensions={"width": img_w, "height": img_h},
            room_type=data1.get("room_type", "Unknown"),
            detection_passes=2 if self.two_pass else 1,
            items=items,
        )

        if output_path:
            result.save_json(output_path)
            print(f"Saved inventory to {output_path}")

        print(f"Total: {result.total_items} items, "
              f"avg confidence: {result.avg_confidence:.1%}")
        print(f"Categories: {result.category_breakdown}")

        return result

    def visualize(
        self,
        result: InventoryResult,
        output_path: str | None = None,
    ) -> Image.Image:
        """Draw detection results on the original image."""
        return draw_inventory(
            result.image_path,
            result.items,
            output_path=output_path,
        )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(
        description="Home Inventory Vision Pipeline"
    )
    parser.add_argument("--image", required=True, help="Path to room photo")
    parser.add_argument("--output", default="inventory.json", help="Output JSON path")
    parser.add_argument("--annotated", default="annotated.png", help="Annotated image path")
    parser.add_argument("--api-key", required=True, help="API key for the VLM provider")
    parser.add_argument(
        "--provider",
        default="openrouter",
        choices=["openrouter", "openai", "google"],
        help="VLM API provider",
    )
    parser.add_argument("--model", default=None, help="Override default model")
    parser.add_argument("--single-pass", action="store_true", help="Skip second pass")
    args = parser.parse_args()

    pipeline = HomeInventoryPipeline(
        api_key=args.api_key,
        provider=args.provider,
        model=args.model,
        two_pass=not args.single_pass,
    )

    result = await pipeline.analyze(args.image, output_path=args.output)
    pipeline.visualize(result, output_path=args.annotated)
    print(f"\nDone. {result.total_items} items saved to {args.output}")
    print(f"Annotated image saved to {args.annotated}")


if __name__ == "__main__":
    asyncio.run(main())
