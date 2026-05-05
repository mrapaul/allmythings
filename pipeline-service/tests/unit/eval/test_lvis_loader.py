"""Behavioural tests for ``LvisDataset``.

All tests run against the synthetic LVIS-shaped archive at
``tests/replay/fixtures/eval/synthetic_lvis_archive.zip``. The archive
contains 50 fake JPEGs and a tiny LVIS-shaped JSON spanning all seven
allowed supercategories with ``frequency='r'``. No real LVIS data is
ever downloaded by these tests.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path

import numpy as np
import pytest

from pipeline_service.eval.gt_eval.datasets import lvis as lvis_mod
from pipeline_service.eval.gt_eval.datasets.lvis import (
    LvisArchiveSha256Mismatch,
    LvisConfig,
    LvisDataset,
)


def _fixture_zip(eval_fixtures_dir: Path) -> Path:
    return eval_fixtures_dir / "synthetic_lvis_archive.zip"


def _archive_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _setup_local_zip(
    monkeypatch: pytest.MonkeyPatch,
    cache_root: Path,
    eval_fixtures_dir: Path,
) -> Path:
    """Configure ``LVIS_LOCAL_ZIP`` and seed the cache with the fixture archive."""
    cache_root.mkdir(parents=True, exist_ok=True)
    target = cache_root / "lvis_v1_train.json.zip"
    if not target.exists():
        shutil.copyfile(_fixture_zip(eval_fixtures_dir), target)
    monkeypatch.setenv("LVIS_LOCAL_ZIP", str(target))
    return target


def test_lvis_local_zip_short_circuits_http(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """With ``LVIS_LOCAL_ZIP`` set, ``requests.get`` is never called."""
    cache_root = tmp_path / "cache"
    archive = _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)
    monkeypatch.setenv("LVIS_LOCAL_ZIP", str(archive))

    calls: list[tuple] = []

    def _no_http(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("requests.get should not be called when LVIS_LOCAL_ZIP set")

    monkeypatch.setattr(lvis_mod.requests, "get", _no_http)

    ds = LvisDataset(
        LvisConfig(cache_root=cache_root, sample_size=3, seed=0)
    )
    pairs = list(ds)
    assert calls == []
    assert len(pairs) == 3


def test_deterministic_sampling_same_seed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """Same seed yields the same image-id list (and same order)."""
    cache_root = tmp_path / "cache"
    _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)

    ds_a = LvisDataset(LvisConfig(cache_root=cache_root, sample_size=10, seed=0))
    ds_b = LvisDataset(LvisConfig(cache_root=cache_root, sample_size=10, seed=0))

    assert ds_a._sampled_image_ids == ds_b._sampled_image_ids
    assert len(ds_a._sampled_image_ids) == 10


def test_deterministic_sampling_different_seed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """``seed=0`` and ``seed=1`` yield different sample sets."""
    cache_root = tmp_path / "cache"
    _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)

    ds_a = LvisDataset(LvisConfig(cache_root=cache_root, sample_size=10, seed=0))
    ds_b = LvisDataset(LvisConfig(cache_root=cache_root, sample_size=10, seed=1))

    assert ds_a._sampled_image_ids != ds_b._sampled_image_ids


def test_sampler_uses_default_rng_with_configured_seed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """``numpy.random.default_rng(seed).choice`` is the actual sampler."""
    cache_root = tmp_path / "cache"
    _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)

    seen_seeds: list[int] = []
    real_default_rng = np.random.default_rng

    def _spy(seed=None):
        seen_seeds.append(seed)
        return real_default_rng(seed)

    monkeypatch.setattr(lvis_mod.np.random, "default_rng", _spy)
    LvisDataset(LvisConfig(cache_root=cache_root, sample_size=5, seed=7))
    assert 7 in seen_seeds


def test_supercategory_filter_excludes_disallowed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """Categories outside the allow-list don't reach the sample.

    Override the supercats file with a single allow-listed value
    ('lighting') and check that all yielded GT boxes have categories
    whose supercategory is 'lighting'.
    """
    cache_root = tmp_path / "cache"
    _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)

    custom_supercats = tmp_path / "custom_supercats.json"
    custom_supercats.write_text(json.dumps({"allowed": ["lighting"]}))

    with zipfile.ZipFile(_fixture_zip(eval_fixtures_dir)) as zf:
        member = next(n for n in zf.namelist() if n.endswith(".json"))
        with zf.open(member) as f:
            payload = json.load(f)
    lighting_names = {
        c["name"] for c in payload["categories"] if c["supercategory"] == "lighting"
    }
    assert lighting_names, "fixture must include >=1 lighting category"

    ds = LvisDataset(
        LvisConfig(
            cache_root=cache_root,
            sample_size=50,
            seed=0,
            supercats_file=custom_supercats,
        )
    )
    pairs = list(ds)
    for _path, boxes in pairs:
        for box in boxes:
            assert box.category_name in lighting_names

    assert set(ds.category_names).issubset(lighting_names)


def test_cache_hit_on_second_iter(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """On a second instantiation with the same cache_root, no HTTP."""
    cache_root = tmp_path / "cache"
    _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)

    LvisDataset(LvisConfig(cache_root=cache_root, sample_size=3, seed=0))

    def _no_http(*args, **kwargs):
        raise AssertionError("requests.get should not be called on cache hit")

    monkeypatch.setattr(lvis_mod.requests, "get", _no_http)

    ds = LvisDataset(LvisConfig(cache_root=cache_root, sample_size=3, seed=0))
    list(ds)


def test_annotation_cache_skips_json_parse_on_second_iter(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """Second instantiation skips ``json.load`` of the LVIS archive.

    The loader serializes the parsed annotations to a binary cache file
    ``lvis_annotations.pkl`` — verifying the cache exists and that the
    second-instantiation ``json.load`` count grows by at most 1 (the
    supercats JSON read) is sufficient.
    """
    cache_root = tmp_path / "cache"
    _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)

    json_load_calls = {"n": 0}
    real_json_load = json.load

    def _counting_load(*args, **kwargs):
        json_load_calls["n"] += 1
        return real_json_load(*args, **kwargs)

    monkeypatch.setattr(lvis_mod.json, "load", _counting_load)

    LvisDataset(LvisConfig(cache_root=cache_root, sample_size=3, seed=0))
    first = json_load_calls["n"]
    assert first >= 1

    LvisDataset(LvisConfig(cache_root=cache_root, sample_size=3, seed=0))
    annotation_cache = cache_root / "lvis_annotations.pkl"
    assert annotation_cache.exists()
    delta = json_load_calls["n"] - first
    assert delta <= 1, (
        f"expected annotation cache to skip annotations json.load, "
        f"saw delta={delta} extra json.load calls"
    )


def test_sha256_verification_raises_on_mismatch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """When ``expected_archive_sha256`` mismatches, raise before parsing."""
    cache_root = tmp_path / "cache"
    _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)

    with pytest.raises(LvisArchiveSha256Mismatch) as exc_info:
        LvisDataset(
            LvisConfig(
                cache_root=cache_root,
                sample_size=3,
                seed=0,
                expected_archive_sha256="0" * 64,
            )
        )
    assert "EVAL_LVIS_VERSION_BUMP" in str(exc_info.value)


def test_license_file_written_on_first_download(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """``LICENSE-LVIS.md`` exists in cache_root after first instantiation."""
    cache_root = tmp_path / "cache"
    _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)

    LvisDataset(LvisConfig(cache_root=cache_root, sample_size=3, seed=0))
    license_file = cache_root / "LICENSE-LVIS.md"
    assert license_file.exists()
    text = license_file.read_text(encoding="utf-8")
    assert "LVIS" in text
    assert "COCO" in text
    assert "CC-BY 4.0" in text


def test_version_sha256_property_matches_archive(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    eval_fixtures_dir: Path,
) -> None:
    """``version_sha256`` returns the actual sha256 of the archive."""
    cache_root = tmp_path / "cache"
    archive = _setup_local_zip(monkeypatch, cache_root, eval_fixtures_dir)
    expected_sha = _archive_sha256(archive)

    ds = LvisDataset(
        LvisConfig(
            cache_root=cache_root,
            sample_size=3,
            seed=0,
            expected_archive_sha256=expected_sha,
        )
    )
    assert ds.version_sha256 == expected_sha
