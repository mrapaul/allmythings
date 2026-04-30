"""Run-history retention.

Nightly schedule that prunes ``DAGSTER_HOME`` run records older than the
most-recent N (default 200, configurable via ``PIPELINE_RUN_RETENTION``).
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from dagster import RunsFilter, ScheduleEvaluationContext, op, schedule

if TYPE_CHECKING:  # pragma: no cover
    from dagster import DagsterInstance

logger = logging.getLogger("pipeline_service.storage.retention")


def prune_runs(instance: "DagsterInstance", retain: int = 200) -> int:
    """Delete every run beyond the most-recent ``retain`` (by update_timestamp).

    Returns the number of runs deleted.
    """
    runs = list(instance.get_runs(filters=RunsFilter()))
    # Sort descending by update_timestamp so the head of the list is the most
    # recent. Newly-added runs in tests share a timestamp tick; fall back to
    # run_id for stable ordering.
    runs.sort(
        key=lambda r: (
            getattr(r, "update_timestamp", None)
            or getattr(r, "create_timestamp", None)
            or 0,
            r.run_id,
        ),
        reverse=True,
    )
    to_delete = runs[retain:]
    for r in to_delete:
        instance.delete_run(r.run_id)
    return len(to_delete)


@op
def _prune_runs_op() -> int:
    """Dagster op wrapper around :func:`prune_runs` so the schedule can fire it."""
    from dagster import DagsterInstance

    return prune_runs(instance=DagsterInstance.get(), retain=_retain())


def _retain() -> int:
    import os

    raw = os.getenv("PIPELINE_RUN_RETENTION", "200")
    try:
        return int(raw)
    except ValueError:
        return 200


# Attach to a job so the schedule has something to launch.
from dagster import job  # noqa: E402 — imported here to avoid cyclic import noise


@job(name="prune_runs_job")
def prune_runs_job() -> None:
    _prune_runs_op()


@schedule(
    cron_schedule="0 3 * * *",
    job=prune_runs_job,
    name="prune_runs_schedule",
)
def prune_runs_schedule(context: ScheduleEvaluationContext) -> dict:
    context.log.info("prune_runs_schedule fired")
    return {}
