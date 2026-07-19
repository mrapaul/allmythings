# $D^3$ Leaderboard Documentation

Generated from: https://raw.githubusercontent.com/shikras/d-cube/main/eval_sota/README.md

## Leaderboard Summary

This leaderboard shows state-of-the-art methods evaluated on the $D^3$ dataset across multiple tasks (REC/OVD/DOD/MLLM).

### Method Categories
- **DTER**: Detection with Text-based prompts (e.g., GLIP, UNINEXT, Grounding-DINO)
- **MLLM**: Multi-modal Large Language Models (e.g., SPHINX, OFA)
- **Diffusion**: Not present in current leaderboard
- **Hybrid**: Combination approaches (e.g., MM-Grounding-DINO, APE)

### Granularity Levels
- **Coarse**: OVD (Open-Vocabulary Detection)
- **Medium**: REC (Region Captioning) + OVD
- **Fine**: DOD (Described Object Detection) + REC + OVD

### Datasets Commonly Used
- COCO, LVIS, O365, OpenImages, Visual Genome
- RefCOCO/+/g, SA-1B, GQA, PhraseCut, Flickr30k
- GoldG, GRIT, V3Det (for MM-Grounding-DINO)

## Evaluation Metrics

The metrics format is: Intra-FULL/Intra-PRES/Intra-ABS/Inter-FULL/Inter-PRES/Inter-ABS
