#!/usr/bin/env bash
# Provision a fresh Lambda Cloud instance (1x A100/H100) and launch training
# inside tmux. Run FROM the instance after uploading the repo's training/ dir
# and datasets:
#
#   # from your Mac — upload code + built datasets (images included):
#   rsync -avz --exclude output/ training/ ubuntu@<lambda-ip>:~/allmythings-training/training/
#   rsync -avz training/data/ ubuntu@<lambda-ip>:~/allmythings-training/training/data/
#   # alternative for large datasets: push once to a private HF dataset repo
#   # (hf upload <user>/allmythings-flywheel training/data --repo-type dataset)
#   # and `hf download` it here — gives revision-pinned dataset versions per round.
#
#   ssh ubuntu@<lambda-ip>
#   export WANDB_API_KEY=...   # optional, enables W&B logging
#   export HF_TOKEN=...        # optional, private HF repos
#   bash ~/allmythings-training/training/lambda/launch.sh [vlm|detr|both]
# WHY LAMBDA AND NOT THE MAC: MLX shares the Mac's unified memory with Ollama,
# which holds ~22GB for a resident qwen3-vl:30b and does NOT release it on
# keep_alive=0. Qwen3-VL-4B QLoRA then dies with "[METAL] Command buffer
# execution failed: Insufficient Memory" even though only ~16.5M LoRA params
# train. For a local run: stop the API and `pkill ollama` first, or accept a
# 4B / 448px ceiling (training/vlm_lora/train_mlx.py). Lambda is the real venue.
set -euo pipefail

TARGET="${1:-vlm}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV="$HOME/.venv-training"

command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

[ -d "$VENV" ] || uv venv "$VENV" --python 3.11
# shellcheck disable=SC1091
source "$VENV/bin/activate"
uv pip install -r "$ROOT/training/requirements.txt"

# llama.cpp for the GGUF conversion step (skipped by train.py if absent)
if [ ! -d "$HOME/llama.cpp" ]; then
  git clone --depth 1 https://github.com/ggml-org/llama.cpp "$HOME/llama.cpp"
  uv pip install -r "$HOME/llama.cpp/requirements/requirements-convert_hf_to_gguf.txt"
fi
export LLAMACPP_DIR="$HOME/llama.cpp"

SESSION="training-$TARGET"
tmux has-session -t "$SESSION" 2>/dev/null && { echo "session $SESSION already running: tmux attach -t $SESSION"; exit 0; }

case "$TARGET" in
  vlm)  CMD="python3 $ROOT/training/vlm_lora/train.py" ;;
  detr) CMD="python3 $ROOT/training/rf_detr/train.py --dataset-dir $ROOT/training/data/detr --output-dir $ROOT/training/output/rf_detr" ;;
  both) CMD="python3 $ROOT/training/vlm_lora/train.py && python3 $ROOT/training/rf_detr/train.py --dataset-dir $ROOT/training/data/detr --output-dir $ROOT/training/output/rf_detr" ;;
  *) echo "usage: launch.sh [vlm|detr|both]"; exit 1 ;;
esac

tmux new-session -d -s "$SESSION" \
  "cd $ROOT && source $VENV/bin/activate && $CMD 2>&1 | tee $ROOT/training/output/$SESSION.log"
echo "launched: tmux attach -t $SESSION"
echo "log:      $ROOT/training/output/$SESSION.log"
