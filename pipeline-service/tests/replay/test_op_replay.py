"""Op-level replay test runner.

Loads JSON fixtures from ``tests/replay/fixtures/<op>/<case>.json`` and
invokes the op's ``*_impl`` function against the recorded input, asserting
byte-equal JSON output.

Section-01 ships at least one fixture each for ``frame_intake`` and
``assemble_result`` (the only real ops in this section).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import pytest

FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"


@dataclass
class ReplayFixture:
    op: str
    case: str
    path: Path
    input_json: Any
    expected_json: Any


def find_fixtures(op: str | None = None) -> list[ReplayFixture]:
    out: list[ReplayFixture] = []
    if not FIXTURE_ROOT.exists():
        return out
    for op_dir in FIXTURE_ROOT.iterdir():
        if not op_dir.is_dir():
            continue
        if op is not None and op_dir.name != op:
            continue
        for fp in sorted(op_dir.glob("*.json")):
            data = json.loads(fp.read_text())
            out.append(
                ReplayFixture(
                    op=data["op"],
                    case=data["case"],
                    path=fp,
                    input_json=data["input"],
                    expected_json=data["expected"],
                )
            )
    return out


def _resolve_impl(op: str) -> Callable[..., Any]:
    import importlib

    mod = importlib.import_module(f"pipeline_service.ops.{op}")
    return getattr(mod, f"{op}_impl")


def run_replay(fixture: ReplayFixture) -> Any:
    """Invoke the op against the fixture's recorded input.

    The op's input is provided as keyword args; the output is returned as
    JSON-serialisable plain Python.
    """
    impl = _resolve_impl(fixture.op)
    if fixture.op == "assemble_result":
        # assemble_result_impl takes (observation, started_ms, finished_ms).
        # The fixture stores an observation dict + the two timestamps.
        from pipeline_service.types import SceneObservation

        obs = SceneObservation.model_validate(fixture.input_json["observation"])
        return impl(
            obs,
            started_ms=fixture.input_json.get("started_ms", 0),
            finished_ms=fixture.input_json.get("finished_ms", 0),
        )
    if fixture.op == "frame_intake":
        # Bytes are stored as hex in the fixture JSON.
        frames = []
        for f in fixture.input_json["frames"]:
            frames.append(
                {
                    "frame_id": f["frame_id"],
                    "sha256": f["sha256"],
                    "mime_type": f["mime_type"],
                    "photo_bytes": bytes.fromhex(f["photo_bytes_hex"]),
                }
            )
        result = impl(frames)
        # Return a JSON-comparable shape: ids and decoding_failed flags only,
        # since RGB tensors are too large to round-trip in JSON.
        return [
            {
                "frame_id": fr.frame_id,
                "decoding_failed": fr.decoding_failed,
                "exif_orientation": fr.exif_orientation,
            }
            for fr in result
        ]
    raise NotImplementedError(f"replay shape for op {fixture.op} not defined")


# ----- Tests -------------------------------------------------------------------

def test_at_least_one_fixture_per_real_op() -> None:
    assert find_fixtures("frame_intake"), "section-01 must ship a frame_intake fixture"
    assert find_fixtures("assemble_result"), (
        "section-01 must ship an assemble_result fixture"
    )


@pytest.mark.parametrize(
    "fixture",
    find_fixtures(),
    ids=lambda fx: f"{fx.op}-{fx.case}" if isinstance(fx, ReplayFixture) else "?",
)
def test_replay_byte_equal(fixture: ReplayFixture) -> None:
    if os.environ.get("REPLAY_REFRESH") == "1":
        actual = run_replay(fixture)
        new = json.loads(fixture.path.read_text())
        new["expected"] = actual
        fixture.path.write_text(json.dumps(new, indent=2, sort_keys=True))
        return
    actual = run_replay(fixture)
    assert actual == fixture.expected_json, (
        f"replay diverged for {fixture.path}:\n"
        f"actual:   {actual!r}\n"
        f"expected: {fixture.expected_json!r}"
    )
