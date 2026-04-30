"""Env-driven configuration for the pipeline-service sidecar.

All section-01 thresholds + ports + paths are read here.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


def _bool(value: Optional[str], default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(value: Optional[str], default: int) -> int:
    if value is None or value == "":
        return default
    return int(value)


def _path(value: Optional[str], default: Path) -> Path:
    if value is None or value == "":
        return default
    return Path(value).expanduser()


@dataclass(frozen=True)
class PipelineRuntimeConfig:
    bind_host: str
    port: int
    dagster_home: Path
    photo_dir: Path
    max_queue_depth: int
    run_retention: int
    log_redaction_enabled: bool
    # mirrored thresholds — wire-shape mirrors live in types.PipelineConfig
    detection_confidence_min: float = 0.30
    sahi_trigger_density: float = 5.0
    cross_pass_embedding_theta: float = 0.88
    cross_frame_embedding_theta: float = 0.85
    label_text_compat_theta: float = 0.6
    agreement_coverage_min: float = 0.70
    agreement_precision_min: float = 0.40
    max_reruns: int = 2
    enabled_detectors: tuple[str, ...] = field(default=("florence", "gdino", "gdino-sahi"))


_DEFAULT_DAGSTER_HOME = Path("~/allmythings-data/dagster").expanduser()
_DEFAULT_PHOTO_DIR = Path("~/allmythings-data/photos").expanduser()


def load_config() -> PipelineRuntimeConfig:
    """Read environment and return an immutable runtime config snapshot.

    ``~/.allmythings.env`` is loaded if present (simple ``KEY=VALUE`` lines).
    Process env vars override file values.
    """
    env_file = Path("~/.allmythings.env").expanduser()
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

    return PipelineRuntimeConfig(
        bind_host=os.getenv("PIPELINE_BIND_HOST", "127.0.0.1"),
        port=_int(os.getenv("PIPELINE_PORT"), 14100),
        dagster_home=_path(os.getenv("DAGSTER_HOME"), _DEFAULT_DAGSTER_HOME),
        photo_dir=_path(os.getenv("PIPELINE_PHOTO_DIR"), _DEFAULT_PHOTO_DIR),
        max_queue_depth=_int(os.getenv("PIPELINE_MAX_QUEUE_DEPTH"), 4),
        run_retention=_int(os.getenv("PIPELINE_RUN_RETENTION"), 200),
        log_redaction_enabled=_bool(os.getenv("PIPELINE_LOG_REDACTION"), True),
    )
