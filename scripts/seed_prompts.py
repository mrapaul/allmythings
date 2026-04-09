#!/usr/bin/env python3
"""Seed the prompts_catalog table from prompts/*.yaml and prompts/*.txt.

Idempotent — existing (prompt_name, version) rows are updated in place.
"""
from __future__ import annotations
import os
from pathlib import Path
import psycopg

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://allmythings:allmythings_dev@localhost:5432/allmythings",
)
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

PROMPT_FILES = [
    ("gatekeeper_interior", 1, PROMPTS_DIR / "gatekeeper_interior.v1.yaml"),
    ("qwen_enumerate",      1, PROMPTS_DIR / "qwen_enumerate.v1.txt"),
    ("qwen_attributes",     1, PROMPTS_DIR / "qwen_attributes.v1.txt"),
    ("molmo_points",        1, PROMPTS_DIR / "molmo_points.v1.txt"),
    ("taxonomy_learn",      1, PROMPTS_DIR / "taxonomy_learn.v1.md"),
]

def main() -> None:
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        for name, version, path in PROMPT_FILES:
            body = path.read_text(encoding="utf-8")
            conn.execute(
                """
                INSERT INTO prompts_catalog (prompt_name, version, body, status, traffic_pct)
                VALUES (%s, %s, %s, 'active', 100)
                ON CONFLICT (prompt_name, version) DO UPDATE
                  SET body = EXCLUDED.body,
                      status = 'active',
                      traffic_pct = 100
                """,
                (name, version, body),
            )
            print(f"Seeded {name} v{version} ({len(body)} bytes)")

if __name__ == "__main__":
    main()
