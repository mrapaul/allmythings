#!/usr/bin/env python3
"""Local Apple Silicon QLoRA dry-run for Qwen3-VL via mlx-vlm (>=0.6.x, which
supports Qwen3-VL LoRA; Qwen3-VL train-shape bug #652 fixed Feb 2026).

Converts the ms-swift JSONL (build_vlm_dataset.py output) into the HF-dataset
layout mlx_vlm.lora expects ("images" + "messages" columns, content as
{type:image}/{type:text} parts), then launches the trainer on a 4-bit base
(QLoRA: frozen 4-bit weights + full-precision adapters).

This is a feasibility/smoke loop — the production run stays ms-swift on
Lambda (training/vlm_lora/train.py). Adapter lands in training/output/.

MEMORY: MLX shares the Mac's unified memory with anything Ollama is holding.
A resident qwen3-vl:30b costs ~22GB of 48GB and reliably causes
"[METAL] Command buffer execution failed: Insufficient Memory" here even
though only ~16.5M LoRA params train. Ollama does not always release VRAM on
keep_alive=0, so check `curl 127.0.0.1:11434/api/ps` before a run and prefer
--resize 448 --seq-len 1536 when large models are resident.

Usage:
  python3 training/vlm_lora/train_mlx.py [--iters 200] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL = "mlx-community/Qwen3-VL-4B-Instruct-4bit"  # ~3.1 GB


def convert_jsonl(src: Path, dest_dir: Path, limit: int | None = None) -> int:
    """ms-swift record -> mlx-vlm record (content parts instead of a flat
    string with an <image> prefix)."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    with open(src, encoding="utf-8") as fin, open(
        dest_dir / "train.jsonl", "w", encoding="utf-8"
    ) as fout:
        for line in fin:
            if not line.strip():
                continue
            if limit is not None and count >= limit:
                break
            rec = json.loads(line)
            user, assistant = rec["messages"][0], rec["messages"][1]
            prompt_text = user["content"].removeprefix("<image>")
            out = {
                "images": rec["images"],
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "image"},
                            {"type": "text", "text": prompt_text},
                        ],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": assistant["content"]}],
                    },
                ],
            }
            fout.write(json.dumps(out, ensure_ascii=False) + "\n")
            count += 1
    return count


def build_command(args, dataset_dir: Path) -> list:
    return [
        sys.executable, "-m", "mlx_vlm.lora",
        "--model-path", args.model,
        "--dataset", str(dataset_dir),
        "--split", "train",
        "--iters", str(args.iters),
        "--batch-size", str(args.batch_size),
        "--gradient-accumulation-steps", str(args.grad_accum),
        "--learning-rate", str(args.lr),
        "--lora-rank", str(args.lora_rank),
        "--lora-alpha", str(args.lora_alpha),
        "--max-seq-length", str(args.seq_len),
        "--grad-checkpoint",
        "--image-resize-shape", str(args.resize), str(args.resize),
        "--steps-per-save", str(args.steps_per_save),
        "--steps-per-report", str(args.steps_per_report),
        "--output-path", str(args.output),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jsonl", type=Path, default=REPO_ROOT / "training/data/vlm/train.jsonl")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--iters", type=int, default=200)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--lora-rank", type=int, default=8)
    parser.add_argument("--lora-alpha", type=int, default=16)
    parser.add_argument("--seq-len", type=int, default=4096)
    parser.add_argument("--resize", type=int, default=784)
    parser.add_argument("--limit", type=int, default=None, help="cap converted records")
    parser.add_argument("--steps-per-save", type=int, default=50)
    parser.add_argument("--steps-per-report", type=int, default=10)
    parser.add_argument(
        "--output",
        type=Path,
        default=REPO_ROOT / "training/output/vlm_lora_mlx/adapters.safetensors",
    )
    parser.add_argument("--dry-run", action="store_true", help="convert + print command only")
    args = parser.parse_args()

    if not args.jsonl.is_file():
        print(f"{args.jsonl} missing — run `make train-dataset-vlm` first", file=sys.stderr)
        return 1
    dataset_dir = args.jsonl.parent / "mlx"
    count = convert_jsonl(args.jsonl, dataset_dir, args.limit)
    print(f"converted {count} records -> {dataset_dir / 'train.jsonl'}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    cmd = build_command(args, dataset_dir)
    print("+ " + " ".join(cmd), flush=True)
    if args.dry_run:
        return 0
    return subprocess.run(cmd, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
