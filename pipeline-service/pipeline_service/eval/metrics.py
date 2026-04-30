"""§7 eval-rig metrics.

All metrics are deterministic transforms of ``SceneObservation`` fields the
pipeline already computed, OR consistency metrics over paired captures of the
same physical scene (``multi_frame_stability``).

No human ground truth required — that's the whole point of agreement-driven
scoring.
"""
from __future__ import annotations

import base64
from typing import Iterable

import numpy as np

from pipeline_service.types import PipelineDetection, SceneObservation


# ---------- aggregate metrics over a list of observations ---------------------

def agreement_coverage_avg(observations: Iterable[SceneObservation]) -> float:
    obs = list(observations)
    if not obs:
        return 0.0
    return float(sum(o.agreementCoverage for o in obs) / len(obs))


def agreement_precision_avg(observations: Iterable[SceneObservation]) -> float:
    obs = list(observations)
    if not obs:
        return 0.0
    return float(sum(o.agreementPrecision for o in obs) / len(obs))


def self_diagnosis_trigger_rate(observations: Iterable[SceneObservation]) -> float:
    obs = list(observations)
    if not obs:
        return 0.0
    return sum(1 for o in obs if o.selfDiagnosisTriggered) / len(obs)


def op_failure_rate(observations: Iterable[SceneObservation]) -> float:
    obs = list(observations)
    if not obs:
        return 0.0
    return sum(1 for o in obs if o.errors) / len(obs)


def single_source_run_rate(observations: Iterable[SceneObservation]) -> float:
    obs = list(observations)
    if not obs:
        return 0.0
    return sum(1 for o in obs if o.flagReason == "single_source_run") / len(obs)


def empty_detection_set_rate(observations: Iterable[SceneObservation]) -> float:
    obs = list(observations)
    if not obs:
        return 0.0
    return sum(1 for o in obs if o.flagReason == "empty_detection_set") / len(obs)


# ---------- pairwise consistency ----------------------------------------------

def _decode_int8_embedding(b64: str | None) -> np.ndarray | None:
    """Decode the int8-quantised cropEmbedding shipped to the device.

    cropEmbeddingB64 is base64-encoded int8[768]; we dequantise via /127.0
    (the inverse of crop_embedding's quantise_to_int8).
    """
    if not b64:
        return None
    raw = base64.b64decode(b64)
    if len(raw) != 768:
        return None
    int8 = np.frombuffer(raw, dtype=np.int8)
    return (int8.astype(np.float32) / 127.0)


def _det_vec(det: PipelineDetection) -> np.ndarray | None:
    return _decode_int8_embedding(det.cropEmbeddingB64)


def multi_frame_stability(
    scene_a: SceneObservation,
    scene_b: SceneObservation,
    *,
    cosine_threshold: float = 0.85,
) -> float:
    """Jaccard overlap of detection embeddings between two captures of the
    same physical scene.

    A pair (a, b) is a "match" iff cosine(a.embedding, b.embedding) >=
    threshold. Greedy assignment: detections from each side are processed
    in detection_id order, picking the highest-cosine still-unmatched
    counterpart.

    Empty inputs return 0.0 (consistency metric is undefined on empty
    sets — we choose 0.0 over NaN by convention).
    """
    if not scene_a.detections or not scene_b.detections:
        return 0.0
    dets_a = sorted(scene_a.detections, key=lambda d: d.id)
    dets_b = sorted(scene_b.detections, key=lambda d: d.id)
    vecs_a: list[tuple[str, np.ndarray | None]] = [(d.id, _det_vec(d)) for d in dets_a]
    vecs_b: list[tuple[str, np.ndarray | None]] = [(d.id, _det_vec(d)) for d in dets_b]
    used_b: set[int] = set()
    matched = 0
    for _, va in vecs_a:
        if va is None:
            continue
        best_j = -1
        best_cos = -1.0
        for j, (_, vb) in enumerate(vecs_b):
            if j in used_b or vb is None:
                continue
            cos = float(
                np.dot(va, vb)
                / (np.linalg.norm(va) * np.linalg.norm(vb) + 1e-9)
            )
            if cos >= cosine_threshold and cos > best_cos:
                best_j, best_cos = j, cos
        if best_j >= 0:
            used_b.add(best_j)
            matched += 1
    union = len(dets_a) + len(dets_b) - matched
    if union <= 0:
        return 0.0
    return matched / union
