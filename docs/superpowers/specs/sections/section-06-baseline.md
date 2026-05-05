Now I have everything I need. Let me output the section content.

# section-06-baseline — Baseline read / write / diff

## Purpose

Implements the baseline persistence and gating logic for the GT-eval
harness. Reads `pipeline-service/eval/baseline.json`, diffs the
current run against it, enforces absolute floors from
`pipeline-service/eval/thresholds.json`, and (only under explicit
opt-in) commits a fresh baseline. Holds the public dataclasses
(`MetricDelta`, `MetricFloor`, `BaselineDiff`) and the two top-level
entry points (`diff_and_check`, `maybe_commit_baseline`).

This is the only consumer of the metrics schema produced by
section-05; it is the only producer of the diff/commit decisions
consumed by section-08's `run_eval.py` integration.

## Dependencies

- **section-01-foundation** — package skeleton under
  `pipeline-service/pipeline_service/eval/gt_eval/`, gitignore for
  `pipeline-service/eval/datasets/`, conftest fixtures under
  `pipeline-service/tests/unit/eval/conftest.py`.
- **section-05-metrics** — produces the `GtMetricsBlock` /
  `HeadlineMetrics` shape that this module reads, diffs, and writes.
  Reference only; this section does NOT re-define those types.

This section does **not** depend on sections 02, 03, 04, 07. The
`LvisDataset.version_sha256` and `label_encoder._DEFAULT_MODEL_NAME`
values are passed in by the caller (the orchestrator in section-08);
this module only stores and compares them as opaque strings.

## Files to Create

- `pipeline-service/pipeline_service/eval/gt_eval/baseline.py`
- `pipeline-service/tests/unit/eval/test_baseline.py`

No other files are touched in this section. The
`pipeline-service/eval/baseline.json` and
`pipeline-service/eval/thresholds.json` files are read at runtime;
neither is created or modified by this section's code (creation is
section-08's responsibility).

## Background — what this module persists

`pipeline-service/eval/baseline.json` is committed in git and serves
two roles: (a) a regression check (current run must not be
materially worse than baseline) and (b) a version stamp (so a baseline
captured under one LVIS sha256 / label encoder doesn't silently get
compared against a run captured under a different one).

The schema **extends** the existing baseline file structure (existing
keys preserved). Two new sub-blocks added:

```jsonc
{
  /* existing baseline keys preserved verbatim */
  "gt_metrics": {
    "headline": {
      "class_aware_map_50_95": 0.247, "class_aware_map_50": 0.355,
      "class_agnostic_map_50_95": 0.318, "class_agnostic_map_50": 0.461,
      "label_f1": 0.612, "box_f1_50": 0.487,
      "hallucination_rate": 0.082,
      "novel_likely_correct": 14, "judge_unsure": 8
    },
    "per_class_top10":    [{"category": "couch", "ap": 0.71}],
    "per_class_bottom10": [{"category": "spice_rack", "ap": 0.04}],
    "n_images": 500, "n_predictions": 4321, "n_ground_truths": 5012,
    "runtime_s": 1842.3
  },
  "stamps": {
    "lvis_dataset_sha256": "abc123...",
    "label_encoder_model_id": "sentence-transformers/all-MiniLM-L6-v2",
    "python_version": "3.11.10",
    "created_at": "2026-05-05T13:24:00Z"
  }
}
```

Bootstrap behaviour: if no baseline file exists OR an existing
baseline is missing the `gt_metrics` block, the current run
bootstraps it provided floors pass.

## Background — thresholds file

`pipeline-service/eval/thresholds.json` is read (not created) here.
The keys this module consumes:

```jsonc
{
  "gating": {
    /* existing keys preserved by section-08; not read here */
    "class_aware_map_50_95_min": 0.20,
    "class_agnostic_map_50_95_min": 0.30,
    "label_f1_min": 0.50,
    "hallucination_rate_max": 0.15
  }
}
```

Floors are absolute. The `warn` block is informational only and is
**not** enforced by `diff_and_check` — those keys belong to section-08.

## Public Surface

All declared in `gt_eval/baseline.py`. Stub-level signatures only:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class MetricDelta:
    """A single metric's current vs. baseline change."""
    metric: str
    current: float
    baseline: float
    delta: float  # current - baseline

@dataclass(frozen=True)
class MetricFloor:
    """A single metric's current value vs. its absolute floor."""
    metric: str
    current: float
    floor: float

