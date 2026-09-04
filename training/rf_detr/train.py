#!/usr/bin/env python3
"""RF-DETR fine-tune on the merged household COCO dataset
(training/data/detr from build_detr_dataset.py: train/valid/test dirs, each
with _annotations.coco.json). Apache-2.0 variants only (nano..large).

Heavy imports live inside functions so the module imports offline.
W&B logging is enabled only when WANDB_API_KEY is set.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

MODEL_VARIANTS = ("nano", "small", "medium", "large")


def load_model(variant: str, gradient_checkpointing: bool):
    from rfdetr import RFDETRLarge, RFDETRMedium, RFDETRNano, RFDETRSmall

    classes = {
        "nano": RFDETRNano,
        "small": RFDETRSmall,
        "medium": RFDETRMedium,
        "large": RFDETRLarge,
    }
    return classes[variant](gradient_checkpointing=gradient_checkpointing)


def train(args) -> None:
    model = load_model(args.model, args.gradient_checkpointing)
    train_kwargs = {
        "dataset_dir": str(args.dataset_dir),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "grad_accum_steps": args.grad_accum_steps,
        "lr": args.lr,
        "output_dir": str(args.output_dir),
        "early_stopping": True,
        "early_stopping_patience": 12,
        "skip_best_epochs": 3,
        "wandb": bool(os.environ.get("WANDB_API_KEY")),
        "project": os.environ.get("WANDB_PROJECT", "allmythings-rfdetr"),
    }
    if args.resume:
        train_kwargs["resume"] = str(args.resume)
    model.train(**train_kwargs)

    metrics = model.evaluate(dataset_dir=str(args.dataset_dir), split="test")
    print(f"held-out test metrics: {metrics}")
    export(model, args)


def export(model, args) -> None:
    try:
        model.export(output_dir=str(args.output_dir))
        print(f"ONNX exported under {args.output_dir}")
    except Exception as e:  # noqa: BLE001 — export must not kill a finished run
        print(f"ONNX export failed (train result is intact): {e}")
    if args.coreml:
        try:
            model.export(format="coreml", coreml_precision="float16", output_dir=str(args.output_dir))
            print(f"CoreML .mlpackage exported under {args.output_dir}")
        except Exception as e:  # noqa: BLE001
            print(f"CoreML export failed — rerun on macOS with `pip install 'rfdetr[coreml]'`: {e}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", type=Path, default=Path("training/data/detr"))
    parser.add_argument("--output-dir", type=Path, default=Path("training/output/rf_detr"))
    parser.add_argument("--model", choices=MODEL_VARIANTS, default="medium")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=16)  # A100/H100 80GB recipe
    parser.add_argument("--grad-accum-steps", type=int, default=1)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--resume", type=Path, default=None)
    parser.add_argument("--gradient-checkpointing", action="store_true")
    parser.add_argument("--coreml", action="store_true", help="also export CoreML (macOS only)")
    args = parser.parse_args()

    ann = args.dataset_dir / "train" / "_annotations.coco.json"
    if not ann.is_file():
        parser.error(f"{ann} missing — run `make train-dataset-detr` first")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    train(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
