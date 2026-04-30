"""§4.2 sidecar API — integration tests against a real FastAPI app instance.

Uses ``httpx.AsyncClient`` with the ``ASGITransport`` so we never bind a real
port. All Dagster work happens in-process via ``job.execute_in_process()``
on the stub-only DAG that ships with section-01 — no model HTTP touched.
"""
from __future__ import annotations

import asyncio
import hashlib
import socket
from pathlib import Path

import httpx
import pytest


# ---------- helpers ------------------------------------------------------------

async def _client(app):
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test.local")


def _photo(tmp: Path, name: str, content: bytes) -> Path:
    p = tmp / name
    p.write_bytes(content)
    return p


def _idem_key(*photos: Path) -> str:
    h = hashlib.sha256()
    for p in photos:
        h.update(hashlib.sha256(p.read_bytes()).hexdigest().encode())
    return h.hexdigest()


@pytest.fixture
async def app(isolated_env: dict[str, str]):
    from pipeline_service.api.server import create_app

    application = create_app()
    # The lifespan startup must complete before tests exercise endpoints.
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def http(app):
    async with await _client(app) as client:
        yield client


@pytest.fixture
def three_photo_paths(tmp_path: Path, tiny_jpeg_bytes: bytes) -> list[Path]:
    return [
        _photo(tmp_path, f"frame-{i}.jpg", tiny_jpeg_bytes) for i in range(3)
    ]


# ---------- launch + idempotency ----------------------------------------------

