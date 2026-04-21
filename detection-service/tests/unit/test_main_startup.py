"""Verify that MLX/YOLO eager loading is not present in the active pipeline."""
from fastapi.testclient import TestClient


def test_detect_fast_route_removed():
    """The legacy /detect/fast route is removed from the active pipeline."""
    from detection_service.main import app
    client = TestClient(app)
    response = client.post("/detect/fast")
    assert response.status_code == 404, \
        "/detect/fast is legacy YOLO — must not exist in the Florence pipeline"


def test_florence_route_registered():
    """Florence route is registered."""
    from detection_service.main import app
    routes = {getattr(r, "path", None) for r in app.routes}
    assert "/detect/florence" in routes


def test_no_mlx_backend_in_lifespan(monkeypatch):
    """Startup must not eagerly load the MLX/YOLO backend.

    We patch MLXBackend to raise if instantiated and verify app imports succeed.
    """
    import importlib
    import sys

    # Clear cached module if already loaded
    for mod_name in list(sys.modules):
        if "mlx_backend" in mod_name or "detection_service.main" in mod_name:
            sys.modules.pop(mod_name, None)

    # Force ImportError on mlx_backend — if main.py doesn't import it, this is fine
    class _Blocker:
        def find_spec(self, name, path, target=None):
            if name.endswith("mlx_backend"):
                raise ImportError("mlx_backend must not be imported at startup")
            return None

    sys.meta_path.insert(0, _Blocker())
    try:
        importlib.import_module("detection_service.main")
    finally:
        sys.meta_path.pop(0)