@dataclass(frozen=True)
class BaselineDiff:
    """Result of diffing a current run against the committed baseline."""
    regressions: list[MetricDelta]
    improvements: list[MetricDelta]
    floor_violations: list[MetricFloor]
    baseline_age_days: int     # 0 when no baseline / version mismatch
    version_mismatch: bool     # True when stamps disagree
    baseline_committed: bool   # set by maybe_commit_baseline


def diff_and_check(
    current: "GtMetricsBlock",          # from section-05
    baseline_path: Path,
    thresholds_path: Path,
    *,
    current_stamps: "Stamps",            # see "Stamps" below
    now: datetime | None = None,         # injectable for tests
) -> BaselineDiff:
    """Load baseline + thresholds; produce a BaselineDiff for `current`.

    - Missing baseline file       -> "no baseline available" diff
                                     (regressions=[], improvements=[],
                                     baseline_age_days=0, version_mismatch=False).
    - Malformed JSON in baseline  -> same as missing; logs a warning.
    - Stamp mismatch              -> version_mismatch=True; regressions=[]
                                     (treated as no comparable baseline).
    - Floors are evaluated from `thresholds.json["gating"]` against
      `current` regardless of baseline state.
    """


def maybe_commit_baseline(
    diff: BaselineDiff,
    current: "GtMetricsBlock",
    baseline_path: Path,
    autocommit_enabled: bool,
    *,
    current_stamps: "Stamps",
) -> bool:
    """Write `current` (rounded to 3 decimals) plus stamps to baseline_path
    iff every gate passes. Returns True iff a baseline file was written.

    Gates (ALL required):
      1. autocommit_enabled is True.
      2. diff.regressions == [].
      3. diff.floor_violations == [].
      4. diff.version_mismatch is False, OR no baseline previously existed
         (the bootstrap path) AND env EVAL_LVIS_VERSION_BUMP=1 when stamps
         differ from what's on disk.
    """
```

The `Stamps` type is a small frozen dataclass local to this module:

```python
@dataclass(frozen=True)
class Stamps:
    lvis_dataset_sha256: str
    label_encoder_model_id: str
    python_version: str
    created_at: str  # ISO-8601 UTC, suffix "Z"
