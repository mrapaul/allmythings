# Stage B/C GPU Runbook — Qwen3-VL LoRA flywheel fine-tune

Exact, copy-paste. Verified against LLaMA-Factory `main` on 2026-09-18
(`examples/train_lora/qwen3vl_lora_sft.yaml`, `examples/train_qlora/qwen3_lora_sft_otfq.yaml`,
`data/mllm_demo.json`, `data/dataset_info.json`, [data preparation docs](https://llamafactory.readthedocs.io/en/latest/getting_started/data_preparation.html)).

**Dataset format — VERIFIED COMPATIBLE, no rebuild needed.** LLaMA-Factory's mllm format is
sharegpt/OpenAI `{"messages":[{"role","content"}...], "images":[...]}` with one `<image>` tag per
image path (repo: `data/mllm_demo.json`). `training/data/vlm/{train,val}.jsonl` (1,898 records /
9,728 items, built by `train-dataset-vlm`) is exactly this shape; image paths are absolute and
must resolve identically inside the container (hence the same-path mount below).

## 1. Rent a GPU box

- **Vast.ai**: rent 1× **L40S 48GB** (typ. ~$0.50–0.80/h; verify price at rental time), Ubuntu 22.04
  image with recent NVIDIA driver + Docker + nvidia-container-toolkit preinstalled. For Stage C
  (30B-A3B) prefer an **H100/A100 80GB** (~$2–2.5/h) unless QLoRA at cutoff 4096 on 48GB suffices.
- **Alternative**: Inception DGX Cloud credits — provision a single-GPU instance; same commands.
- No execution/spend was performed writing this runbook.

## 2. Upload data + launch LLaMA-Factory container

```bash
# from the Mac — code, configs, built jsonl, AND the images the jsonl references:
rsync -avz --exclude node_modules --exclude .git \
  /Users/mrarindampaul/Develop/allmythings/ <user>@<gpu-box>:~/allmythings/
ssh <user>@<gpu-box>

# container: mount the upload at the SAME absolute path the jsonl's image paths use
docker run -it --rm --gpus=all --ipc=host --shm-size=16g \
  -v ~/allmythings:/Users/mrarindampaul/Develop/allmythings \
  -v ~/lf-cache:/root/.cache \
  -w /Users/mrarindampaul/Develop/allmythings \
  hiyouga/llamafactory:latest /bin/bash
```

Image `hiyouga/llamafactory:latest` per [LLaMA-Factory README](https://github.com/hiyouga/LLaMA-Factory)
(`docker run --gpus=all hiyouga/llamafactory:latest`). The `~/lf-cache` volume keeps the ~16GB base
model + processed dataset cache between rentals.

## 3. Register the dataset, then train

LLaMA-Factory only loads datasets declared in `dataset_info.json` inside `--dataset_dir`
([docs](https://llamafactory.readthedocs.io/en/latest/getting_started/data_preparation.html)).
Create `training/data/vlm/dataset_info.json` (once):

```json
{
  "allmythings_vlm": {
    "file_name": "train.jsonl",
    "formatting": "sharegpt",
    "columns": { "messages": "messages", "images": "images" },
    "tags": {
      "role_tag": "role", "content_tag": "content",
      "user_tag": "user", "assistant_tag": "assistant"
    }
  }
}
```

### Stage B — Qwen3-VL-8B QLoRA (current 1.9k-image flywheel)

`training/vlm_lora/llamafactory_qwen3vl8b_qlora.yaml`:

```yaml
model_name_or_path: Qwen/Qwen3-VL-8B-Instruct
quantization_bit: 4            # QLoRA
quantization_method: bnb
trust_remote_code: true
image_max_pixels: 262144       # official Qwen3-VL default (matches ms-swift IMAGE_MAX_TOKEN_NUM~1024)
stage: sft
do_train: true
finetuning_type: lora
lora_rank: 8
lora_alpha: 32                 # keep ms-swift recipe (r=8, a=32, lr 1e-4)
lora_target: all
freeze_vision_tower: true      # mirrors ms-swift freeze_vit
dataset: allmythings_vlm
dataset_dir: /Users/mrarindampaul/Develop/allmythings/training/data/vlm
template: qwen3_vl_nothink     # REQUIRED for *-Instruct (non-thinking); qwen3_vl is for *-Thinking
cutoff_len: 4096               # prompts ~600 tok + dense JSON targets; raise to 8192 if truncated
preprocessing_num_workers: 16
dataloader_num_workers: 4
output_dir: /Users/mrarindampaul/Develop/allmythings/training/output/llamafactory/qwen3vl-8b-qlora
overwrite_output_dir: true
logging_steps: 10
save_steps: 100
save_total_limit: 3
bf16: true
per_device_train_batch_size: 1
gradient_accumulation_steps: 8
learning_rate: 1.0e-4
num_train_epochs: 2
lr_scheduler_type: cosine
warmup_ratio: 0.05
report_to: none                # or wandb with WANDB_API_KEY
```

Run (inside the container):

```bash
llamafactory-cli train training/vlm_lora/llamafactory_qwen3vl8b_qlora.yaml
```

No DeepSpeed/FSDP needed — single GPU. ~1,898 imgs → ~475 optimizer steps; expect ~1–1.5 h on L40S.

### Stage C — Qwen3-VL-30B-A3B once ~2k images / ~10k verified boxes

Same recipe, three changes: `model_name_or_path: Qwen/Qwen3-VL-30B-A3B-Instruct`
(Thinking variant needs `template: qwen3_vl`), `lora_rank: 16`, rent 80GB GPU (or 48GB with
cutoff 4096 + gradient checkpointing — MoE QLoRA is tight). `num_train_epochs: 2–3`.
Merge before serving (LoRA adapter of a quantized base is not a servable artifact):

```bash
llamafactory-cli export training/vlm_lora/llamafactory_export.yaml
# export.yaml: same model block + finetuning_type: lora,
#   adapter_name_or_path: <output_dir>/checkpoint-XXX, export_dir: <merged-dir>
```

## 4. Serve the adapter (pick one)

| Option | Command | Tradeoff |
|---|---|---|
| **vLLM, merged (recommended)** | `vllm serve <merged-dir> --served-model-name qwen3vl-inventory --port 8000` | Fastest; OpenAI API; matches `training/eval_candidate.mjs` proxy. Needs vLLM ≥ 0.11 for Qwen3-VL. |
| llama.cpp GGUF | `convert_hf_to_gguf.py <merged-dir>` + `--mmproj` → `llama-server -m model.gguf --mmproj mmproj.gguf` | Mac-servable; slower. **Ollama CANNOT import custom Qwen3-VL GGUFs** (train.py docstring: ollama#13101, #16264) — do not Modelfile it. |
| vLLM LoRA (no merge) | `vllm serve Qwen/Qwen3-VL-8B-Instruct --enable-lora --lora-modules qwen3vl-inventory=<ckpt>` | Skips merge, but Qwen3-VL vision+LoRA serving is less battle-tested; merge first for eval integrity. |

## 5. A/B against base 8B (existing machinery)

```bash
# A) base, via Ollama (terminal 1: ollama serve with qwen3-vl:8b-instruct)
node eval/harness.mjs qwen3-vl:8b-instruct          # -> eval/report-*.json

# B) candidate, via vLLM (terminal 2)
vllm serve <merged-dir> --served-model-name qwen3vl-inventory --port 8000
node training/eval_candidate.mjs qwen3vl-inventory \
  --url http://localhost:8000/v1                    # proxies harness -> OpenAI, writes eval/runs/candidate-*.json
```

Compare `avgRecall` (CI rule in harness: >1% below baseline = REGRESSION). Then gate + model card:

```bash
node training/release/promote.mjs --candidate qwen3vl-inventory \
  --candidate-url http://localhost:8000/v1 \
  --artifact <merged-dir> --recall-floor 79
```

NOTE: `gate.mjs` DEFAULT_RECALL_FLOOR=96.1 is the **full-pipeline** floor. A raw single-call
model scores ~73–80%, so always pass `--recall-floor` at/just-below the measured base-8B recall;
`make train-promote` does NOT forward the flag (Makefile gap) — call promote.mjs directly.

## 6. Cost per run

- Stage B on L40S @ ~$0.5–0.8/h: 1–1.5 h train + ~10 min merge/export ⇒ **~$1–1.5/run** (+ $0.05–0.10 storage/egress; keep `~/lf-cache` between rentals to skip the 16GB re-download).
- A/B eval: local Mac + existing Ollama/vLLM — $0.
- Stage C on H100 @ ~$2–2.5/h: ~2–4 h ⇒ **~$5–10/run**.
