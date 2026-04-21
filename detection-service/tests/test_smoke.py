def test_imports():
    from detection_service import config
    assert config.settings.service_name == "detection-service"

def test_main_app_boots():
    from detection_service.main import app
    assert app.title == "detection-service"