```

The orchestrator in section-08 builds `current_stamps` from
`LvisDataset.version_sha256`,
`pipeline_service.models.label_encoder._DEFAULT_MODEL_NAME`,
`sys.version`, and a UTC ISO timestamp.

## Behaviour Specification

### Persistence — rounding (review §5.1 R3)

Before writing a baseline, every float in `current.headline` and
`current.per_class_*` is rounded to **3 decimal places**. Cardinal
counts (`novel_likely_correct`, `judge_unsure`, `n_images`,
`n_predictions`, `n_ground_truths`) are NOT rounded. `runtime_s` IS
rounded (it's a float). MPS produces small floating-point variation
across runs that can flip a borderline gate; rounding stabilises
regression detection.

### Diff semantics

`diff_and_check` walks every key under `current.headline`. For each
key:

- **Higher-is-better** keys
  (`class_aware_map_50_95`, `class_aware_map_50`,
  `class_agnostic_map_50_95`, `class_agnostic_map_50`, `label_f1`,
  `box_f1_50`, `novel_likely_correct`):
  - `delta = current - baseline`.
  - `delta < 0` → goes to `regressions`.
  - `delta > 0` → goes to `improvements`.
  - `delta == 0` → omitted from both lists.

- **Lower-is-better** keys (`hallucination_rate`):
  - `delta = current - baseline` (sign convention preserved on the
    wire).
  - `delta > 0` → `regressions`.
  - `delta < 0` → `improvements`.

- **Null-tolerant** keys (`hallucination_rate` may be `None` when the
  judge was unhealthy): if either side is `None`, the metric is
  omitted from both lists.

`judge_unsure` is informational, not gated.

### Floor enforcement

`floor_violations` is computed from `thresholds.json["gating"]`,
independently of the baseline. The mapping:

- `class_aware_map_50_95_min` ↔ `current.headline.class_aware_map_50_95`
- `class_agnostic_map_50_95_min` ↔ `current.headline.class_agnostic_map_50_95`
- `label_f1_min` ↔ `current.headline.label_f1`
- `hallucination_rate_max` ↔ `current.headline.hallucination_rate`
  (skipped when `current.hallucination_rate is None` — see "Failure
  modes" below).

A floor violation is recorded when the current value is on the wrong
side of the threshold (`<` for `_min` keys, `>` for `_max` keys).

### Version-mismatch detection

`version_mismatch=True` iff *any* of the four stamps in the on-disk
baseline differ from the corresponding `current_stamps` field
(`lvis_dataset_sha256`, `label_encoder_model_id`, `python_version`).
`created_at` is informational only and is NOT compared. When mismatch
is detected:

- `regressions` and `improvements` are emptied (treated as "no
  comparable baseline available").
- `floor_violations` is still computed against `current` (floors are
  absolute, not version-relative).
- `baseline_age_days` is reported as 0.

Section-08 reads `version_mismatch` and treats it as
"bootstrap-eligible" — exits 0 if `EVAL_LVIS_VERSION_BUMP=1`, exits 1
otherwise. That branching is **not** in this module.

### Bootstrap policy (review §2.4)

If `baseline_path` does not exist OR the on-disk baseline is missing
the `gt_metrics` block:

- `diff_and_check` returns a "no baseline available" diff
  (`regressions=[]`, `improvements=[]`, `version_mismatch=False`,
  `baseline_age_days=0`). `floor_violations` is still computed.
- `maybe_commit_baseline` writes the current run as the first
  baseline iff `autocommit_enabled=True` AND `floor_violations==[]`.
  A run that fails floors during bootstrap exits without writing —
  preventing lock-in to a borked first run.

### Malformed-JSON handling

`json.JSONDecodeError` while reading `baseline_path` is caught,
logged as a warning, and treated as a missing file. Bootstrap
behaviour applies. The malformed file is **not** rewritten by
`diff_and_check` — section-08 decides whether to overwrite via
`maybe_commit_baseline`.

`json.JSONDecodeError` on `thresholds.json` re-raises (per
section-08's "test_thresholds_extension.py: malformed JSON → clear
error, no silent fallback" contract).

### `EVAL_BASELINE_AUTOCOMMIT=false` v1 default

`maybe_commit_baseline` accepts `autocommit_enabled` as a parameter,
NOT an env-var read. The orchestrator in section-08 reads
`EVAL_BASELINE_AUTOCOMMIT` (default `false`) and passes it in. This
keeps the module testable without env mutation.

When `autocommit_enabled=False`, `maybe_commit_baseline` returns
`False` immediately regardless of all other gate states (including a
perfect run). It still returns the gate-evaluation result by setting
`diff.baseline_committed=False` (the dataclass is frozen — return a
new instance via `dataclasses.replace`).

### `baseline_age_days`

Computed as
`(now - parse_iso(stamps.created_at)).days` where `now` is UTC.
The `now` parameter on `diff_and_check` is for test injection (so
fixed-clock tests do meaningful work). When no baseline exists or
version mismatch is detected, `baseline_age_days=0`.

## Tests — `tests/unit/eval/test_baseline.py`

All tests use stub fixtures and `tmp_path` / `tmp_path_factory`. No
real LVIS or models. Tests for the `GtMetricsBlock` / `HeadlineMetrics`
shape come from section-05; this section's tests build small fixture
instances of those types directly (via the real dataclasses, not
mocks).

```python
# Skeleton — one test per requirement; bodies omitted for brevity.

def test_round_trip_io(tmp_path):
    """Write a BaselineDiff via maybe_commit_baseline; read it back via
    diff_and_check and assert all gt_metrics + stamps fields equal."""

def test_diff_correctness_regressions_and_improvements(tmp_path):
    """Given baseline {map_50_95=0.30, label_f1=0.55} and current
    {map_50_95=0.25, label_f1=0.60}, assert regressions contains
    map_50_95 (delta=-0.05) and improvements contains label_f1
    (delta=+0.05)."""

def test_floor_enforcement_blocks_commit_even_when_autocommit_on(tmp_path):
    """Current map_50_95=0.18 vs floor 0.20 → floor_violations non-empty;
    maybe_commit_baseline(autocommit_enabled=True) returns False; no
    file written."""

def test_bootstrap_respects_floors(tmp_path):
    """baseline_path does not exist; current below floor →
    floor_violations populated; maybe_commit_baseline returns False;
    baseline_path still does not exist after the call."""

def test_bootstrap_below_floor_with_autocommit_off(tmp_path):
    """Same as above with autocommit_enabled=False — same outcome."""

def test_version_mismatch_detection(tmp_path):
    """On-disk baseline has lvis_dataset_sha256='aaa'; current_stamps
    has 'bbb'. Assert version_mismatch=True, regressions==[],
    improvements==[], baseline_age_days==0. Floors still evaluated."""

