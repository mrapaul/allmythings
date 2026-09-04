#!/usr/bin/env python3
"""REFERENCE-ONLY detector sidecar for the benchmark. Emits the same JSON array
the VLM contenders produce, so run_benchmark.mjs scores every contender through
one code path.

NOT SHIPPABLE: ultralytics (YOLOE, RT-DETR) is AGPL-3.0 — using its weights in
this product would force us to publish the whole app under AGPL. These entries
exist purely as a published-SOTA reference line. Grounding-DINO is Apache-2.0
but is a promptable detector, not an inventory describer.

Handicap disclosure: closed-set detectors (RT-DETR on COCO) can only emit their
80 fixed class names, which are mapped through taxonomy.json into inventory
labels. Open-vocab models (YOLOE, Grounding-DINO) are given the taxonomy's
household vocabulary as their prompt. Neither can produce the self-describing
color/material labels the oracle expects, so their recall is measured on an
easier, different task than the VLMs'.

Weights download on first run: yoloe-11l-seg ~55MB, rtdetr-l ~66MB,
grounding-dino-tiny ~690MB.

Usage: python3 reference_detectors.py --arch yoloe|rtdetr|grounding-dino --image PATH
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dataset"))

from derive_taxonomy import DEFAULT_OUT, member_to_class  # noqa: E402
from label_norm import normalize_label  # noqa: E402

CONF_THRESHOLD = 0.25
MAX_PROMPT_CLASSES = 120  # open-vocab prompt breadth; keeps runtime sane


def _derived_classes() -> list:
    if not DEFAULT_OUT.is_file():
        raise SystemExit(
            f"{DEFAULT_OUT} missing — run training/dataset/derive_taxonomy.py first "
            "(the reference detectors are prompted with the DERIVED vocabulary)"
        )
    return json.loads(DEFAULT_OUT.read_text(encoding="utf-8"))["classes"]


def household_vocabulary(limit: int = MAX_PROMPT_CLASSES) -> list:
    """Open-vocab prompt vocabulary, taken from the derived taxonomy ordered by
    frequency — the labels the data actually contains, not an authored list."""
    return [c["name"] for c in _derived_classes()[:limit]]


def to_items(labels) -> list:
    """Detector class names -> benchmark item dicts, folded onto the derived
    classes so synonyms score the same as they would for a VLM."""
    to_class = member_to_class(_derived_classes())
    items = []
    for raw in labels:
        normalized = normalize_label(raw)
        items.append(
            {
                "label": to_class.get(normalized, normalized),
                "category": "Other",
                "primary_color": "unknown",
                "material": "unknown",
                "count": 1,
            }
        )
    return items


def run_ultralytics(arch: str, image: Path) -> list:
    from ultralytics import RTDETR, YOLOE

    if arch == "yoloe":
        model = YOLOE("yoloe-11l-seg.pt")
        vocab = household_vocabulary()
        model.set_classes(vocab, model.get_text_pe(vocab))
    else:
        model = RTDETR("rtdetr-l.pt")
    results = model.predict(str(image), conf=CONF_THRESHOLD, verbose=False)
    labels = []
    for res in results:
        names = res.names
        for box in res.boxes:
            labels.append(names[int(box.cls)])
    return labels


def run_grounding_dino(image: Path) -> list:
    import torch
    from PIL import Image
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

    model_id = "IDEA-Research/grounding-dino-tiny"
    processor = AutoProcessor.from_pretrained(model_id)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id)
    img = Image.open(image).convert("RGB")
    # Grounding-DINO wants a lowercase, period-separated phrase list.
    text = ". ".join(household_vocabulary(60)) + "."
    inputs = processor(images=img, text=text, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    parsed = processor.post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        threshold=CONF_THRESHOLD,
        text_threshold=CONF_THRESHOLD,
        target_sizes=[img.size[::-1]],
    )
    return [lbl for lbl in parsed[0]["labels"] if str(lbl).strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--arch", choices=("yoloe", "rtdetr", "grounding-dino"), required=True)
    parser.add_argument("--image", type=Path, required=True)
    args = parser.parse_args()

    labels = (
        run_grounding_dino(args.image)
        if args.arch == "grounding-dino"
        else run_ultralytics(args.arch, args.image)
    )
    print(json.dumps(to_items(labels)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