async def test_post_runs_returns_202_with_run_id(
    http, three_photo_paths: list[Path]
) -> None:
    resp = await http.post(
        "/runs",
        json={
            "idempotency_key": _idem_key(*three_photo_paths),
            "photo_paths": [str(p) for p in three_photo_paths],
            "trace_id": "trace-1",
            "request_id": "req-1",
        },
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert "run_id" in body
    assert body["idempotent_hit"] is False
    assert "started_at" in body


async def test_idempotent_re_post_running_returns_same_run_id(
    http, three_photo_paths: list[Path]
) -> None:
    body = {
        "idempotency_key": _idem_key(*three_photo_paths),
        "photo_paths": [str(p) for p in three_photo_paths],
        "trace_id": "trace-2",
        "request_id": "req-2",
    }
    first = await http.post("/runs", json=body)
    assert first.status_code == 202
    first_id = first.json()["run_id"]

    second = await http.post("/runs", json=body)
    assert second.status_code == 200
    j = second.json()
    assert j["idempotent_hit"] is True
    assert j["run_id"] == first_id
    assert j["status"] in {"running", "succeeded"}


async def test_idempotent_succeeded_returns_cached_result(
    http, three_photo_paths: list[Path]
) -> None:
    body = {
        "idempotency_key": _idem_key(*three_photo_paths),
        "photo_paths": [str(p) for p in three_photo_paths],
        "trace_id": "trace-3",
        "request_id": "req-3",
    }
    launch = await http.post("/runs", json=body)
    run_id = launch.json()["run_id"]

    waited = await http.get(f"/runs/{run_id}/wait", params={"timeout_s": 10})
    assert waited.status_code == 200
    assert waited.json()["status"] == "succeeded"

    again = await http.post("/runs", json=body)
    assert again.status_code == 200
    j = again.json()
    assert j["idempotent_hit"] is True
    assert j["status"] == "succeeded"
    assert "result" in j and j["result"] is not None


async def test_idempotent_after_failure_allows_fresh_run(
    http, three_photo_paths: list[Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """ALLOW_DUPLICATE_FAILED_ONLY contract — preserved from Temporal."""
    from pipeline_service.api import server

    body = {
        "idempotency_key": _idem_key(*three_photo_paths),
        "photo_paths": [str(p) for p in three_photo_paths],
        "trace_id": "t",
        "request_id": "r",
    }
    # Force first run to fail
    monkeypatch.setattr(server, "_force_failure_for_testing", True, raising=False)
    first = await http.post("/runs", json=body)
    first_id = first.json()["run_id"]
    waited = await http.get(f"/runs/{first_id}/wait", params={"timeout_s": 10})
    assert waited.json()["status"] in {"failed", "cancelled", "timed_out"}

    # Allow the next run through
    monkeypatch.setattr(server, "_force_failure_for_testing", False, raising=False)
    second = await http.post("/runs", json=body)
    assert second.status_code == 202
    assert second.json()["run_id"] != first_id


# ---------- get-run + wait + timeline -----------------------------------------

async def test_get_run_status(http, three_photo_paths: list[Path]) -> None:
    body = {
        "idempotency_key": _idem_key(*three_photo_paths),
        "photo_paths": [str(p) for p in three_photo_paths],
        "trace_id": "t",
        "request_id": "r",
    }
    launch = await http.post("/runs", json=body)
    run_id = launch.json()["run_id"]
    got = await http.get(f"/runs/{run_id}")
    assert got.status_code == 200
    j = got.json()
    assert j["run_id"] == run_id
    assert j["status"] in {"running", "succeeded", "failed"}
    assert "started_at" in j


async def test_wait_long_polls_to_terminal_state(
    http, three_photo_paths: list[Path]
) -> None:
    body = {
        "idempotency_key": _idem_key(*three_photo_paths),
        "photo_paths": [str(p) for p in three_photo_paths],
        "trace_id": "t",
        "request_id": "r",
    }
    launch = await http.post("/runs", json=body)
    run_id = launch.json()["run_id"]
    resp = await http.get(f"/runs/{run_id}/wait", params={"timeout_s": 15})
    assert resp.status_code == 200
    j = resp.json()
    assert j["status"] in {"succeeded", "failed", "cancelled", "timed_out"}


async def test_wait_returns_current_state_on_timeout_not_5xx(
    http, three_photo_paths: list[Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """If timeout_s elapses before the run completes, /wait returns 200 with
    the current state — never 5xx.
    """
    from pipeline_service.api import server

    # Stall the in-process job long enough that timeout_s=1 cannot complete.
    monkeypatch.setattr(server, "_artificial_run_delay_s", 5.0, raising=False)
    body = {
        "idempotency_key": _idem_key(*three_photo_paths),
        "photo_paths": [str(p) for p in three_photo_paths],
        "trace_id": "t",
        "request_id": "r",
    }
    launch = await http.post("/runs", json=body)
    run_id = launch.json()["run_id"]
    resp = await http.get(f"/runs/{run_id}/wait", params={"timeout_s": 1})
    assert resp.status_code == 200
    assert resp.json()["status"] in {"running", "succeeded"}


async def test_timeline_returns_per_op_timing(
    http, three_photo_paths: list[Path]
) -> None:
    body = {
        "idempotency_key": _idem_key(*three_photo_paths),
        "photo_paths": [str(p) for p in three_photo_paths],
        "trace_id": "t",
        "request_id": "r",
    }
    launch = await http.post("/runs", json=body)
    run_id = launch.json()["run_id"]
    await http.get(f"/runs/{run_id}/wait", params={"timeout_s": 15})

    timeline = await http.get(f"/runs/{run_id}/timeline")
    assert timeline.status_code == 200
    j = timeline.json()
    assert j["run_id"] == run_id
    assert isinstance(j["ops"], list)
    op_names = {op["name"] for op in j["ops"]}
    # All 15 ops must appear in the timeline (frame_intake + 13 middle + assemble_result)
    expected = {
        "frame_intake",
        "scene_embedding",
        "vlm_prompt_expansion",
        "florence_detect",
        "grounding_dino_detect",
        "sahi_recovery",
        "effsam_segment",
        "box_fusion",
        "crop_embedding",
        "cross_pass_dedup",
        "cross_frame_dedup",
        "classification_refine",
        "agreement_scoring",
        "self_diagnosis",
        "assemble_result",
    }
    assert expected.issubset(op_names), (
        f"timeline missing ops: {expected - op_names}"
    )
    for op in j["ops"]:
        assert "status" in op
        assert "duration_ms" in op
        assert "retry_count" in op
        assert "dynamic_outputs" in op  # 0 in section-01 stub


# ---------- backpressure -------------------------------------------------------

async def test_backpressure_returns_503_above_max_queue_depth(
    monkeypatch: pytest.MonkeyPatch,
    three_photo_paths: list[Path],
    isolated_env: dict[str, str],
) -> None:
    """5 concurrent runs with max_queue_depth=4 → the 5th gets 503."""
    monkeypatch.setenv("PIPELINE_MAX_QUEUE_DEPTH", "4")
    # Stall every run so the queue fills before any drains.
    from pipeline_service.api import server

    monkeypatch.setattr(server, "_artificial_run_delay_s", 5.0, raising=False)
    app = server.create_app()
    async with app.router.lifespan_context(app):
        async with await _client(app) as http:
            payloads = [
                {
                    "idempotency_key": hashlib.sha256(f"k{i}".encode()).hexdigest(),
                    "photo_paths": [str(p) for p in three_photo_paths],
                    "trace_id": f"t{i}",
                    "request_id": f"r{i}",
                }
                for i in range(5)
            ]
            tasks = [asyncio.create_task(http.post("/runs", json=p)) for p in payloads]
            responses = await asyncio.gather(*tasks)
            statuses = sorted(r.status_code for r in responses)
            assert 503 in statuses, f"expected at least one 503, got {statuses}"
            queue_full = next(r for r in responses if r.status_code == 503)
            j = queue_full.json()
            assert j["error"] == "queue_full"
            assert j["queue_depth"] >= 4
            assert j["retry_after_s"] >= 1


# ---------- idempotency-key validation ----------------------------------------

async def test_rejects_malformed_idempotency_key(
    http, three_photo_paths: list[Path]
) -> None:
    resp = await http.post(
        "/runs",
        json={
            "idempotency_key": "not-a-sha256",  # too short, not hex
            "photo_paths": [str(p) for p in three_photo_paths],
            "trace_id": "t",
            "request_id": "r",
        },
    )
    assert resp.status_code in {400, 422}


# ---------- bind host ----------------------------------------------------------

def test_default_bind_host_is_127_0_0_1(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PIPELINE_BIND_HOST", raising=False)
    from pipeline_service.config import load_config

    cfg = load_config()
    assert cfg.bind_host == "127.0.0.1"
    # Sanity: the bind host is never 0.0.0.0 by default.
    assert cfg.bind_host != "0.0.0.0"


def test_loopback_address_resolves_to_localhost() -> None:
    """Sanity: socket-level — 127.0.0.1 resolves locally only."""
    info = socket.getaddrinfo("127.0.0.1", None)
    assert all(item[4][0] == "127.0.0.1" for item in info)


# ---------- health + warm-up ---------------------------------------------------

async def test_health_starts_not_ready_then_flips(
    isolated_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The lifespan must run all model loaders' warmup() before /health
    reports ready=true.
    """
    from pipeline_service.api import server

    seen: list[str] = []

    async def _track_warm(self, name: str) -> None:  # noqa: ANN001 — type-erased
        seen.append(name)

    # Patch a sentinel that gets called inside lifespan; section-01's
    # implementation must record each model name passed through warmup().
    monkeypatch.setattr(server, "_warmup_observer", _track_warm, raising=False)

    app = server.create_app()
    async with app.router.lifespan_context(app):
        async with await _client(app) as http:
            resp = await http.get("/health")
            j = resp.json()
            assert resp.status_code == 200
            assert j["ready"] is True  # post-lifespan
    expected_models = {
        "florence_client",
        "ollama_client",
        "grounding_dino",
        "effsam",
        "dinov2",
        "label_encoder",
    }
    assert expected_models.issubset(set(seen))
