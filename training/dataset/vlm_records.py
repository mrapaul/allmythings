"""Pure builders for Qwen3-VL instruction-tuning records (ms-swift messages
format). Targets replicate the production pass-1 contract from
api-service/src/services/vlm-detector.parse.ts exactly.

Open-vocabulary by design: labels are whatever the source says, normalized only
mechanically. There is NO object taxonomy here — the model learns the label
distribution from the data.

VALID_CATEGORIES below is NOT a curated object list: it mirrors the coarse
category enum that api-service's prompt and parser require (normalizeCategory
rejects anything outside it). It must stay in sync with
api-service/src/services/vlm-detector.parse.ts.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from label_norm import normalize_label

VALID_CATEGORIES: tuple[str, ...] = (
    "Furniture", "Lighting", "Decor", "Textile", "Plant", "Art", "Accessory",
    "Tableware", "Electronics", "Storage", "Kitchenware", "Flooring",
    "Window_Treatment", "Other",
)
FALLBACK_CATEGORY = "Other"

CLOSEUP_MAX_ITEMS = 3
CLOSEUP_MIN_BOX_AREA = 0.35


@dataclass(frozen=True)
class SourceItem:
    """One annotation in source form: pixel COCO bbox + free-form label."""

    label: str
    bbox_xywh_px: tuple[float, float, float, float]
    tags: tuple[str, ...] = field(default_factory=tuple)
    category: str | None = None  # coarse VALID_CATEGORIES value when the source knows it


def build_pass1_prompt(img_w: int, img_h: int) -> str:
    """Verbatim port of buildPass1Prompt from vlm-detector.parse.ts."""
    categories = "|".join(VALID_CATEGORIES)
    return f"""You are a precise home inventory vision system. Analyze this photograph ({img_w}x{img_h} pixels) and list EVERY distinct physical home object visible.

Output exactly ONE JSON object with this structure and NOTHING else:
{{"scene": {{"type": "shelf|drawer|room|closeup", "estimated_total_items": <int>, "photo_quality": {{"verdict": "ok|too_dark|too_blurry|too_far|not_a_scene", "reason": null}}}}, "items": [{{"id": 1, "object": "specific object name", "category": "<one of {categories}>", "bbox_2d": [x1, y1, x2, y2], "tags": {{"color": "...", "material": "..."}}}}, ...]}}

Schema rules (MANDATORY):
- "items" is a flat array with exactly ONE entry per physical object instance. Three pillows = three separate entries. NEVER merge multiple objects into one entry. NEVER use "count" or quantity fields.
- "bbox_2d" is [x1, y1, x2, y2]: exactly four integers on a 0-1000 scale (0,0 = top-left corner, 1000,1000 = bottom-right corner of the image). Boxes must be tight around the object. Do NOT use any other box format or key.
- "object" is a specific, self-describing name that includes the visible color/material/type qualifiers: "white ceramic planter" not "plant pot", "sheer white curtains" not "curtain", "framed painting" not "artwork", "navy blue couch" not "couch", "gold candle holder" not "holder". Keep tag values short; use "unknown" when unsure.
- Emit "scene" BEFORE "items". No markdown, no explanation, no keys other than those shown.

