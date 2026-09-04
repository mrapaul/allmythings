"""Local text embeddings via Ollama (nomic-embed-text:v1.5 — the same model
api-service uses). No network at import time; every call degrades gracefully so
dataset builds never hard-fail on a missing Ollama."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_MODEL = "nomic-embed-text:v1.5"
DEFAULT_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
BATCH_SIZE = 64
TIMEOUT_S = 120
# nomic-embed-text is trained with task prefixes; omitting them measurably
# degrades clustering quality.
DOC_PREFIX = "search_document: "


class EmbedderUnavailable(RuntimeError):
    pass


def _post(url: str, payload: dict, timeout: int = TIMEOUT_S) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — fixed localhost
        return json.loads(resp.read().decode("utf-8"))


def is_available(base_url: str = DEFAULT_BASE_URL, model: str = DEFAULT_MODEL) -> bool:
    try:
        _post(f"{base_url}/api/embed", {"model": model, "input": ["ping"]}, timeout=10)
        return True
    except (urllib.error.URLError, OSError, ValueError, KeyError):
        return False


def embed_texts(
    texts,
    base_url: str = DEFAULT_BASE_URL,
    model: str = DEFAULT_MODEL,
    cache_path: Path | None = None,
    prefix: str = DOC_PREFIX,
) -> dict:
    """{text: vector} for every input. Disk cache keyed by model+prefix+text so
    reruns over a growing dataset only embed what is new."""
    texts = list(dict.fromkeys(texts))
    cache: dict = {}
    if cache_path and cache_path.is_file():
        try:
            raw = json.loads(cache_path.read_text(encoding="utf-8"))
            if raw.get("model") == model and raw.get("prefix") == prefix:
                cache = raw.get("vectors", {})
        except (ValueError, OSError):
            cache = {}

    missing = [t for t in texts if t not in cache]
    if missing:
        for start in range(0, len(missing), BATCH_SIZE):
            batch = missing[start : start + BATCH_SIZE]
            try:
                resp = _post(
                    f"{base_url}/api/embed",
                    {"model": model, "input": [prefix + t for t in batch]},
                )
            except (urllib.error.URLError, OSError, ValueError) as e:
                raise EmbedderUnavailable(f"{base_url} /api/embed failed: {e}") from e
            vectors = resp.get("embeddings")
            if not vectors or len(vectors) != len(batch):
                raise EmbedderUnavailable("embed response shape mismatch")
            cache.update(dict(zip(batch, vectors)))
        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(
                json.dumps({"model": model, "prefix": prefix, "vectors": cache}),
                encoding="utf-8",
            )
    return {t: cache[t] for t in texts}


def normalize(vec) -> list:
    norm = sum(v * v for v in vec) ** 0.5
    return [v / norm for v in vec] if norm else list(vec)


def cosine_distance(a, b) -> float:
    """Assumes both inputs are L2-normalized (see normalize)."""
    return 1.0 - sum(x * y for x, y in zip(a, b))
