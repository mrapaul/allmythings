"""FastAPI sidecar for the pipeline-service.

Endpoints (§4.2 of claude-plan.md):

  POST /runs                       — launch a Dagster run with idempotency
  GET  /runs/:run_id               — current state
  GET  /runs/:run_id/wait          — long-poll until terminal state
  GET  /runs/:run_id/timeline      — per-op timing
  GET  /health                     — readiness + model-warmup state

Concurrency: ``asyncio.Semaphore(max_queue_depth)``. Pending requests waiting
on the semaphore count toward ``queue_depth``; ``POST /runs`` returns 503
``queue_full`` once the soft limit is exceeded.

Execution: ``pipeline_job.execute_in_process()`` runs IN-PROCESS inside
the event loop (offloaded to a worker thread to keep the loop free for
other requests).  No Dagster daemon.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
import uuid
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Path, Query, Request, Response
from fastapi.responses import JSONResponse

from pipeline_service import log_redaction
from pipeline_service.api.schemas import (
    GetRunResponse,
    HealthResponse,
    LaunchRunRequest,
    LaunchRunResponse200,
    LaunchRunResponse202,
    QueueFullResponse503,
    TimelineOp,
    TimelineResponse,
)
from pipeline_service.config import load_config
from pipeline_service.models.dinov2 import DinoV2Loader
from pipeline_service.models.effsam import EffSAMLoader
from pipeline_service.models.florence_client import FlorenceClient
from pipeline_service.models.grounding_dino import GroundingDinoLoader
from pipeline_service.models.grounding_dino_http import HttpGroundingDinoBackend
from pipeline_service.models.label_encoder import LabelEncoder
from pipeline_service.models.ollama_client import OllamaClient
from pipeline_service.types import SceneObservation

logger = logging.getLogger("pipeline_service.api.server")

# ---------------------------------------------------------------------------
# Test-only knobs. Only the integration suite touches these via monkeypatch;
# production code never sets them.
# ---------------------------------------------------------------------------
_force_failure_for_testing = False
_artificial_run_delay_s: float = 0.0


async def _warmup_observer(self: Any, name: str) -> None:  # noqa: ANN001
    """Override-point for tests that want to observe which models warmed up.

    Production behaviour: invoked by ``_warm_models`` for each loader; the
    default implementation just records into the FastAPI app state.
    """
    state = self.state.warmups
    state.append(name)


# ---------------------------------------------------------------------------
# Run-state bookkeeping
# ---------------------------------------------------------------------------

@dataclass
class RunRecord:
    run_id: str
    idempotency_key: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str = "running"  # running | succeeded | failed | cancelled | timed_out
    result: Optional[SceneObservation] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    duration_ms: int = 0
    timeline: list[TimelineOp] = field(default_factory=list)
    completion: asyncio.Event = field(default_factory=asyncio.Event)


# ---------------------------------------------------------------------------
# Pipeline executor — runs Dagster's pipeline_job.execute_in_process() in a
# worker thread so the FastAPI event loop stays free.
# ---------------------------------------------------------------------------

def _execute_pipeline_run(
    run_id: str,
    idempotency_key: str,
    photo_paths: list[str],
    trace_id: str,
    request_id: str,
    artificial_delay: float,
    force_failure: bool,
) -> tuple[str, Optional[SceneObservation], Optional[str], Optional[str], list[TimelineOp]]:
    """Execute the Dagster pipeline. Returns (status, result, code, message, timeline)."""
    from pipeline_service.dagster_defs import pipeline_job

    timeline: list[TimelineOp] = []
    if artificial_delay > 0:
        time.sleep(artificial_delay)
    if force_failure:
        return ("failed", None, "forced", "forced failure for testing", timeline)

    # Build the run config: load each photo and pass bytes via hex.
    # Frames are capped at MAX_PHOTO_BYTES per file (matches §3.1's 10 MB limit).
    MAX_PHOTO_BYTES = 10 * 1024 * 1024
    frames_payload = []
    for idx, path in enumerate(photo_paths):
        size = os.path.getsize(path)
        if size > MAX_PHOTO_BYTES:
            return (
                "failed",
                None,
                "photo_too_large",
                f"frame {idx} exceeds {MAX_PHOTO_BYTES} bytes",
                timeline,
            )
        with open(path, "rb") as fh:
            path_bytes = fh.read()
        sha = hashlib.sha256(path_bytes).hexdigest()
        ext = os.path.splitext(path)[1].lstrip(".") or "jpg"
        frames_payload.append(
            {
                "frame_id": f"F{idx}",
                "sha256": sha,
                "mime_type": f"image/{ext if ext != 'jpg' else 'jpeg'}",
                "photo_bytes_hex": path_bytes.hex(),
            }
        )
    run_config = {
        "ops": {
            "frame_intake": {"config": {"frames": frames_payload}},
        }
    }
    tags = {
        "traceId": trace_id,
        "requestId": request_id,
        "photoSha256": idempotency_key,
        "sceneId": run_id,
        # Wall-clock pipeline start (epoch ms) so assemble_result can compute
        # processingMs deterministically without relying on Dagster's per-step
        # timing.
        "pipelineStartedMs": str(int(time.time() * 1000)),
    }
    try:
        result = pipeline_job.execute_in_process(
            run_config=run_config, run_id=run_id, tags=tags
        )
    except Exception as exc:  # broad on purpose
        logger.exception("pipeline_job execute failed: %s", exc)
        return ("failed", None, type(exc).__name__, str(exc), timeline)

    # Build timeline from step events
    try:
        for ev in result.get_step_success_events():
            timeline.append(
                TimelineOp(
                    name=ev.step_key or "?",
                    status="succeeded",
                    started_at=datetime.fromtimestamp(
                        ev.timestamp, tz=timezone.utc
                    ).isoformat()
                    if ev.timestamp
                    else None,
                    duration_ms=int(ev.event_specific_data.duration_ms or 0)
                    if ev.event_specific_data
                    and hasattr(ev.event_specific_data, "duration_ms")
                    else 0,
                    retry_count=0,
                    dynamic_outputs=0,
                )
            )
    except Exception:  # pragma: no cover — defensive
        pass

    if not result.success:
        return ("failed", None, "step_failed", "one or more ops failed", timeline)

    out = result.output_for_node("assemble_result")
    obs = SceneObservation.model_validate(out)
    return ("succeeded", obs, None, None, timeline)


# ---------------------------------------------------------------------------
# FastAPI app factory
# ---------------------------------------------------------------------------

def _bootstrap_logging() -> None:
    pkg_logger = logging.getLogger("pipeline_service")
    log_redaction.install_redactor(pkg_logger)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    cfg = load_config()
    app.state.config = cfg
    app.state.runs = OrderedDict()  # run_id -> RunRecord
    app.state.idem = {}  # idempotency_key -> run_id
    app.state.queue_depth = 0
    app.state.queue_lock = asyncio.Lock()
    app.state.run_durations = deque(maxlen=10)
    app.state.warmups = []
    app.state.semaphore = asyncio.Semaphore(cfg.max_queue_depth)
    app.state.ready = False
    app.state.model_warmup_complete = False
    app.state.florence = FlorenceClient()
    app.state.ollama = OllamaClient()
    # GroundingDinoLoader.backend defaults to a deterministic fake; in
    # production we wire the HTTP-backed backend that calls
    # detection-service. EVAL_MOCK_BACKENDS=1 keeps the deterministic
    # path. GDINO_HTTP_URL overrides the default.
    if os.environ.get("EVAL_MOCK_BACKENDS") == "1":
        app.state.gdino_loader = GroundingDinoLoader()
    else:
        gdino_url = os.environ.get("GDINO_HTTP_URL", "http://127.0.0.1:14001")
        app.state.gdino_loader = GroundingDinoLoader(
            backend=HttpGroundingDinoBackend(base_url=gdino_url),
        )
    app.state.effsam_loader = EffSAMLoader()
    app.state.dinov2_loader = DinoV2Loader()
    app.state.label_encoder = LabelEncoder()

    cfg.dagster_home.mkdir(parents=True, exist_ok=True)
    cfg.photo_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("DAGSTER_HOME", str(cfg.dagster_home))

    # Warmup phase — section-01 loaders are no-ops.
    for loader in [
        app.state.florence,
        app.state.ollama,
        app.state.gdino_loader,
        app.state.effsam_loader,
        app.state.dinov2_loader,
        app.state.label_encoder,
    ]:
        await loader.warmup()
        await _warmup_observer(app, getattr(loader, "name", type(loader).__name__))

    app.state.model_warmup_complete = True
    app.state.ready = True
    logger.info("pipeline-service ready", extra={"warmups": len(app.state.warmups)})

    try:
        yield
    finally:
        app.state.ready = False
        # Drain in-flight tasks gracefully.
        in_flight = [
            r
            for r in app.state.runs.values()
            if r.status == "running" and not r.completion.is_set()
        ]
        for r in in_flight:
            r.status = "cancelled"
            r.completion.set()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _retry_after_s(app: FastAPI) -> int:
    durations = list(app.state.run_durations) or [5.0]
    avg = sum(durations) / len(durations)
    return max(1, int(avg))


def create_app() -> FastAPI:
    """Build a fresh FastAPI app. Each call wires its own lifespan."""
    _bootstrap_logging()
    app = FastAPI(title="pipeline-service", lifespan=_lifespan)

    @app.exception_handler(Exception)
    async def _on_exception(request: Request, exc: Exception) -> JSONResponse:  # noqa: ANN001
        logger.exception("unhandled exception in %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content={"error": type(exc).__name__, "message": str(exc)},
        )

    @app.post("/runs")
    async def post_runs(req: LaunchRunRequest, request: Request) -> Response:
        runs: OrderedDict[str, RunRecord] = request.app.state.runs
        idem: dict[str, str] = request.app.state.idem
        cfg = request.app.state.config
        # --- idempotency lookup ---
        existing_run_id = idem.get(req.idempotency_key)
        if existing_run_id is not None:
            existing = runs.get(existing_run_id)
            if existing is not None and existing.status in {"running", "succeeded"}:
                body: dict[str, Any] = {
                    "run_id": existing.run_id,
                    "started_at": existing.started_at.isoformat(),
                    "idempotent_hit": True,
                    "status": existing.status,
                }
                if existing.status == "succeeded" and existing.result is not None:
                    body["result"] = existing.result.model_dump(
                        mode="json", by_alias=True
                    )
                return JSONResponse(status_code=200, content=body)
            # Failed/cancelled/timed_out → allow a fresh run (ALLOW_DUPLICATE_FAILED_ONLY)

        # --- backpressure ---
        if request.app.state.queue_depth >= cfg.max_queue_depth:
            payload = QueueFullResponse503(
                queue_depth=request.app.state.queue_depth,
                retry_after_s=_retry_after_s(request.app),
            ).model_dump()
            return JSONResponse(status_code=503, content=payload)

        # --- launch ---
        run_id = str(uuid.uuid4())
        record = RunRecord(
            run_id=run_id,
            idempotency_key=req.idempotency_key,
            started_at=datetime.now(timezone.utc),
        )
        runs[run_id] = record
        idem[req.idempotency_key] = run_id
        request.app.state.queue_depth += 1

        async def _run_task() -> None:
            try:
                async with request.app.state.semaphore:
                    started = time.monotonic()
                    loop = asyncio.get_running_loop()
                    status, result, code, message, timeline = await loop.run_in_executor(
                        None,
                        _execute_pipeline_run,
                        run_id,
                        req.idempotency_key,
                        req.photo_paths,
                        req.trace_id,
                        req.request_id,
                        _artificial_run_delay_s,
                        _force_failure_for_testing,
                    )
                    record.status = status
                    record.result = result
                    record.error_code = code
                    record.error_message = message
                    record.timeline = timeline
                    record.duration_ms = int((time.monotonic() - started) * 1000)
                    record.finished_at = datetime.now(timezone.utc)
                    request.app.state.run_durations.append(time.monotonic() - started)
            except Exception as exc:  # noqa: BLE001 — defensive
                logger.exception("run task crashed: %s", exc)
                record.status = "failed"
                record.error_code = type(exc).__name__
                record.error_message = str(exc)
                record.finished_at = datetime.now(timezone.utc)
            finally:
                request.app.state.queue_depth -= 1
                record.completion.set()

        asyncio.create_task(_run_task())

        payload = LaunchRunResponse202(
            run_id=run_id, started_at=record.started_at.isoformat()
        ).model_dump()
        return JSONResponse(status_code=202, content=payload)

    @app.get("/runs/{run_id}")
    async def get_run(
        request: Request,
        run_id: str = Path(...),
    ) -> Response:
        runs: OrderedDict[str, RunRecord] = request.app.state.runs
        rec = runs.get(run_id)
        if rec is None:
            raise HTTPException(status_code=404, detail="unknown run_id")
        body = GetRunResponse(
            run_id=rec.run_id,
            status=rec.status,  # type: ignore[arg-type]
            started_at=rec.started_at.isoformat(),
            finished_at=rec.finished_at.isoformat() if rec.finished_at else None,
            result=rec.result,
            error_code=rec.error_code,
            error_message=rec.error_message,
        )
        return JSONResponse(status_code=200, content=body.model_dump(mode="json"))

    @app.get("/runs/{run_id}/wait")
    async def wait_run(
        request: Request,
        run_id: str = Path(...),
        timeout_s: float = Query(default=25.0, ge=1.0, le=60.0),
    ) -> Response:
        runs: OrderedDict[str, RunRecord] = request.app.state.runs
        rec = runs.get(run_id)
        if rec is None:
            raise HTTPException(status_code=404, detail="unknown run_id")
        try:
            await asyncio.wait_for(rec.completion.wait(), timeout=timeout_s)
        except asyncio.TimeoutError:
            pass  # return current state with status 200, NOT 5xx (§4.2)
        body = GetRunResponse(
            run_id=rec.run_id,
            status=rec.status,  # type: ignore[arg-type]
            started_at=rec.started_at.isoformat(),
            finished_at=rec.finished_at.isoformat() if rec.finished_at else None,
            result=rec.result,
            error_code=rec.error_code,
            error_message=rec.error_message,
        )
        return JSONResponse(status_code=200, content=body.model_dump(mode="json"))

    @app.get("/runs/{run_id}/timeline")
    async def run_timeline(
        request: Request,
        run_id: str = Path(...),
    ) -> Response:
        runs: OrderedDict[str, RunRecord] = request.app.state.runs
        rec = runs.get(run_id)
        if rec is None:
            raise HTTPException(status_code=404, detail="unknown run_id")
        # If the run hasn't reached terminal state, populate the timeline with
        # what we've observed so far + any expected ops still pending.
        body = TimelineResponse(run_id=run_id, ops=list(rec.timeline))
        # Ensure all expected ops appear even on a quick-look timeline.
        seen = {op.name for op in body.ops}
        for expected in _EXPECTED_OP_NAMES:
            if expected not in seen:
                body.ops.append(
                    TimelineOp(
                        name=expected,
                        status="skipped" if rec.status != "running" else "running",
                        duration_ms=0,
                        retry_count=0,
                        dynamic_outputs=0,
                    )
                )
        return JSONResponse(status_code=200, content=body.model_dump(mode="json"))

    @app.get("/health")
    async def health(request: Request) -> Response:
        cfg = request.app.state.config
        body = HealthResponse(
            ready=request.app.state.ready,
            model_warmup_complete=request.app.state.model_warmup_complete,
            dagster_home=str(cfg.dagster_home),
            queue_depth=request.app.state.queue_depth,
            max_queue_depth=cfg.max_queue_depth,
            florence_reachable=False,
            ollama_reachable=False,
            grounding_dino_loaded=request.app.state.gdino_loader.loaded,
        )
        return JSONResponse(status_code=200, content=body.model_dump())

    return app


_EXPECTED_OP_NAMES = (
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
)


# Module-level app for uvicorn entrypoint (``uvicorn pipeline_service.api.server:app``).
app = create_app()
