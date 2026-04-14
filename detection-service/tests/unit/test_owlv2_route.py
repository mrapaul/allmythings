from pathlib import Path
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from detection_service.main import app
    return TestClient(app)


@pytest.fixture
def fixture_bytes():
    repo_root = Path(__file__).resolve().parents[3]
    fixture = repo_root / "eval" / "fixtures" / "1776173015803.jpg"
    assert fixture.exists(), f"missing fixture: {fixture}"
    return fixture.read_bytes()


def test_owlv2_returns_boxes(client, fixture_bytes):
    res = client.post(
        "/detect/owlv2",
        files={"file": ("test.jpg", fixture_bytes, "image/jpeg")},
        data={"score_threshold": "0.15"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "boxes" in body
    assert isinstance(body["boxes"], list)
    assert len(body["boxes"]) >= 3
    first = body["boxes"][0]
    assert set(first.keys()) >= {"label", "score", "x", "y", "width", "height"}
    assert 0 <= first["x"] <= 1
    assert 0 <= first["y"] <= 1