Detection rules:
- Be exhaustive: list EVERY movable object, including small decorative items — throw pillows, vases, plants and their pots, lamps, wall art (each frame is its own entry), rugs (even partially covered), books, candles, bowls, trays, remotes, coasters, figurines. Include stands/stools under plants as separate items, transparent/acrylic furniture, and window blinds behind curtains.
- CRITICAL: NEVER output architectural surfaces as items. Do NOT include wall, walls, floor, flooring, ceiling, window, door, doorway, archway, baseboard, molding, beam, column, or "room"/"background". These are structure, not inventory.
- DO include window treatments (curtains, blinds), light fixtures, and wall-mounted objects (mirrors, art, sconces).
- Count clustered decorative objects separately, not as one.
- "scene".type is "room" when the frame shows a wide view of a whole room. "estimated_total_items" is your best estimate of ALL distinct objects present, including ones you could not list. Use a non-ok "photo_quality" verdict only when the photo is unusable for inventory (severely dark/blurry, subject too far to identify objects, or not a home scene at all)."""


def bbox_px_to_thousand(
    bbox_xywh_px: tuple[float, float, float, float], img_w: int, img_h: int
) -> list[int]:
    x, y, w, h = bbox_xywh_px

    def clamp(v: float) -> int:
        return max(0, min(1000, round(v)))

    x1, y1 = clamp(x / img_w * 1000), clamp(y / img_h * 1000)
    x2, y2 = clamp((x + w) / img_w * 1000), clamp((y + h) / img_h * 1000)
    if x2 <= x1:
        x2 = min(1000, x1 + 1)
    if y2 <= y1:
        y2 = min(1000, y1 + 1)
    return [x1, y1, x2, y2]


def infer_scene_type(items_thousand_boxes: list[list[int]]) -> str:
    """Flywheel records carry no scene block, so derive a defensible one:
    few items dominated by one large box reads as a closeup, else room."""
    if not items_thousand_boxes:
        return "room"
    max_area = max(
        (b[2] - b[0]) / 1000 * (b[3] - b[1]) / 1000 for b in items_thousand_boxes
    )
    if len(items_thousand_boxes) <= CLOSEUP_MAX_ITEMS and max_area >= CLOSEUP_MIN_BOX_AREA:
        return "closeup"
    return "room"


def resolve_category(raw: str | None) -> str:
    """Accept a source-provided coarse category, else Other. Deliberately no
    inference: a guessed category teaches the model a wrong mapping."""
    if not raw:
        return FALLBACK_CATEGORY
    candidate = str(raw).strip()
    for valid in VALID_CATEGORIES:
        if valid.lower() == candidate.lower():
            return valid
    return FALLBACK_CATEGORY


def resolve_tags(tags: tuple[str, ...] | list[str] | None) -> dict[str, str]:
    """Positional read of the flywheel's tag array.

    Justified by production: buildTags in vlm-detector.parse.ts emits tags in a
    fixed key order (color, material, style, ...), so tags[0]/tags[1] are the
    color/material when present. Caveat: an item with no color shifts material
    into position 0, so this is best-effort — the self-describing label carries
    the authoritative attributes. Empty sources yield "unknown"."""
    values = [str(t).strip().lower() for t in (tags or []) if str(t).strip()]
    return {
        "color": values[0] if values else "unknown",
        "material": values[1] if len(values) > 1 else "unknown",
    }


def build_target(items: list[SourceItem], img_w: int, img_h: int) -> dict:
    """Assistant-turn JSON matching the pass-1 output contract."""
    enriched = [(bbox_px_to_thousand(i.bbox_xywh_px, img_w, img_h), i) for i in items]
    # Reading order (top-to-bottom, left-to-right) for stable targets.
    enriched.sort(key=lambda e: (e[0][1], e[0][0]))
    out_items = [
        {
            "id": i + 1,
            "object": normalize_label(item.label) or str(item.label).strip(),
            "category": resolve_category(item.category),
            "bbox_2d": box,
            "tags": resolve_tags(item.tags),
        }
        for i, (box, item) in enumerate(enriched)
    ]
    scene = {
        "type": infer_scene_type([b for b, _ in enriched]),
        "estimated_total_items": len(out_items),
        "photo_quality": {"verdict": "ok", "reason": None},
    }
    return {"scene": scene, "items": out_items}


def build_record(
    image_path: str, items: list[SourceItem], img_w: int, img_h: int
) -> dict:
    """One ms-swift messages-format JSONL record."""
    target = build_target(items, img_w, img_h)
    return {
        "messages": [
            {"role": "user", "content": "<image>" + build_pass1_prompt(img_w, img_h)},
            {"role": "assistant", "content": json.dumps(target, separators=(",", ":"))},
        ],
        "images": [image_path],
    }


def split_of(sha256_hex: str, val_pct: int = 10) -> str:
    """Deterministic train/val assignment so a photo never migrates between
    splits as the flywheel grows."""
    bucket = int(sha256_hex[:8], 16) % 100
    return "val" if bucket < val_pct else "train"