def test_label_encoder_mismatch_detection(tmp_path):
    """Same as above but trigger via label_encoder_model_id mismatch."""

def test_python_version_mismatch_detection(tmp_path):
    """Same as above but trigger via python_version mismatch."""

def test_rounding_to_three_decimals_before_persistence(tmp_path):
    """Write current with map_50_95=0.247912; read back; assert stored
    value is 0.248. Cardinal counts unrounded (n_images=500 stays 500)."""

def test_runtime_s_is_rounded(tmp_path):
    """runtime_s=1842.3456 rounds to 1842.346 on disk."""

def test_malformed_baseline_json_treated_as_missing(tmp_path, caplog):
    """Write '{not json' to baseline_path; diff_and_check returns
    'no baseline available' diff; warning logged; floor_violations
    still computed; file not rewritten."""

def test_autocommit_false_returns_false_on_perfect_run(tmp_path):
    """Build a current that strictly improves baseline and passes all
    floors; call maybe_commit_baseline(autocommit_enabled=False);
    assert returns False; baseline file unchanged."""

def test_baseline_missing_gt_metrics_block_treated_as_bootstrap(tmp_path):
    """On-disk baseline has existing keys but no gt_metrics →
    diff_and_check returns 'no baseline available' diff;
    maybe_commit_baseline writes a new baseline preserving the existing
    top-level keys verbatim alongside the new gt_metrics + stamps."""

def test_baseline_age_days_computed_from_stamps_created_at(tmp_path):
    """Inject now=2026-05-15; baseline created_at=2026-05-05T13:24:00Z;
    assert baseline_age_days==9 (or 10, pick exact value matching
    UTC-day arithmetic and pin in the test)."""

def test_hallucination_rate_null_skips_its_floor(tmp_path):
    """current.hallucination_rate is None → no MetricFloor entry for
    hallucination_rate even though hallucination_rate_max is set in
    thresholds."""

def test_existing_top_level_keys_preserved_on_commit(tmp_path):
    """Pre-write baseline.json with {'metrics': {...}, 'gt_metrics': old};
    call maybe_commit_baseline; re-read file and assert the existing
    'metrics' top-level key is still present and unchanged."""
```

## Implementation Notes

- Use `pathlib.Path` for all paths; never `os.path`.
- Use `json.dumps(..., indent=2, sort_keys=True)` when writing the
  baseline so git diffs stay readable.
- Use `datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")`
  for the `created_at` stamp; parse with
  `datetime.fromisoformat(s.replace("Z", "+00:00"))`.
- Float rounding: `round(value, 3)`. Apply before serialisation, never
  after read (rounding-on-read would break round-trip equality tests).
- Logging: use `logging.getLogger(__name__)`; warnings only on the
  malformed-JSON / missing-baseline paths.
- The frozen dataclasses must be `eq=True` (the default) so the
  round-trip test can use `==`.
- Do NOT read environment variables anywhere in this module.
  `autocommit_enabled` arrives as a parameter; the orchestrator in
  section-08 owns env-var translation.
- Do NOT import section-05's metrics module to compute anything; it
  is consumed only as a data-shape contract. A
  `from pipeline_service.eval.gt_eval.run import GtMetricsBlock`
  forward-reference is acceptable for typing if needed (use a
  `TYPE_CHECKING` guard to avoid an import cycle, since section-08's
  `run.py` will import this module).

## Out of Scope

- Writing `thresholds.json` (section-08 owns creation/extension).
- Reading any env vars (section-08 owns env handling).
- Computing the `gt_metrics` block (section-05 owns this).
- Building `current_stamps` (section-08 owns this — it has access to
  the LVIS dataset instance and the label encoder default name).
- Exit-code logic (section-08 owns `run_eval.py` integration).

Files relevant to this section:
- `/Users/mrarindampaul/Develop/allmythings/docs/superpowers/specs/sections/section-06-baseline.md` (output, written by hook)
- `/Users/mrarindampaul/Develop/allmythings/docs/superpowers/specs/claude-plan.md` (source — §4.10, §5.4, §5.5, §7.3)
- `/Users/mrarindampaul/Develop/allmythings/docs/superpowers/specs/claude-plan-tdd.md` (source — §4.10)
- `/Users/mrarindampaul/Develop/allmythings/docs/superpowers/specs/sections/index.md` (manifest)