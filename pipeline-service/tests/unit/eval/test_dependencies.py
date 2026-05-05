"""Smoke tests for the dependencies added in section-01-foundation.

These tests fail loudly if a later section's runtime import would crash
on a fresh checkout. They do not assert any behaviour beyond
"the import resolves".
"""


def test_pycocotools_imports() -> None:
    """pycocotools is importable."""
    import pycocotools  # noqa: F401


def test_pycocotools_cocoeval_imports() -> None:
    """The COCOeval engine is importable — exercised by §05's coco wrapper."""
    from pycocotools.cocoeval import COCOeval  # noqa: F401


def test_torchmetrics_detection_imports() -> None:
    """torchmetrics fallback path used by §05 when pycocotools is absent.

    torchmetrics 1.9+ only exposes MeanAveragePrecision via the submodule
    path; the package `__init__.py` is empty by design (lazy import to
    avoid hard-pulling vision deps on every torchmetrics user).
    """
    from torchmetrics.detection.mean_ap import MeanAveragePrecision  # noqa: F401


def test_scipy_linear_sum_assignment_imports() -> None:
    """Hungarian assignment solver used by §03's IoU matcher."""
    from scipy.optimize import linear_sum_assignment  # noqa: F401


def test_numpy_default_rng_imports() -> None:
    """Stable-across-Python-versions sampler used by §02's LVIS loader."""
    from numpy.random import default_rng  # noqa: F401


def test_requests_imports() -> None:
    """Sync HTTP client used by §02's LVIS downloader."""
    import requests  # noqa: F401


def test_tqdm_imports() -> None:
    """Progress bar used by §02 download + §08 per-image loop."""
    import tqdm  # noqa: F401
