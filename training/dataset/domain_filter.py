"""Decide which source class names belong to the home-inventory domain.

Why an LLM judge and not embedding similarity: similarity to a seed phrase was
measured against COCO's 80 classes and does not separate the domain — cosine
distances compress into a narrow band (0.29-0.48) where "car" (0.361) beats
"cup" (0.389) and "elephant" (0.421) beats "fork" (0.424), so no threshold
keeps potted plants without also keeping zebras. A yes/no judgement from the
local VLM is one cheap cached call per DISTINCT class name (tens of calls, not
per-image) and is accurate on exactly the cases the embedder confuses.

No maintained object list: the judgement is produced, cached, and reproducible.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.environ.get("DOMAIN_JUDGE_MODEL", "qwen3-vl:8b-instruct")
CACHE_PATH = Path(__file__).resolve().parents[1] / "data" / "domain_judgements.json"
TIMEOUT_S = 60

PROMPT = """You are filtering object-detection class names for a HOME INVENTORY app that catalogs the movable contents of people's homes.

Answer YES if the object is a physical thing normally found INSIDE a home and owned as household contents (furniture, decor, appliances, kitchenware, electronics, textiles, personal belongings).
Answer NO if it is an outdoor/street object, a vehicle, an animal, a person or body part, a building/architectural surface, food or produce, or sports/outdoor equipment.

Object: "{label}"

Reply with exactly one word: YES or NO."""


class JudgeUnavailable(RuntimeError):
    pass


def _generate(label: str, base_url: str, model: str) -> str:
    payload = {
        "model": model,
        "prompt": PROMPT.format(label=label),
        "stream": False,
        "options": {"temperature": 0, "num_predict": 4},
    }
    req = urllib.request.Request(
        f"{base_url}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:  # noqa: S310 — fixed localhost
        return json.loads(resp.read().decode("utf-8")).get("response", "")


def _load_cache(path: Path, model: str) -> dict:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw.get("judgements", {}) if raw.get("model") == model else {}
    except (OSError, ValueError):
        return {}


def judge_labels(
    labels,
    base_url: str = DEFAULT_BASE_URL,
    model: str = DEFAULT_MODEL,
    cache_path: Path | None = CACHE_PATH,
    generate=None,
) -> dict:
    """{label: bool}. Raises JudgeUnavailable if the very first call fails, so
    callers can fall back; later failures default to keeping the label."""
    generate = generate or (lambda lbl: _generate(lbl, base_url, model))
    labels = [lbl for lbl in dict.fromkeys(labels) if lbl]
    cache = _load_cache(cache_path, model) if cache_path else {}
    out: dict = {}
    first = True
    for label in labels:
        if label in cache:
            out[label] = cache[label]
            continue
        try:
            reply = generate(label)
        except (urllib.error.URLError, OSError, ValueError) as e:
            if first:
                raise JudgeUnavailable(f"{base_url} /api/generate failed: {e}") from e
            print(f"WARNING: judge failed for '{label}' — keeping it: {e}", file=sys.stderr)
            out[label] = True
            continue
        finally:
            first = False
        out[label] = parse_verdict(reply)
        cache[label] = out[label]
    if cache_path and labels:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(
            json.dumps({"model": model, "judgements": cache}, indent=2), encoding="utf-8"
        )
    return out


def parse_verdict(reply: str) -> bool:
    """Tolerant of reasoning preambles and stray punctuation; an unreadable
    reply keeps the label (over-inclusion is recoverable, loss is not)."""
    text = (reply or "").strip().lower()
    if not text:
        return True
    for token in text.replace(".", " ").replace(",", " ").replace("*", " ").split():
        if token.startswith("yes"):
            return True
        if token.startswith("no"):
            return False
    return True


def in_domain(labels, **kwargs) -> set:
    return {lbl for lbl, keep in judge_labels(labels, **kwargs).items() if keep}
