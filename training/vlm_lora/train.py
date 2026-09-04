#!/usr/bin/env python3
"""Qwen3-VL LoRA fine-tune driver: config.yaml -> `swift sft` -> merge ->
GGUF conversion (llama.cpp) with vLLM as the primary serving path.

Serving verdict (researched 2026-07):
- llama.cpp supports Qwen3-VL vision since PR #16780 (Oct 2025):
  convert_hf_to_gguf.py produces model GGUF + `--mmproj` projector GGUF, and
  `llama-server -m model.gguf --mmproj mmproj.gguf` serves an OpenAI-compatible
  API. Set LLAMACPP_DIR to enable the conversion step.
- Ollama CANNOT reliably import a custom Qwen3-VL GGUF via Modelfile
  (ollama/ollama#13101, #16264) — only its official `qwen3-vl:*` weights work.
- PRIMARY serving: vLLM >= 0.11.0 (`vllm serve <merged-dir>`), OpenAI API.
  api-service would need an OpenAI-compatible VlmClient alongside
  OllamaVlmClient in vlm-detector.factory.ts to consume it (not changed here).

Resume-safe: rerunning picks up the newest checkpoint automatically.
W&B: enabled only when WANDB_API_KEY is set.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
SWIFT_PASSTHROUGH_KEYS = (
    "tuner_type", "lora_rank", "lora_alpha", "learning_rate", "num_train_epochs",
    "per_device_train_batch_size", "gradient_accumulation_steps", "torch_dtype",
    "freeze_vit", "freeze_aligner", "packing", "attn_impl", "max_length",
    "warmup_ratio", "save_steps", "eval_steps", "logging_steps", "save_total_limit",
)


def load_config(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def latest_checkpoint(output_dir: Path) -> Path | None:
    """ms-swift writes <output_dir>/<version>/checkpoint-<step>."""
    if not output_dir.is_dir():
        return None
    checkpoints = sorted(
        output_dir.glob("**/checkpoint-*"), key=lambda p: p.stat().st_mtime
    )
    return checkpoints[-1] if checkpoints else None


def build_sft_command(cfg: dict, resume_from: Path | None) -> list:
    cmd = [
        "swift", "sft",
        "--model", cfg["model"],
        "--dataset", str(REPO_ROOT / cfg["dataset"]),
        "--val_dataset", str(REPO_ROOT / cfg["val_dataset"]),
        "--output_dir", str(REPO_ROOT / cfg["output_dir"]),
    ]
    for key in SWIFT_PASSTHROUGH_KEYS:
        if key in cfg:
            cmd += [f"--{key}", str(cfg[key]).lower() if isinstance(cfg[key], bool) else str(cfg[key])]
    cmd += ["--report_to", "wandb" if os.environ.get("WANDB_API_KEY") else "none"]
    if resume_from is not None:
        cmd += ["--resume_from_checkpoint", str(resume_from)]
    cmd += [str(a) for a in cfg.get("extra_args", [])]
    return cmd


def run(cmd: list, env_extra: dict) -> None:
    env = {**os.environ, **{k: str(v) for k, v in env_extra.items()}}
    print("+ " + " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, env=env)


def merge_lora(cfg: dict, checkpoint: Path) -> Path:
    merged_dir = checkpoint.parent / f"{checkpoint.name}-merged"
    run(
        [
            "swift", "export",
            "--adapters", str(checkpoint),
            "--merge_lora", "true",
            "--output_dir", str(merged_dir),
        ],
        cfg.get("env", {}),
    )
    return merged_dir


def convert_gguf(merged_dir: Path) -> None:
    llamacpp = os.environ.get("LLAMACPP_DIR")
    if not llamacpp:
        print(
            "\nLLAMACPP_DIR not set — skipping GGUF conversion.\n"
            f"Serve now with: vllm serve {merged_dir} --served-model-name qwen3vl-inventory"
        )
        return
    convert = Path(llamacpp) / "convert_hf_to_gguf.py"
    out_model = merged_dir / "model-f16.gguf"
    out_mmproj = merged_dir / "mmproj-f16.gguf"
    run([sys.executable, str(convert), str(merged_dir), "--outfile", str(out_model), "--outtype", "f16"], {})
    run([sys.executable, str(convert), str(merged_dir), "--mmproj", "--outfile", str(out_mmproj), "--outtype", "f16"], {})
    print(
        f"\nGGUF ready. Serve with:\n"
        f"  llama-server -m {out_model} --mmproj {out_mmproj} --port 8080\n"
        f"(Do NOT import into Ollama via Modelfile — broken for Qwen3-VL, see module docstring.)"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.yaml"))
    parser.add_argument("--skip-train", action="store_true", help="only merge/convert the newest checkpoint")
    args = parser.parse_args()

    cfg = load_config(args.config)
    output_dir = REPO_ROOT / cfg["output_dir"]

    if not args.skip_train:
        resume = latest_checkpoint(output_dir)
        if resume:
            print(f"resuming from {resume}")
        run(build_sft_command(cfg, resume), cfg.get("env", {}))

    checkpoint = latest_checkpoint(output_dir)
    if checkpoint is None:
        print("no checkpoint found — nothing to export", file=sys.stderr)
        return 1
    merged = merge_lora(cfg, checkpoint)
    convert_gguf(merged)
    print(
        f"\nnext: serve the candidate, then gate it on the oracle:\n"
        f"  node training/eval_candidate.mjs qwen3vl-inventory --url http://localhost:8000/v1"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
