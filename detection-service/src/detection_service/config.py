from __future__ import annotations
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="DETECTION_", extra="ignore")

    service_name: str = "detection-service"
    version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 14001

    database_url: str = "postgres://allmythings:allmythings_dev@localhost:5432/allmythings"
    nats_url: str = "nats://localhost:4222"
    minio_endpoint: str = "http://localhost:9000"
    minio_access_key: str = "allmythings"
    minio_secret_key: str = "allmythings_dev"
    minio_bucket_images: str = "images"

    otlp_endpoint: str = "http://localhost:4317"

    inference_backend: str = Field(default="mlx", pattern="^(mlx|cuda|modal)$")

    # Model cache dir
    model_cache_dir: str = "~/.cache/detection-service/models"

    # YOLOE
    yoloe_model: str = "yolo11n.pt"
    yoloe_prompt: str = "object . item . thing"
    yoloe_confidence: float = 0.15
    sahi_grid_cols: int = 2
    sahi_grid_rows: int = 2
    sahi_overlap: float = 0.2
    sahi_nms_threshold: float = 0.5


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
