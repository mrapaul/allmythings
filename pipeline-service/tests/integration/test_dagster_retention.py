"""§8.2 Dagster run-history retention.

Section-01 ships ``storage/retention.py::prune_runs`` and registers a
nightly schedule that fires it. We test:
  - prune_runs keeps the most-recent N (default 200) and deletes older;
  - the schedule is registered in ``Definitions``;
  - the schedule's cron is ``0 3 * * *`` (03:00 local).
"""
from __future__ import annotations


def test_prune_runs_keeps_most_recent_n(tmp_dagster_home) -> None:
    from dagster import DagsterInstance
    from pipeline_service.storage.retention import prune_runs

    instance = DagsterInstance.from_config(str(tmp_dagster_home))

    # Seed 250 runs; retain 200.
    seeded: list[str] = []
    for i in range(250):
        from dagster import DagsterRun, DagsterRunStatus

        run = DagsterRun(
            job_name="pipeline_job",
            run_id=f"run-{i:05d}",
            status=DagsterRunStatus.SUCCESS,
        )
        instance.add_run(run)
        seeded.append(run.run_id)

    deleted = prune_runs(instance=instance, retain=200)
    assert deleted == 50

    remaining = {r.run_id for r in instance.get_runs()}
    # The 50 oldest (lowest indices) should be gone.
    assert len(remaining) == 200
    for old in seeded[:50]:
        assert old not in remaining
    for kept in seeded[50:]:
        assert kept in remaining


def test_schedule_registered_in_definitions() -> None:
    from pipeline_service.dagster_defs import defs

    schedule_names = {s.name for s in defs.schedules}
    assert "prune_runs_schedule" in schedule_names


def test_schedule_cron_is_3am_local() -> None:
    from pipeline_service.dagster_defs import defs

    sched = next(s for s in defs.schedules if s.name == "prune_runs_schedule")
    assert sched.cron_schedule == "0 3 * * *"
