# Quality-tier bring-up guide

The API serves two VLM tiers (env-driven, per-request):

- **standard** — local Ollama (`OLLAMA_BASE_URL` / `OLLAMA_MODEL`). Today this
  is `qwen3-vl:30b-a3b-instruct` on the M4 Pro and *is* the de-facto quality
  path (~110 s/photo, 15 items on the living-room fixture).
- **quality** — any OpenAI-compatible endpoint (`QUALITY_VLM_URL`,
  `QUALITY_VLM_API_KEY`, `QUALITY_VLM_MODEL`, optional
  `QUALITY_VLM_TIMEOUT_MS` which defaults to `VLM_TIMEOUT_MS`). Selected with
  `POST /v1/detect?tier=quality`. If URL/model are empty the API rejects the
  tier with a 4xx before touching the photo.

The cloud tier only matters for **offload + speed** (30B in seconds instead of
~2 min) and for training (QLoRA runs). Detection accuracy is already at the
30B level locally.

## Attach a backend (any row of the table)

1. Set the four env vars in `api-service/.env`:
   ```bash
   QUALITY_VLM_URL=https://your-host/v1          # OpenAI-compatible base
   QUALITY_VLM_API_KEY=sk-...                    # Bearer token (may be empty on Tailscale)
   QUALITY_VLM_MODEL=qwen3-vl:30b-a3b-instruct   # whatever the endpoint serves
   ```
2. Restart the API:
   `launchctl kickstart -k gui/$(id -u)/com.allmythings.api`
3. Verify: `./scripts/quality-tier-doctor.sh` (endpoint probe + one live
   quality-tier detect; a clean FAIL tells you which hop died).
4. A/B against the local baselines in `eval/results-2026-09-18.md`:
   `DETECT_TIER=quality node eval/harness.mjs api:<tag>`
   (slow remote backend? add `OLLAMA_TIMEOUT_MS=600000`.)

## Option matrix (verified 2026-09-30)

| Option | Cost | Activation effort | 30B latency | Verdict |
|---|---|---|---|---|
| Local 30B on M4 Pro (current prod) | $0 | none | ~110 s/photo | Default; keep |
| Azure A100 (`infra/azure/deploy.sh`) | ~$3.06/h on-demand, ~40–60% off spot; at ~300 det/day ≈ 25 GPU-min/day if deallocated | **Portal quota request** for `Standard NCADS_A100_v4 Family` in uksouth — verified 0 on both the work and personal subscriptions (2026-10-05) | ~5–10 s | Ready to run the moment quota is approved |
| Lambda cloud | ~$1.10–1.65/h A100; **$1000 credit live** (2026-10-05) | create API key → `LAMBDA_API_KEY=... infra/lambda/deploy.sh` | ~5–10 s | **Ready — the funded path.** Credit ≈ 900 A100-hours; at this workload that's months. `infra/lambda/destroy.sh` halts billing |
| GCP ($300/90-day trial if unused) | trial covers it | new billing account + L4/A100 **quota request** (Compute API not enabled on current project) | L4 ~10–20 s | Trial-only; quota asks on trial accounts can be slow |
| OpenRouter paygo | ~$15/mo at this volume | sign up, copy key | ~10–30 s | Documented paid fallback; zero infra |
| NVIDIA NIM free tier | $0 | — | — | **Not viable** — pool saturated most of the week (see `eval/results-2026-09-18.md`) |
| nixos box (Tailscale, CPU-only) | $0 | already up | 12–19 min/pass | **Not for serving.** Use for overnight RF-DETR retraining (`make train-rf-detr`) |

## Notes

- Self-hosted serving on the cloud box: SGLang over vLLM for Qwen3-VL
  (vLLM image-processing regression, vLLM issue #29869). The Azure
  `infra/azure/docker-compose.yml` stack already implements the serving side.
- Never stop local Ollama or the API permanently; restart via launchd and
  check `http://127.0.0.1:14000/v1/health` when done.
