from fastapi.testclient import TestClient

def test_metrics_endpoint_serves_prometheus():
    from main import app
    client = TestClient(app)
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "python_info" in r.text

def test_tracer_provider_initialized():
    from opentelemetry import trace
    from detection_service.telemetry import configure_telemetry
    configure_telemetry(app=None, service_name="test-svc")
    tracer = trace.get_tracer(__name__)
    with tracer.start_as_current_span("test-span") as span:
        assert span.is_recording()
