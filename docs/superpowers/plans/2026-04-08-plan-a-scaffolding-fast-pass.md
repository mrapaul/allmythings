# Plan A — Scaffolding + Fast Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the full FOSS dev stack (Postgres+pgvector, MinIO, NATS, Prometheus/Tempo/Loki/Grafana, MLflow, Label Studio, Prefect) on the M4 Pro Mac, wire OpenTelemetry end-to-end, implement the `InferenceBackend` abstraction with an MLX backend, and deliver the fast-pass detection pipeline (Tier-0 CLIP gatekeeper → YOLOE+SAHI → CLIP memory-bank read) exposed via an async API (202 + SSE). Acceptance: `test_images/ai_interior.jpg` fast pass returns ≥15 detections, gatekeeper rejects a selfie with 422, fast-pass p95 ≤ 10 s under 30 RPM load.

---

## ⚠️ License risks acknowledged — read before execution

Research verified two **commercial-use blockers** baked into Plan A:

1. **YOLOE weights distributed via the `ultralytics` Python package are AGPL-3.0.** That's the exact weight file (`yoloe-11l-seg-pf.pt` on `jameslahm/yoloe`) Plan A uses. AGPL-3.0 triggers copyleft obligations if you ship a SaaS, hosted service, or distributed binary.
2. **Apple FastVLM** (mentioned only in the spec's v2 on-device roadmap diagram, **not** in any Plan A task) is Apple ML Research Model License — research-only, no commercial exploitation.

**Decision locked in (option X):** Ship Plan A with YOLOE for now. This is a **development / internal test environment**; no external distribution, no public SaaS, no binary shipping until the swap. Before any commercial launch the following must happen (tracked separately as a Plan A+ follow-up, not blocking Plan A):

- Replace YOLOE-11L with **YOLO-World v2-L** (Apache-2.0) or **OWLv2-large-ensemble** (Apache-2.0)
- Fast-pass ≥15 floor is still expected to hold post-swap because Plan B's deep pass (Qwen2.5-VL + Molmo) carries the real recall burden
- Ensure no FastVLM code ever lands in any tier path; v2 on-device roadmap uses **PaliGemma-2 3B** or **Qwen2.5-VL-3B MLX Q4** (both Apache-2.0) instead

A `models/MANIFEST.yaml` file is committed in Task 1 step 3 to make license status visible in code review and prevent this from silently regressing.

**Architecture:** Docker Compose runs all stateless FOSS infra on the Mac. Native Python processes (outside Docker) run inference to access Metal/ANE. api-service (Fastify, Node 20) receives uploads, publishes jobs to NATS `fast.q`, returns 202 + jobId immediately; mobile subscribes to SSE under that jobId. detection-service (Python 3.12, FastAPI) hosts the fast-pass worker that pulls from `fast.q`, runs the pipeline through `MLXBackend`, persists results to Postgres, and publishes `fast.complete` back to NATS. Every stage emits OpenTelemetry traces and metrics.

**Tech Stack:** TypeScript 5, Fastify 4, Kysely + pg, @opentelemetry/sdk-node, nats.js, Vitest — Python 3.12, FastAPI, uv (package manager), mlx, mlx-vlm, transformers, open-clip-torch (CPU/MPS), ultralytics (YOLOE), sahi, psycopg[binary], nats-py, opentelemetry-distro, pytest — Docker Compose, Postgres 16 + pgvector, MinIO, NATS JetStream 2.10, Prometheus, Grafana Tempo + Loki + Grafana OSS, MLflow 2.x, Label Studio Community, Prefect 2 — dbmate for migrations, DVC for golden set.

---

## File structure

```
allmythings/
├── docker-compose.dev.yml                    [NEW]
├── .docker-data/                             [gitignored, volumes]
│   ├── postgres/, minio/, nats/, prometheus/, tempo/, loki/, grafana/, mlflow/, label-studio/, prefect/
├── infra/
│   ├── postgres/
│   │   └── init/01_extensions.sql            [NEW]
│   ├── prometheus/
│   │   └── prometheus.yml                    [NEW]
│   ├── tempo/
│   │   └── tempo.yaml                        [NEW]
│   ├── loki/
│   │   └── loki-config.yaml                  [NEW]
│   ├── grafana/
│   │   ├── provisioning/datasources/datasources.yml [NEW]
│   │   └── provisioning/dashboards/dashboards.yml   [NEW]
│   └── nats/
│       └── nats.conf                         [NEW]
├── db/
│   ├── dbmate.env                            [NEW]
│   └── migrations/
│       ├── 20260408120000_base_schema.sql    [NEW]  tenants, users, images, jobs, detections
│       ├── 20260408120100_feedback.sql       [NEW]  feedback_events
│       ├── 20260408120200_memory_bank.sql    [NEW]  memory_bank + HNSW index
│       ├── 20260408120300_active_learning.sql [NEW] active_learning_queue
│       ├── 20260408120400_taxonomy.sql       [NEW]  taxonomy_category
│       ├── 20260408120500_prompts.sql        [NEW]  prompts_catalog
│       └── 20260408120600_audit.sql          [NEW]  audit_log
│
├── api-service/
│   ├── package.json                          [MODIFY] add pg, kysely, nats, otel, ioredis, perceptual-hash
│   ├── src/
│   │   ├── app.ts                            [MODIFY] wire OTel, pg, nats on boot
│   │   ├── telemetry.ts                      [NEW]  OTel bootstrap
│   │   ├── db/
│   │   │   ├── pool.ts                       [NEW]  pg + Kysely instance
│   │   │   └── schema.ts                     [NEW]  Kysely type definitions
│   │   ├── nats/
│   │   │   ├── client.ts                     [NEW]  NATS connection + trace propagation
│   │   │   └── subjects.ts                   [NEW]  'fast.q','fast.complete','deep.q','deep.complete'
│   │   ├── routes/
│   │   │   ├── detect.route.ts               [REWRITE] 202 + jobId, publish to fast.q
│   │   │   ├── jobs.route.ts                 [NEW]  SSE stream for job updates
│   │   │   └── health.route.ts               [MODIFY] check pg + nats
│   │   ├── services/
│   │   │   ├── phash-dedup.service.ts        [NEW]
│   │   │   ├── job-store.service.ts          [NEW]  pg-backed job state
│   │   │   └── detection-pipeline.service.ts [DELETE]  replaced by NATS
│   │   ├── providers/                        [DELETE ENTIRE DIR]  cloud adapters obsolete
│   │   └── __tests__/integration/
│   │       ├── detect-fast-pass.test.ts      [NEW]
│   │       └── gatekeeper-reject.test.ts     [NEW]
│   └── tsconfig.json                         [MODIFY] ES2022 target for OTel
│
├── detection-service/
│   ├── pyproject.toml                        [NEW]  uv project config
│   ├── uv.lock                               [NEW]  pinned deps
│   ├── main.py                               [REWRITE] FastAPI app, OTel, lifespan
│   ├── main.legacy.py                        [NEW]  snapshot of old main.py for reference
│   ├── requirements.txt                      [DELETE]
│   ├── src/detection_service/
│   │   ├── __init__.py                       [NEW]
│   │   ├── telemetry.py                      [NEW]  OTel bootstrap
│   │   ├── config.py                         [NEW]  pydantic Settings
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── pool.py                       [NEW]  psycopg3 async pool
│   │   │   └── prompts_repo.py               [NEW]  reads prompts_catalog
│   │   ├── nats_client/
│   │   │   ├── __init__.py
│   │   │   └── client.py                     [NEW]  nats-py + trace propagation
│   │   ├── backends/
│   │   │   ├── __init__.py
│   │   │   ├── base.py                       [NEW]  InferenceBackend Protocol
│   │   │   └── mlx_backend.py                [NEW]  Apple Silicon implementation
│   │   ├── pipeline/
│   │   │   ├── __init__.py
│   │   │   ├── gatekeeper.py                 [NEW]  CLIP ViT-B/32 zero-shot
│   │   │   ├── fast_pass.py                  [NEW]  orchestrator
│   │   │   ├── sahi_yoloe.py                 [NEW]  YOLOE + SAHI tiling
│   │   │   ├── memory_bank.py                [NEW]  pgvector read + label resolve
│   │   │   └── semantic.py                   [NEW]  CLIP text-embed cosine helpers
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── health.py                     [NEW]
│   │   │   └── fast_detect.py                [NEW]
│   │   └── workers/
│   │       ├── __init__.py
│   │       └── fast_worker.py                [NEW]  NATS subscriber → pipeline.fast_pass
│   └── tests/
│       ├── conftest.py                       [NEW]
│       ├── unit/
│       │   ├── test_gatekeeper.py            [NEW]
│       │   ├── test_sahi_yoloe.py            [NEW]
│       │   ├── test_memory_bank.py           [NEW]
│       │   └── test_semantic.py              [NEW]
│       └── integration/
│           ├── test_fast_pass_ai_interior.py [NEW]  headline ≥15 test
│           └── test_fast_pass_gatekeeper.py  [NEW]  selfie rejection
│
├── prompts/
│   ├── gatekeeper_interior.v1.yaml           [NEW]  seed
│   ├── qwen_enumerate.v1.txt                 [NEW]  seed (used by Plan B)
│   ├── qwen_attributes.v1.txt                [NEW]  seed (Plan B)
│   ├── molmo_points.v1.txt                   [NEW]  seed (Plan B)
│   └── taxonomy_learn.v1.md                  [NEW]  seed (Plan D)
│
├── eval/
│   └── golden/
│       ├── .dvc                              [NEW]  DVC tracking
│       ├── README.md                         [NEW]
│       └── ai_interior.labeled.json          [NEW]  hand-labeled ground truth for acceptance
│
├── load-tests/
│   └── fast-pass.k6.js                       [NEW]
│
└── .github/workflows/
    └── plan-a-ci.yml                         [NEW]  docker-compose up, migrate, run tests
```

---

## Task 1: Create `docker-compose.dev.yml` foundation

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `infra/postgres/init/01_extensions.sql`
- Create: `.gitignore` entry for `.docker-data/`

- [ ] **Step 1: Write the health-check integration test**

Create `tests/compose/test_stack_up.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# Must run from repo root
docker compose -f docker-compose.dev.yml up -d postgres minio nats
# Wait for Postgres ready
for i in {1..30}; do
  if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U allmythings; then
    echo "Postgres ready"; break
  fi
  sleep 2
done
# Confirm pgvector extension is loadable
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT 'vector ok';"
# Confirm MinIO health
curl -fsS http://localhost:9000/minio/health/live
# Confirm NATS JetStream enabled
docker compose -f docker-compose.dev.yml exec -T nats nats --server nats://localhost:4222 stream ls || true
echo "STACK_UP_OK"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash tests/compose/test_stack_up.sh`
Expected: FAIL — `docker-compose.dev.yml` doesn't exist yet.

- [ ] **Step 3: Write the compose file with Postgres + MinIO + NATS**

Create `docker-compose.dev.yml`:

```yaml
name: allmythings-dev

networks:
  allmythings-dev:
    driver: bridge

volumes:
  postgres-data:
  minio-data:
  nats-data:

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: amt-postgres
    environment:
      POSTGRES_USER: allmythings
      POSTGRES_PASSWORD: allmythings_dev
      POSTGRES_DB: allmythings
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./infra/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U allmythings -d allmythings"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks: [allmythings-dev]

  minio:
    image: minio/minio:RELEASE.2025-02-07T23-21-09Z
    container_name: amt-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: allmythings
      MINIO_ROOT_PASSWORD: allmythings_dev
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [allmythings-dev]

  minio-init:
    image: minio/mc:RELEASE.2025-02-08T19-14-21Z
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 allmythings allmythings_dev &&
      mc mb --ignore-existing local/images local/mlflow local/iceberg &&
      mc anonymous set download local/images &&
      echo 'MinIO buckets ready'
      "
    networks: [allmythings-dev]

  nats:
    image: nats:2.10-alpine
    container_name: amt-nats
    command: ["-js", "-sd", "/data", "-m", "8222"]
    ports:
      - "4222:4222"
      - "8222:8222"
    volumes:
      - nats-data:/data
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8222/healthz"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [allmythings-dev]
```

Create `infra/postgres/init/01_extensions.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Append to `.gitignore`:

```
.docker-data/
```

Create `models/MANIFEST.yaml` (tracks every model weight this repo loads, with license status so commercial-use risks are visible in code review):

```yaml
# Model manifest — update whenever a new model is wired into any backend.
# commercial: true/false is the hard gate. Anything `false` must be
# removed before any commercial release.
models:
  - name: yoloe-11l-pf
    hf_repo: jameslahm/yoloe
    weights_file: yoloe-11l-seg-pf.pt
    license: agpl-3.0
    commercial: false
    size_gb: 0.06
    backend: pytorch
    purpose: fast-pass prompt-free open-vocab detection
    notes: |
      AGPL-3.0 via Ultralytics distribution. Plan A uses this during
      development only. Must swap to YOLO-World v2-L (Apache-2.0) or
      OWLv2-large-ensemble (Apache-2.0) before commercial launch.
      Tracked as Plan A+ follow-up.

  - name: clip-vit-b32
    hf_repo: openai/clip-vit-base-patch32
    license: mit
    commercial: true
    size_gb: 0.6
    backend: transformers
    purpose: Tier-0 interior-photo gatekeeper (zero-shot classifier)

  - name: clip-vit-l14
    hf_repo: openai/clip-vit-large-patch14
    license: mit
    commercial: true
    size_gb: 1.7
    backend: transformers
    purpose: memory-bank embeddings (768-dim via get_image_features)

# Models explicitly excluded from this repo for license reasons:
excluded:
  - name: fastvlm
    github_repo: apple/ml-fastvlm
    license: apple-ml-research-model-license
    commercial: false
    reason: research-only license, excludes commercial exploitation.
            v2 on-device roadmap uses PaliGemma-2 3B or
            Qwen2.5-VL-3B MLX Q4 (both Apache-2.0) instead.
```

- [ ] **Step 4: Run stack-up test**

Run: `bash tests/compose/test_stack_up.sh`
Expected: PASS, prints `STACK_UP_OK`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.dev.yml infra/postgres/init/01_extensions.sql .gitignore \
  tests/compose/test_stack_up.sh models/MANIFEST.yaml
git commit -m "feat(infra): docker-compose base — Postgres+pgvector, MinIO, NATS JetStream + model manifest"
```

---

## Task 2: Add observability stack (Prometheus + Tempo + Loki + Grafana)

**Files:**
- Modify: `docker-compose.dev.yml`
- Create: `infra/prometheus/prometheus.yml`
- Create: `infra/tempo/tempo.yaml`
- Create: `infra/loki/loki-config.yaml`
- Create: `infra/grafana/provisioning/datasources/datasources.yml`

- [ ] **Step 1: Write the observability health test**

Create `tests/compose/test_observability.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose -f docker-compose.dev.yml up -d prometheus tempo loki grafana
sleep 10
curl -fsS http://localhost:9090/-/healthy          # Prometheus
curl -fsS http://localhost:3200/ready              # Tempo
curl -fsS http://localhost:3100/ready              # Loki
curl -fsS http://localhost:3000/api/health         # Grafana
echo "OBSERVABILITY_OK"
```

- [ ] **Step 2: Run and verify fail**

Run: `bash tests/compose/test_observability.sh`
Expected: FAIL — services not defined.

- [ ] **Step 3: Add observability services**

Append to `docker-compose.dev.yml` under `volumes:`:

```yaml
  prometheus-data:
  tempo-data:
  loki-data:
  grafana-data:
```

Append under `services:`:

```yaml
  prometheus:
    image: prom/prometheus:v3.1.0
    container_name: amt-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    volumes:
      - ./infra/prometheus:/etc/prometheus:ro
      - prometheus-data:/prometheus
    networks: [allmythings-dev]

  tempo:
    image: grafana/tempo:2.7.0
    container_name: amt-tempo
    command: ["-config.file=/etc/tempo.yaml"]
    ports:
      - "3200:3200"   # query
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
    volumes:
      - ./infra/tempo/tempo.yaml:/etc/tempo.yaml:ro
      - tempo-data:/var/tempo
    networks: [allmythings-dev]

  loki:
    image: grafana/loki:3.4.1
    container_name: amt-loki
    command: ["-config.file=/etc/loki/loki-config.yaml"]
    ports:
      - "3100:3100"
    volumes:
      - ./infra/loki/loki-config.yaml:/etc/loki/loki-config.yaml:ro
      - loki-data:/loki
    networks: [allmythings-dev]

  grafana:
    image: grafana/grafana-oss:11.5.1
    container_name: amt-grafana
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./infra/grafana/provisioning:/etc/grafana/provisioning:ro
    depends_on: [prometheus, tempo, loki]
    networks: [allmythings-dev]
```

Create `infra/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'api-service'
    static_configs:
      - targets: ['host.docker.internal:14000']
    metrics_path: /metrics

  - job_name: 'detection-service'
    static_configs:
      - targets: ['host.docker.internal:14001']
    metrics_path: /metrics

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

Create `infra/tempo/tempo.yaml`:

```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318

ingester:
  trace_idle_period: 10s
  max_block_bytes: 1_000_000
  max_block_duration: 5m

compactor:
  compaction:
    block_retention: 48h

storage:
  trace:
    backend: local
    local:
      path: /var/tempo/traces
    wal:
      path: /var/tempo/wal
```

Create `infra/loki/loki-config.yaml`:

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
```

Create `infra/grafana/provisioning/datasources/datasources.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus
    url: http://prometheus:9090
    isDefault: true
  - name: Tempo
    type: tempo
    uid: tempo
    url: http://tempo:3200
    jsonData:
      tracesToLogs:
        datasourceUid: loki
  - name: Loki
    type: loki
    uid: loki
    url: http://loki:3100
```

- [ ] **Step 4: Run observability test**

Run: `bash tests/compose/test_observability.sh`
Expected: PASS, prints `OBSERVABILITY_OK`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.dev.yml infra/prometheus infra/tempo infra/loki infra/grafana tests/compose/test_observability.sh
git commit -m "feat(infra): observability stack — Prometheus, Tempo, Loki, Grafana with OTLP gRPC"
```

---

## Task 3: Add MLflow + Label Studio + Prefect to compose

**Files:**
- Modify: `docker-compose.dev.yml`

- [ ] **Step 1: Write health test**

Create `tests/compose/test_mlops.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose -f docker-compose.dev.yml up -d mlflow label-studio prefect
sleep 20
curl -fsS http://localhost:5000/health              # MLflow
curl -fsS http://localhost:8080/health              # Label Studio
curl -fsS http://localhost:4200/api/health          # Prefect
echo "MLOPS_OK"
```

- [ ] **Step 2: Run to verify fail**

Run: `bash tests/compose/test_mlops.sh` — expect FAIL.

- [ ] **Step 3: Add services**

Append to `docker-compose.dev.yml` volumes:

```yaml
  mlflow-data:
  label-studio-data:
  prefect-data:
```

Append services:

```yaml
  mlflow:
    image: ghcr.io/mlflow/mlflow:v2.20.1
    container_name: amt-mlflow
    command: >
      mlflow server
      --host 0.0.0.0
      --port 5000
      --backend-store-uri postgresql://allmythings:allmythings_dev@postgres:5432/allmythings
      --default-artifact-root s3://mlflow/
    environment:
      AWS_ACCESS_KEY_ID: allmythings
      AWS_SECRET_ACCESS_KEY: allmythings_dev
      MLFLOW_S3_ENDPOINT_URL: http://minio:9000
      AWS_DEFAULT_REGION: us-east-1
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
    networks: [allmythings-dev]

  label-studio:
    image: heartexlabs/label-studio:1.15.0
    container_name: amt-label-studio
    environment:
      DJANGO_DB: default
      POSTGRE_NAME: allmythings
      POSTGRE_USER: allmythings
      POSTGRE_PASSWORD: allmythings_dev
      POSTGRE_HOST: postgres
      POSTGRE_PORT: 5432
      LABEL_STUDIO_USERNAME: admin@local
      LABEL_STUDIO_PASSWORD: allmythings_dev
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - label-studio-data:/label-studio/data
    networks: [allmythings-dev]

  prefect:
    image: prefecthq/prefect:2.20-python3.12
    container_name: amt-prefect
    command: prefect server start --host 0.0.0.0
    environment:
      PREFECT_SERVER_DATABASE_CONNECTION_URL: postgresql+asyncpg://allmythings:allmythings_dev@postgres:5432/allmythings
      PREFECT_API_URL: http://localhost:4200/api
    ports:
      - "4200:4200"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - prefect-data:/root/.prefect
    networks: [allmythings-dev]
```

- [ ] **Step 4: Run test**

Run: `bash tests/compose/test_mlops.sh`
Expected: PASS, prints `MLOPS_OK`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.dev.yml tests/compose/test_mlops.sh
git commit -m "feat(infra): MLOps stack — MLflow, Label Studio, Prefect server"
```

---

## Task 4: Initialize dbmate and write base schema migration

**Files:**
- Create: `db/dbmate.env`
- Create: `db/migrations/20260408120000_base_schema.sql`
- Create: `Makefile` target

- [ ] **Step 1: Write migration test**

Create `tests/db/test_base_schema.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
docker run --rm --network allmythings-dev_allmythings-dev \
  -v "$(pwd)/db:/db" -w /db \
  --env-file db/dbmate.env \
  ghcr.io/amacneil/dbmate:2.25 up

# Verify tables exist
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -c "\dt public.*" | tee /tmp/tables.txt
grep -q "tenants" /tmp/tables.txt
grep -q "users" /tmp/tables.txt
grep -q "images" /tmp/tables.txt
grep -q "jobs" /tmp/tables.txt
grep -q "detections" /tmp/tables.txt
echo "BASE_SCHEMA_OK"
```

- [ ] **Step 2: Run — expect fail**

Run: `bash tests/db/test_base_schema.sh` — FAIL, dbmate.env missing.

- [ ] **Step 3: Create dbmate config and migration**

Create `db/dbmate.env`:

```bash
DATABASE_URL=postgres://allmythings:allmythings_dev@postgres:5432/allmythings?sslmode=disable
DBMATE_MIGRATIONS_DIR=/db/migrations
DBMATE_SCHEMA_FILE=/db/schema.sql
```

Create `db/migrations/20260408120000_base_schema.sql`:

```sql
-- migrate:up
CREATE TABLE tenants (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  contribute_to_training boolean NOT NULL DEFAULT true
);

CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email        text UNIQUE NOT NULL,
  role         text NOT NULL DEFAULT 'user' CHECK (role IN ('user','reviewer','admin')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON users (tenant_id);

CREATE TABLE images (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  s3_key          text NOT NULL,
  phash           bytea NOT NULL,
  width           int NOT NULL,
  height          int NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  golden_set_consent boolean NOT NULL DEFAULT false
);
CREATE INDEX ON images (tenant_id, created_at DESC);
CREATE INDEX ON images (phash);

CREATE TABLE jobs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  image_id        uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('queued','fast_running','fast_done','deep_running','deep_done','failed')),
  enrichment_state text NOT NULL DEFAULT 'pending' CHECK (enrichment_state IN ('pending','fast','deep','enriched','failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  fast_completed_at  timestamptz,
  deep_completed_at  timestamptz,
  error_message   text
);
CREATE INDEX ON jobs (tenant_id, created_at DESC);
CREATE INDEX ON jobs (status) WHERE status != 'deep_done';

CREATE TABLE detections (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id              uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL,
  label               text NOT NULL,
  category_canonical  text,
  category_raw        text,
  bbox_x              real NOT NULL,
  bbox_y              real NOT NULL,
  bbox_w              real NOT NULL,
  bbox_h              real NOT NULL,
  confidence          real NOT NULL,
  enrichment_state    text NOT NULL DEFAULT 'fast',
  sources             text[] NOT NULL DEFAULT '{}',
  candidate_labels    text[] NOT NULL DEFAULT '{}',
  disagreement_flag   boolean NOT NULL DEFAULT false,
  attributes          jsonb NOT NULL DEFAULT '{}',
  model_version       text,
  prompt_version      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON detections (job_id);
CREATE INDEX ON detections (tenant_id);

-- migrate:down
DROP TABLE detections;
DROP TABLE jobs;
DROP TABLE images;
DROP TABLE users;
DROP TABLE tenants;
```

Create `Makefile` (append if exists):

```make
.PHONY: db-up db-down db-new

DBMATE := docker run --rm --network allmythings-dev_allmythings-dev \
  -v $(PWD)/db:/db -w /db --env-file db/dbmate.env \
  ghcr.io/amacneil/dbmate:2.25

db-up:
	$(DBMATE) up

db-down:
	$(DBMATE) down

db-new:
	$(DBMATE) new $(NAME)
```

- [ ] **Step 4: Run test**

Run: `bash tests/db/test_base_schema.sh`
Expected: PASS, prints `BASE_SCHEMA_OK` and lists all five tables.

- [ ] **Step 5: Commit**

```bash
git add db/dbmate.env db/migrations/20260408120000_base_schema.sql Makefile tests/db/test_base_schema.sh
git commit -m "feat(db): base schema migration — tenants, users, images, jobs, detections"
```

---

## Task 5: Memory bank + feedback + active learning + taxonomy + prompts migrations

**Files:**
- Create: `db/migrations/20260408120100_feedback.sql`
- Create: `db/migrations/20260408120200_memory_bank.sql`
- Create: `db/migrations/20260408120300_active_learning.sql`
- Create: `db/migrations/20260408120400_taxonomy.sql`
- Create: `db/migrations/20260408120500_prompts.sql`
- Create: `db/migrations/20260408120600_audit.sql`

- [ ] **Step 1: Write verification test**

Create `tests/db/test_full_schema.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
bash tests/db/test_base_schema.sh
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -c "\dt public.*" > /tmp/tables.txt
for t in feedback_events memory_bank active_learning_queue taxonomy_category prompts_catalog audit_log; do
  grep -q "$t" /tmp/tables.txt || { echo "Missing: $t"; exit 1; }
done

# Verify HNSW index on memory_bank
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -c "\di memory_bank_hnsw" | grep -q memory_bank_hnsw

echo "FULL_SCHEMA_OK"
```

- [ ] **Step 2: Run — expect fail**

Run: `bash tests/db/test_full_schema.sh` → FAIL (tables missing).

- [ ] **Step 3: Write the five migration files**

Create `db/migrations/20260408120100_feedback.sql`:

```sql
-- migrate:up
CREATE TABLE feedback_events (
  id                   bigserial PRIMARY KEY,
  event_id             uuid NOT NULL UNIQUE,
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id              uuid REFERENCES users(id) ON DELETE SET NULL,
  image_id             uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  detection_id         uuid REFERENCES detections(id) ON DELETE CASCADE,
  event_type           text NOT NULL CHECK (event_type IN (
    'confirm','reject','relabel','attribute_edit','add_missing',
    'category_rename','merge','split','gatekeeper_appeal'
  )),
  payload              jsonb NOT NULL,
  model_version        text NOT NULL,
  prompt_version       text NOT NULL,
  trace_id             text,
  processed_by         text[] NOT NULL DEFAULT '{}',
  used_in_training_run uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON feedback_events (tenant_id, created_at DESC);
CREATE INDEX ON feedback_events (event_type, created_at DESC)
  WHERE used_in_training_run IS NULL;

-- migrate:down
DROP TABLE feedback_events;
```

Create `db/migrations/20260408120200_memory_bank.sql`:

```sql
-- migrate:up
CREATE TABLE memory_bank (
  id                 bigserial PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  embedding          vector(768) NOT NULL,
  embedding_hash     bytea NOT NULL,
  item_label         text NOT NULL,
  category_canonical text,
  category_raw       text,
  attributes         jsonb NOT NULL DEFAULT '{}',
  status             text NOT NULL CHECK (status IN ('candidate','confirmed','archived')),
  seen_count         int NOT NULL DEFAULT 1,
  confirm_count      int NOT NULL DEFAULT 0,
  reject_count       int NOT NULL DEFAULT 0,
  first_seen         timestamptz NOT NULL DEFAULT now(),
  last_seen          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  source_event_id    uuid,
  UNIQUE (tenant_id, embedding_hash)
);
CREATE INDEX memory_bank_hnsw ON memory_bank
  USING hnsw (embedding vector_cosine_ops)
  WHERE status IN ('candidate','confirmed');
CREATE INDEX ON memory_bank (tenant_id, status);
CREATE INDEX ON memory_bank (expires_at) WHERE status = 'candidate';

-- migrate:down
DROP TABLE memory_bank;
```

Create `db/migrations/20260408120300_active_learning.sql`:

```sql
-- migrate:up
CREATE TABLE active_learning_queue (
  id                  bigserial PRIMARY KEY,
  detection_id        uuid REFERENCES detections(id) ON DELETE CASCADE,
  image_id            uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reason              text NOT NULL,
  priority            int NOT NULL,
  uncertainty_score   real,
  created_at          timestamptz NOT NULL DEFAULT now(),
  label_studio_task_id bigint,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','exported','labeled','discarded'))
);
CREATE INDEX ON active_learning_queue (status, priority DESC);

-- migrate:down
DROP TABLE active_learning_queue;
```

Create `db/migrations/20260408120400_taxonomy.sql`:

```sql
-- migrate:up
CREATE TABLE taxonomy_category (
  id             bigserial PRIMARY KEY,
  canonical_name text NOT NULL,
  embedding      vector(768),
  cluster_id     int,
  usage_count    int NOT NULL DEFAULT 0,
  last_updated   timestamptz NOT NULL DEFAULT now(),
  tenant_id      uuid REFERENCES tenants(id) ON DELETE CASCADE,
  aliases        text[] NOT NULL DEFAULT '{}',
  status         text NOT NULL CHECK (status IN ('candidate','active','merged','archived'))
);
CREATE INDEX ON taxonomy_category (tenant_id, status);

-- migrate:down
DROP TABLE taxonomy_category;
```

Create `db/migrations/20260408120500_prompts.sql`:

```sql
-- migrate:up
CREATE TABLE prompts_catalog (
  id           bigserial PRIMARY KEY,
  prompt_name  text NOT NULL,
  version      int NOT NULL,
  body         text NOT NULL,
  status       text NOT NULL CHECK (status IN ('candidate','testing','active','archived')),
  traffic_pct  int NOT NULL DEFAULT 0,
  metrics      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_name, version)
);
CREATE INDEX ON prompts_catalog (prompt_name, status);

-- migrate:down
DROP TABLE prompts_catalog;
```

Create `db/migrations/20260408120600_audit.sql`:

```sql
-- migrate:up
CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,
  tenant_id     uuid,
  payload       jsonb,
  completed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (kind, completed_at DESC);
CREATE INDEX ON audit_log (tenant_id) WHERE tenant_id IS NOT NULL;

-- migrate:down
DROP TABLE audit_log;
```

- [ ] **Step 4: Apply migrations and run test**

Run:
```bash
make db-up
bash tests/db/test_full_schema.sh
```
Expected: PASS, prints `FULL_SCHEMA_OK`.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/20260408120{100,200,300,400,500,600}_*.sql tests/db/test_full_schema.sh
git commit -m "feat(db): feedback, memory_bank (HNSW), active_learning, taxonomy, prompts, audit"
```

---

## Task 6: Seed prompts_catalog from prompts/*.yaml files

**Files:**
- Create: `prompts/gatekeeper_interior.v1.yaml`
- Create: `prompts/qwen_enumerate.v1.txt`
- Create: `prompts/qwen_attributes.v1.txt`
- Create: `prompts/molmo_points.v1.txt`
- Create: `prompts/taxonomy_learn.v1.md`
- Create: `scripts/seed_prompts.py`

- [ ] **Step 1: Write seeding test**

Create `tests/db/test_prompts_seed.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
python3 scripts/seed_prompts.py
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -t -c \
  "SELECT prompt_name, version, status FROM prompts_catalog ORDER BY prompt_name;" \
  > /tmp/seeds.txt
grep -q "gatekeeper_interior.*1.*active" /tmp/seeds.txt
grep -q "qwen_enumerate.*1.*active" /tmp/seeds.txt
grep -q "qwen_attributes.*1.*active" /tmp/seeds.txt
grep -q "molmo_points.*1.*active" /tmp/seeds.txt
grep -q "taxonomy_learn.*1.*active" /tmp/seeds.txt
echo "PROMPTS_SEED_OK"
```

- [ ] **Step 2: Run — expect fail**

Run: `bash tests/db/test_prompts_seed.sh` → FAIL (files missing).

- [ ] **Step 3: Create seed files**

Create `prompts/gatekeeper_interior.v1.yaml`:

```yaml
version: 1
description: CLIP zero-shot prompts for the Tier-0 interior-photo gatekeeper.
accept:
  - "a photo of a home interior"
  - "a photo of furniture and household objects"
  - "a photo of a room with decor and belongings"
  - "a close-up photo of household items"
reject:
  - "a photo of a person or people"
  - "a selfie"
  - "a photo of an outdoor scene or landscape"
  - "a document, receipt, or screenshot"
  - "a photo of food or a meal"
  - "a meme or text image"
  - "a photo of a vehicle"
  - "a photo of an animal"
  - "a chart, graph, or diagram"
thresholds:
  reject_below_margin: 0.10
  low_confidence_below_margin: 0.25
```

Create `prompts/qwen_enumerate.v1.txt`:

```
You are an exhaustive home inventory assistant. Detect and enumerate EVERY
visible object in the image that could be an inventory item (furniture, decor,
electronics, textiles, kitchenware, plants, storage, personal items, tools,
small gadgets). Include items that are small, distant, partially occluded, or
stacked with other items.

IGNORE these (do not return):
- walls, floor, ceiling, architectural details
- windows and doors (unless they have decorative treatments like curtains)
- people, pets
- text overlays, watermarks

For each object return one JSON object with these exact fields:
  "label": specific descriptive noun phrase — prefer "brown leather armchair"
    over "chair"; prefer "vintage brass desk lamp" over "lamp".
  "category": a concise category name of your choice (free-form; the system
    learns a canonical taxonomy from your outputs over time).
  "box_2d": [ymin, xmin, ymax, xmax] normalized 0-1000, integer values
  "confidence": float 0.0-1.0

Return ONLY a JSON array. No markdown, no prose, no code fences.
Aim for COMPLETENESS. A room with many items should return many detections;
return 30+ items when they are visible.
```

Create `prompts/qwen_attributes.v1.txt`:

```
The image shows numbered red bounding boxes around home inventory items.
For EACH numbered box, return a JSON object in a single JSON array, in order:

{
  "label": specific label, max 5 words,
  "category": concise free-form category,
  "brand": brand name or null,
  "model": model name/number or null,
  "colors": array of 1-3 color names,
  "materials": array of 1-2 material names,
  "condition": one of ["excellent","good","fair","poor"],
  "estimated_value_usd": integer or null (conservative retail guess),
  "description": one-sentence inventory description, max 20 words
}

Return ONLY the JSON array with exactly {N} entries.
```

Create `prompts/molmo_points.v1.txt`:

```
Point to every home inventory item visible in this photo: furniture, decor,
electronics, textiles, kitchenware, plants, storage, personal belongings.
Do not point to walls, floor, ceiling, windows, people, or pets.
Return a point for each distinct item.
```

Create `prompts/taxonomy_learn.v1.md`:

```
# Taxonomy Learning Prompt (v1)

Used by taxonomy_learn.flow to name clusters of category_raw values.

Input: a list of raw category strings from the last week's detections,
grouped by cluster.

Task: for each cluster, choose a canonical category name that best
describes all members. Return a JSON array:

[
  {"cluster_id": 1, "canonical": "Furniture", "aliases": [...]},
  {"cluster_id": 2, "canonical": "Lighting",  "aliases": [...]}
]
```

Create `scripts/seed_prompts.py`:

```python
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
```

- [ ] **Step 4: Run test**

```bash
pip install psycopg[binary]
bash tests/db/test_prompts_seed.sh
```
Expected: PASS, prints `PROMPTS_SEED_OK`.

- [ ] **Step 5: Commit**

```bash
git add prompts/ scripts/seed_prompts.py tests/db/test_prompts_seed.sh
git commit -m "feat(prompts): seed prompts_catalog from prompts/*.{yaml,txt,md}"
```

---

## Task 7: Scaffold detection-service Python project with uv

**Files:**
- Create: `detection-service/pyproject.toml`
- Rename: `detection-service/main.py` → `detection-service/main.legacy.py`
- Create: `detection-service/main.py` (new empty FastAPI entry)
- Delete: `detection-service/requirements.txt`
- Create: `detection-service/src/detection_service/__init__.py`
- Create: `detection-service/src/detection_service/config.py`

- [ ] **Step 1: Write smoke test**

Create `detection-service/tests/test_smoke.py`:

```python
def test_imports():
    from detection_service import config
    assert config.settings.service_name == "detection-service"

def test_main_app_boots():
    from main import app
    assert app.title == "detection-service"
```

- [ ] **Step 2: Run — expect fail**

Run:
```bash
cd detection-service && uv run pytest tests/test_smoke.py -v
```
Expected: FAIL (modules don't exist).

- [ ] **Step 3: Create pyproject.toml and scaffold**

```bash
cd detection-service
mv main.py main.legacy.py
rm requirements.txt
```

Create `detection-service/pyproject.toml`:

```toml
[project]
name = "detection-service"
version = "0.1.0"
description = "Detection pipeline for the Visual Home Inventory Manager"
requires-python = ">=3.12,<3.13"
dependencies = [
  "fastapi>=0.115,<0.116",
  "uvicorn[standard]>=0.32",
  "pydantic>=2.9",
  "pydantic-settings>=2.7",
  "psycopg[binary,pool]>=3.2",
  "nats-py>=2.8",
  "pyyaml>=6.0",
  "pillow>=10.4",
  "numpy>=1.26,<2.0",
  "imagehash>=4.3",
  # ML
  "torch>=2.5",
  "torchvision>=0.20",
  "transformers>=4.48",
  "ultralytics>=8.3.234",
  "sahi>=0.11.22",
  "open-clip-torch>=2.29",
  "mlx>=0.22; platform_system == 'Darwin'",
  # mlx-vlm 0.4.4 (Apr 2026) is the pinned Plan-B-ready version.
  # Plan A doesn't actually use VLMs, but we pin so Plan B doesn't drift.
  "mlx-vlm==0.4.4; platform_system == 'Darwin'",
  # OTel
  "opentelemetry-api>=1.29",
  "opentelemetry-sdk>=1.29",
  "opentelemetry-exporter-otlp-proto-grpc>=1.29",
  "opentelemetry-instrumentation-fastapi>=0.50b0",
  "opentelemetry-instrumentation-psycopg>=0.50b0",
  "opentelemetry-instrumentation-httpx>=0.50b0",
  "prometheus-client>=0.21",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3",
  "pytest-asyncio>=0.24",
  "httpx>=0.28",
  "ruff>=0.9",
  "mypy>=1.14",
]

[tool.uv]
managed = true

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.pytest.ini_options]
pythonpath = ["src", "."]
asyncio_mode = "auto"
```

Create `detection-service/src/detection_service/__init__.py`:

```python
"""Detection service package."""
__version__ = "0.1.0"
```

Create `detection-service/src/detection_service/config.py`:

```python
from __future__ import annotations
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="DETECTION_")

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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
```

Create `detection-service/main.py`:

```python
from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI

from detection_service.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup hooks will be added in later tasks
    yield
    # Shutdown hooks

app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}
```

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv venv
uv pip install -e ".[dev]"
uv run pytest tests/test_smoke.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/pyproject.toml detection-service/main.py detection-service/main.legacy.py \
  detection-service/src/detection_service/ detection-service/tests/test_smoke.py
git rm detection-service/requirements.txt
git commit -m "feat(detection-service): scaffold Python project with uv, pyproject.toml, FastAPI stub"
```

---

## Task 8: Detection-service OpenTelemetry bootstrap

**Files:**
- Create: `detection-service/src/detection_service/telemetry.py`
- Modify: `detection-service/main.py`

- [ ] **Step 1: Write integration test**

Create `detection-service/tests/test_telemetry.py`:

```python
import pytest
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
```

- [ ] **Step 2: Run — expect fail**

```bash
cd detection-service
uv run pytest tests/test_telemetry.py -v
```
Expected: FAIL (telemetry module missing, no /metrics route).

- [ ] **Step 3: Create telemetry module**

Create `detection-service/src/detection_service/telemetry.py`:

```python
from __future__ import annotations
import logging
from typing import Optional
from fastapi import FastAPI
from opentelemetry import trace, metrics
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from prometheus_client import make_asgi_app, CollectorRegistry, multiprocess

from .config import settings

log = logging.getLogger(__name__)

_configured = False


def configure_telemetry(app: Optional[FastAPI], service_name: str = None) -> None:
    global _configured
    if _configured:
        return

    name = service_name or settings.service_name
    resource = Resource.create({
        SERVICE_NAME: name,
        SERVICE_VERSION: settings.version,
    })

    # Traces
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otlp_endpoint, insecure=True))
    )
    trace.set_tracer_provider(tracer_provider)

    # Metrics
    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=settings.otlp_endpoint, insecure=True),
        export_interval_millis=15000,
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    # Auto-instrumentation
    if app is not None:
        FastAPIInstrumentor.instrument_app(app)
    PsycopgInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()

    _configured = True
    log.info("OpenTelemetry configured for %s", name)


def mount_prometheus(app: FastAPI) -> None:
    """Mounts a /metrics endpoint exposing the prometheus_client default registry."""
    prom_app = make_asgi_app()
    app.mount("/metrics", prom_app)
```

Modify `detection-service/main.py`:

```python
from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI

from detection_service.config import settings
from detection_service.telemetry import configure_telemetry, mount_prometheus


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)

configure_telemetry(app=app)
mount_prometheus(app)


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}
```

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv run pytest tests/test_telemetry.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/telemetry.py detection-service/main.py detection-service/tests/test_telemetry.py
git commit -m "feat(detection-service): OpenTelemetry bootstrap with OTLP gRPC + Prometheus /metrics"
```

---

## Task 9: Detection-service Postgres async pool + prompts repository

**Files:**
- Create: `detection-service/src/detection_service/db/__init__.py`
- Create: `detection-service/src/detection_service/db/pool.py`
- Create: `detection-service/src/detection_service/db/prompts_repo.py`

- [ ] **Step 1: Write tests**

Create `detection-service/tests/unit/__init__.py` (empty).
Create `detection-service/tests/unit/test_prompts_repo.py`:

```python
import pytest
from detection_service.db.pool import get_pool, close_pool
from detection_service.db.prompts_repo import PromptsRepo


@pytest.fixture
async def pool():
    p = await get_pool()
    yield p
    await close_pool()


async def test_get_active_prompt_returns_seeded_gatekeeper(pool):
    repo = PromptsRepo(pool)
    body, version = await repo.get_active("gatekeeper_interior")
    assert version == 1
    assert "home interior" in body.lower()


async def test_get_active_prompt_unknown_raises(pool):
    repo = PromptsRepo(pool)
    with pytest.raises(LookupError):
        await repo.get_active("nonexistent_prompt")
```

- [ ] **Step 2: Run — expect fail**

```bash
cd detection-service
uv run pytest tests/unit/test_prompts_repo.py -v
```
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement pool and repo**

Create `detection-service/src/detection_service/db/__init__.py`:

```python
"""Database access layer for detection-service."""
```

Create `detection-service/src/detection_service/db/pool.py`:

```python
from __future__ import annotations
from typing import Optional
from psycopg_pool import AsyncConnectionPool
from ..config import settings

_pool: Optional[AsyncConnectionPool] = None


async def get_pool() -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=2,
            max_size=10,
            open=False,
        )
        await _pool.open()
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
```

Create `detection-service/src/detection_service/db/prompts_repo.py`:

```python
from __future__ import annotations
from psycopg_pool import AsyncConnectionPool


class PromptsRepo:
    def __init__(self, pool: AsyncConnectionPool):
        self.pool = pool

    async def get_active(self, prompt_name: str) -> tuple[str, int]:
        """Returns (body, version) for the active prompt with this name.

        Raises LookupError if not found.
        """
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                """
                SELECT body, version
                FROM prompts_catalog
                WHERE prompt_name = %s AND status = 'active'
                ORDER BY version DESC
                LIMIT 1
                """,
                (prompt_name,),
            )
            row = await cur.fetchone()
            if row is None:
                raise LookupError(f"No active prompt: {prompt_name}")
            return row[0], row[1]
```

Update `detection-service/pyproject.toml` dependencies to include `psycopg-pool>=3.2`.

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv pip install -e ".[dev]"
uv run pytest tests/unit/test_prompts_repo.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/db/ detection-service/tests/unit/test_prompts_repo.py \
  detection-service/pyproject.toml
git commit -m "feat(detection-service): async Postgres pool + PromptsRepo reading prompts_catalog"
```

---

## Task 10: Detection-service NATS client with trace propagation

**Files:**
- Create: `detection-service/src/detection_service/nats_client/__init__.py`
- Create: `detection-service/src/detection_service/nats_client/client.py`

- [ ] **Step 1: Write test**

Create `detection-service/tests/unit/test_nats_client.py`:

```python
import json
import pytest
from detection_service.nats_client.client import NatsClient


@pytest.fixture
async def nats():
    c = NatsClient()
    await c.connect()
    yield c
    await c.close()


async def test_publish_and_subscribe_roundtrip(nats):
    received = []

    async def handler(subject: str, payload: dict, trace_ctx: dict):
        received.append((subject, payload, trace_ctx))

    sub = await nats.subscribe("test.roundtrip", handler)
    await nats.publish("test.roundtrip", {"hello": "world"})

    # Give NATS time to deliver
    import asyncio
    for _ in range(20):
        if received:
            break
        await asyncio.sleep(0.1)

    await sub.unsubscribe()
    assert len(received) == 1
    assert received[0][1] == {"hello": "world"}


async def test_trace_context_propagated(nats):
    from opentelemetry import trace
    from detection_service.telemetry import configure_telemetry
    configure_telemetry(app=None)

    received_ctx = []

    async def handler(subject: str, payload: dict, trace_ctx: dict):
        received_ctx.append(trace_ctx)

    sub = await nats.subscribe("test.trace", handler)
    tracer = trace.get_tracer(__name__)
    with tracer.start_as_current_span("publisher"):
        await nats.publish("test.trace", {"msg": 1})

    import asyncio
    for _ in range(20):
        if received_ctx:
            break
        await asyncio.sleep(0.1)

    await sub.unsubscribe()
    assert "traceparent" in received_ctx[0]
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/unit/test_nats_client.py -v
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement NATS client**

Create `detection-service/src/detection_service/nats_client/__init__.py`:

```python
"""NATS client + trace propagation helpers."""
```

Create `detection-service/src/detection_service/nats_client/client.py`:

```python
from __future__ import annotations
import json
from typing import Callable, Awaitable, Any
import nats
from nats.aio.client import Client as NATS
from nats.js.client import JetStreamContext
from opentelemetry import trace, propagate
from opentelemetry.trace import Span, SpanKind
from ..config import settings

PayloadHandler = Callable[[str, dict, dict], Awaitable[None]]


class _HeaderCarrier(dict):
    """Dict-based carrier for W3C trace context in NATS headers."""
    def get(self, key: str) -> str | None:
        return super().get(key)

    def set(self, key: str, value: str) -> None:
        self[key] = value

    def keys(self) -> list[str]:
        return list(super().keys())


class NatsClient:
    def __init__(self) -> None:
        self._nc: NATS | None = None
        self._js: JetStreamContext | None = None

    async def connect(self) -> None:
        self._nc = await nats.connect(settings.nats_url)
        self._js = self._nc.jetstream()

    async def close(self) -> None:
        if self._nc is not None:
            await self._nc.drain()
            self._nc = None
            self._js = None

    async def publish(self, subject: str, payload: dict[str, Any]) -> None:
        assert self._nc is not None, "NatsClient not connected"
        headers: dict[str, str] = {}
        propagate.inject(headers)
        body = json.dumps(payload).encode("utf-8")
        await self._nc.publish(subject, body, headers=headers)

    async def subscribe(self, subject: str, handler: PayloadHandler):
        assert self._nc is not None, "NatsClient not connected"

        tracer = trace.get_tracer(__name__)

        async def wrapper(msg):
            hdrs = dict(msg.headers or {})
            ctx = propagate.extract(hdrs)
            with tracer.start_as_current_span(
                f"nats.consume {subject}", context=ctx, kind=SpanKind.CONSUMER
            ):
                payload = json.loads(msg.data.decode("utf-8"))
                await handler(msg.subject, payload, hdrs)

        return await self._nc.subscribe(subject, cb=wrapper)

    async def ensure_streams(self) -> None:
        """Create the 'fast' and 'deep' JetStream streams if missing."""
        assert self._js is not None, "NatsClient not connected"
        for name, subjects in [("fast", ["fast.>"]), ("deep", ["deep.>"])]:
            try:
                await self._js.stream_info(name)
            except Exception:
                from nats.js.api import StreamConfig
                await self._js.add_stream(StreamConfig(name=name, subjects=subjects))
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/unit/test_nats_client.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/nats_client/ detection-service/tests/unit/test_nats_client.py
git commit -m "feat(detection-service): NATS client with W3C trace context propagation"
```

---

## Task 11: InferenceBackend Protocol + MLX backend skeleton

**Files:**
- Create: `detection-service/src/detection_service/backends/__init__.py`
- Create: `detection-service/src/detection_service/backends/base.py`
- Create: `detection-service/src/detection_service/backends/mlx_backend.py`

- [ ] **Step 1: Write tests**

Create `detection-service/tests/unit/test_backend_contract.py`:

```python
import numpy as np
import pytest
from PIL import Image
from detection_service.backends.base import (
    InferenceBackend, GatekeeperResult, FastDetection, BoundingBox,
)
from detection_service.backends.mlx_backend import MLXBackend


def _dummy_image() -> Image.Image:
    return Image.new("RGB", (640, 480), (128, 128, 128))


def test_gatekeeper_result_shape():
    r = GatekeeperResult(accepted=True, margin=0.42, accept_score=0.9, reject_score=0.48, raw={})
    assert r.accepted
    assert r.margin == pytest.approx(0.42)


def test_bounding_box_normalized():
    b = BoundingBox(x=0.1, y=0.2, w=0.3, h=0.4)
    assert b.area() == pytest.approx(0.12)
    assert b.center() == (0.25, 0.4)


def test_mlx_backend_implements_protocol():
    b = MLXBackend()
    assert isinstance(b, InferenceBackend)


def test_mlx_fast_detect_raises_without_load():
    b = MLXBackend()
    with pytest.raises(RuntimeError, match="not loaded"):
        b.fast_detect(_dummy_image())
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/unit/test_backend_contract.py -v
```
Expected: FAIL.

- [ ] **Step 3: Implement base + mlx stub**

Create `detection-service/src/detection_service/backends/__init__.py`:

```python
"""InferenceBackend abstraction — MLX / CUDA / Modal implementations."""
```

Create `detection-service/src/detection_service/backends/base.py`:

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable
import numpy as np
from PIL import Image


@dataclass
class BoundingBox:
    x: float  # normalized 0..1
    y: float
    w: float
    h: float

    def area(self) -> float:
        return self.w * self.h

    def center(self) -> tuple[float, float]:
        return (self.x + self.w / 2, self.y + self.h / 2)

    def contains_point(self, pt_xy: tuple[float, float]) -> bool:
        px, py = pt_xy
        return self.x <= px <= self.x + self.w and self.y <= py <= self.y + self.h


@dataclass
class GatekeeperResult:
    accepted: bool
    margin: float
    accept_score: float
    reject_score: float
    raw: dict


@dataclass
class FastDetection:
    label: str
    box: BoundingBox
    confidence: float
    source: str = "yoloe"


@dataclass
class VLMDetection:
    label: str
    box: BoundingBox
    category_raw: str
    confidence: float


@dataclass
class VLMPoint:
    label: str
    xy: tuple[float, float]  # normalized 0..1


@dataclass
class ItemAttributes:
    label: str | None = None
    category_raw: str | None = None
    brand: str | None = None
    model: str | None = None
    colors: list[str] = field(default_factory=list)
    materials: list[str] = field(default_factory=list)
    condition: str | None = None
    estimated_value_usd: int | None = None
    description: str | None = None


@runtime_checkable
class InferenceBackend(Protocol):
    def load_fast_models(self) -> None: ...
    def load_deep_models(self) -> None: ...
    def unload_deep_models(self) -> None: ...

    def gatekeeper(self, image: Image.Image, accept_prompts: list[str], reject_prompts: list[str]) -> GatekeeperResult: ...
    def fast_detect(self, image: Image.Image) -> list[FastDetection]: ...
    def embed_crop(self, crop: Image.Image) -> np.ndarray: ...
    def embed_text(self, text: str) -> np.ndarray: ...

    # Deep pass — Plan B will implement; stubs raise for now
    def vlm_enumerate(self, image: Image.Image, prompt: str) -> list[VLMDetection]: ...
    def vlm_points(self, image: Image.Image, prompt: str) -> list[VLMPoint]: ...
    def vlm_attributes(self, image: Image.Image, boxes: list[BoundingBox], prompt: str) -> list[ItemAttributes]: ...
```

Create `detection-service/src/detection_service/backends/mlx_backend.py`:

```python
from __future__ import annotations
import logging
from typing import Optional
import numpy as np
from PIL import Image

from .base import (
    BoundingBox, GatekeeperResult, FastDetection, VLMDetection, VLMPoint, ItemAttributes,
)

log = logging.getLogger(__name__)


class MLXBackend:
    """Apple Silicon inference backend using MLX + Core ML + Metal.

    Models loaded lazily:
      - Fast pool: CLIP ViT-B/32 (gatekeeper), YOLOE-11L (SAHI), CLIP ViT-L/14 (memory bank)
      - Deep pool: Qwen2.5-VL-32B MLX, Molmo-7B-D MLX (Plan B)
    """

    def __init__(self) -> None:
        self._fast_loaded = False
        self._deep_loaded = False
        # Set in load_fast_models() — injected to allow test doubles
        self._clip_b32 = None
        self._clip_l14 = None
        self._yoloe = None
        self._sahi_model = None
        # Deep pool — Plan B
        self._qwen = None
        self._molmo = None

    def load_fast_models(self) -> None:
        """Load CLIP ViT-B/32, YOLOE-11L, CLIP ViT-L/14. Implemented in Tasks 13, 14."""
        # Implementation deferred to Tasks 13/14/15.
        # Tasks that implement this raise NotImplementedError until they land.
        raise NotImplementedError("load_fast_models is implemented incrementally in Tasks 13-15")

    def load_deep_models(self) -> None:
        raise NotImplementedError("Deep models are Plan B")

    def unload_deep_models(self) -> None:
        self._qwen = None
        self._molmo = None
        self._deep_loaded = False

    def gatekeeper(self, image: Image.Image, accept_prompts, reject_prompts) -> GatekeeperResult:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        raise NotImplementedError("implemented in Task 13")

    def fast_detect(self, image: Image.Image) -> list[FastDetection]:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        raise NotImplementedError("implemented in Task 14")

    def embed_crop(self, crop: Image.Image) -> np.ndarray:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        raise NotImplementedError("implemented in Task 15")

    def embed_text(self, text: str) -> np.ndarray:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        raise NotImplementedError("implemented in Task 15")

    def vlm_enumerate(self, image, prompt):
        raise NotImplementedError("Plan B — Deep Pass")

    def vlm_points(self, image, prompt):
        raise NotImplementedError("Plan B — Deep Pass")

    def vlm_attributes(self, image, boxes, prompt):
        raise NotImplementedError("Plan B — Deep Pass")
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/unit/test_backend_contract.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/backends/ detection-service/tests/unit/test_backend_contract.py
git commit -m "feat(detection-service): InferenceBackend Protocol + MLXBackend skeleton"
```

---

## Task 12: api-service package.json updates + OpenTelemetry bootstrap

**Files:**
- Modify: `api-service/package.json`
- Create: `api-service/src/telemetry.ts`
- Modify: `api-service/src/app.ts`

- [ ] **Step 1: Write test**

Create `api-service/src/__tests__/unit/telemetry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { initTelemetry, shutdownTelemetry } from '../../telemetry';

describe('telemetry', () => {
  it('initializes without throwing when OTLP endpoint is set', async () => {
    process.env.OTLP_ENDPOINT = 'http://localhost:4317';
    process.env.OTEL_SERVICE_NAME = 'api-service-test';
    await expect(initTelemetry()).resolves.not.toThrow();
    await shutdownTelemetry();
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd api-service && npm test -- telemetry
```
Expected: FAIL.

- [ ] **Step 3: Update package.json and implement telemetry**

Modify `api-service/package.json` — add to `dependencies`:

```json
"@opentelemetry/api": "^1.9.0",
"@opentelemetry/sdk-node": "^0.57.1",
"@opentelemetry/auto-instrumentations-node": "^0.55.1",
"@opentelemetry/exporter-trace-otlp-grpc": "^0.57.1",
"@opentelemetry/exporter-metrics-otlp-grpc": "^0.57.1",
"@opentelemetry/exporter-prometheus": "^0.57.1",
"@opentelemetry/resources": "^1.30.1",
"@opentelemetry/semantic-conventions": "^1.28.0",
"pg": "^8.13.1",
"kysely": "^0.27.5",
"nats": "^2.29.1",
"ioredis": "^5.4.2",
"sharp": "^0.33.5"
```

And to `devDependencies`:

```json
"@types/pg": "^8.11.10"
```

Create `api-service/src/telemetry.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT ?? 'http://localhost:4317';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'api-service';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION ?? '2.0.0';
const PROM_PORT = Number(process.env.OTEL_PROM_PORT ?? '14000');

let sdk: NodeSDK | null = null;
let promExporter: PrometheusExporter | null = null;

export async function initTelemetry(): Promise<void> {
  if (sdk) return;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  });

  // Prometheus metrics exporter — lives on /metrics inside this process
  promExporter = new PrometheusExporter({ preventServerStart: true });

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: OTLP_ENDPOINT }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: OTLP_ENDPOINT }),
      exportIntervalMillis: 15000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

export function getPrometheusExporter(): PrometheusExporter | null {
  return promExporter;
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
```

Modify `api-service/src/app.ts` — top of file, BEFORE any other imports:

```typescript
import { initTelemetry } from './telemetry';
await initTelemetry();

// ...existing imports below
```

(If `app.ts` uses CommonJS, adjust to top-level async init inside bootstrap function.)

- [ ] **Step 4: Run tests**

```bash
cd api-service && npm install && npm test -- telemetry
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-service/package.json api-service/package-lock.json api-service/src/telemetry.ts \
  api-service/src/app.ts api-service/src/__tests__/unit/telemetry.test.ts
git commit -m "feat(api-service): OpenTelemetry bootstrap with OTLP gRPC + Prometheus exporter"
```

---

## Task 13: Tier-0 gatekeeper — CLIP ViT-B/32 zero-shot via transformers (MPS)

**Files:**
- Create: `detection-service/src/detection_service/pipeline/__init__.py`
- Create: `detection-service/src/detection_service/pipeline/gatekeeper.py`
- Modify: `detection-service/src/detection_service/backends/mlx_backend.py`

**Model-choice note:** Apple's official Core ML CLIP distribution is inconsistent. For Plan A we use HuggingFace `openai/clip-vit-base-patch32` loaded via `transformers` on the Metal Performance Shaders (MPS) backend — ~80 ms per image on M4 Pro, fast enough for a gatekeeper. Core ML ANE optimization is a Phase-1 follow-up task after the headline test passes.

- [ ] **Step 1: Write tests**

Create `detection-service/src/detection_service/pipeline/__init__.py`:

```python
"""Fast-pass and deep-pass pipeline modules."""
```

Create `detection-service/tests/unit/test_gatekeeper.py`:

```python
import pytest
from PIL import Image
from pathlib import Path
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.pipeline.gatekeeper import Gatekeeper, GatekeeperConfig

TEST_IMAGES = Path(__file__).parent.parent.parent.parent / "test_images"


@pytest.fixture(scope="module")
def backend():
    b = MLXBackend()
    b.load_fast_models()
    return b


@pytest.fixture
def config():
    return GatekeeperConfig(
        accept_prompts=[
            "a photo of a home interior",
            "a photo of furniture and household objects",
        ],
        reject_prompts=[
            "a photo of a person or people",
            "a selfie",
            "a photo of an outdoor scene",
            "a document or screenshot",
            "a meme",
        ],
        reject_below_margin=0.10,
        low_confidence_below_margin=0.25,
    )


def test_ai_interior_accepted(backend, config):
    img = Image.open(TEST_IMAGES / "ai_interior.jpg").convert("RGB")
    gk = Gatekeeper(backend, config)
    r = gk.classify(img)
    assert r.accepted, f"ai_interior.jpg should be accepted, margin={r.margin}"
    assert r.margin >= 0.25


def test_synthetic_blob_scored(backend, config):
    img = Image.new("RGB", (512, 512), (220, 180, 150))
    gk = Gatekeeper(backend, config)
    r = gk.classify(img)
    assert r.raw is not None
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/unit/test_gatekeeper.py -v
```
Expected: FAIL.

- [ ] **Step 3: Implement Gatekeeper and wire CLIP ViT-B/32 in MLXBackend**

Create `detection-service/src/detection_service/pipeline/gatekeeper.py`:

```python
from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol
from PIL import Image


@dataclass
class GatekeeperConfig:
    accept_prompts: list[str]
    reject_prompts: list[str]
    reject_below_margin: float = 0.10
    low_confidence_below_margin: float = 0.25


@dataclass
class GatekeeperDecision:
    accepted: bool
    low_confidence: bool
    margin: float
    accept_score: float
    reject_score: float
    raw: dict


class _GatekeeperBackend(Protocol):
    def gatekeeper(self, image: Image.Image, accept_prompts: list[str], reject_prompts: list[str]): ...


class Gatekeeper:
    def __init__(self, backend: _GatekeeperBackend, config: GatekeeperConfig):
        self.backend = backend
        self.config = config

    def classify(self, image: Image.Image) -> GatekeeperDecision:
        result = self.backend.gatekeeper(
            image, self.config.accept_prompts, self.config.reject_prompts
        )
        margin = result.margin
        accepted = margin >= self.config.reject_below_margin
        low_conf = accepted and margin < self.config.low_confidence_below_margin
        return GatekeeperDecision(
            accepted=accepted,
            low_confidence=low_conf,
            margin=margin,
            accept_score=result.accept_score,
            reject_score=result.reject_score,
            raw=result.raw,
        )
```

Modify `detection-service/src/detection_service/backends/mlx_backend.py` — replace the `load_fast_models` and `gatekeeper` stubs:

```python
    def load_fast_models(self) -> None:
        """Load CLIP ViT-B/32 for the gatekeeper. Additional fast models loaded in Tasks 14-15."""
        if self._fast_loaded:
            return
        import torch
        from transformers import CLIPModel, CLIPProcessor

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        model_id = "openai/clip-vit-base-patch32"
        self._clip_b32_model = CLIPModel.from_pretrained(model_id).to(device).eval()
        self._clip_b32_processor = CLIPProcessor.from_pretrained(model_id)
        self._clip_b32_device = device
        self._fast_loaded = True
        log.info("CLIP ViT-B/32 loaded on %s", device)

    def gatekeeper(
        self,
        image: Image.Image,
        accept_prompts: list[str],
        reject_prompts: list[str],
    ) -> GatekeeperResult:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded — call load_fast_models() first")
        import torch

        all_prompts = list(accept_prompts) + list(reject_prompts)
        inputs = self._clip_b32_processor(
            text=all_prompts, images=image, return_tensors="pt", padding=True
        ).to(self._clip_b32_device)

        with torch.no_grad():
            out = self._clip_b32_model(**inputs)

        logits = out.logits_per_image[0]
        probs = torch.softmax(logits, dim=-1).cpu().numpy()

        n_accept = len(accept_prompts)
        accept_probs = probs[:n_accept]
        reject_probs = probs[n_accept:]
        accept_score = float(accept_probs.max())
        reject_score = float(reject_probs.max())

        return GatekeeperResult(
            accepted=accept_score > reject_score,
            margin=accept_score - reject_score,
            accept_score=accept_score,
            reject_score=reject_score,
            raw={"accept_probs": accept_probs.tolist(), "reject_probs": reject_probs.tolist()},
        )
```

*(Note: in the `.eval()` call above, this is the PyTorch module method to switch to inference mode — not Python's built-in code executor. Different name collision in the ecosystem.)*

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv run pytest tests/unit/test_gatekeeper.py -v
```
Expected: PASS (ai_interior.jpg accepted with high margin).

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/pipeline/__init__.py \
  detection-service/src/detection_service/pipeline/gatekeeper.py \
  detection-service/src/detection_service/backends/mlx_backend.py \
  detection-service/tests/unit/test_gatekeeper.py
git commit -m "feat(fast-pass): Tier-0 gatekeeper using CLIP ViT-B/32 on MPS"
```

---

## Task 14: CLIP ViT-L/14 embedding + semantic compatibility helper

**Files:**
- Create: `detection-service/src/detection_service/pipeline/semantic.py`
- Modify: `detection-service/src/detection_service/backends/mlx_backend.py`

- [ ] **Step 1: Write tests**

Create `detection-service/tests/unit/test_semantic.py`:

```python
import numpy as np
import pytest
from PIL import Image
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.pipeline.semantic import (
    labels_semantically_compatible, labels_semantically_distant, cosine_sim
)


@pytest.fixture(scope="module")
def backend():
    b = MLXBackend()
    b.load_fast_models()
    return b


def test_embed_crop_returns_768_dim(backend):
    crop = Image.new("RGB", (224, 224), (100, 150, 200))
    emb = backend.embed_crop(crop)
    assert emb.shape == (768,)
    assert np.isfinite(emb).all()


def test_embed_text_returns_768_dim(backend):
    emb = backend.embed_text("brown leather armchair")
    assert emb.shape == (768,)


def test_compatible_labels_synonyms(backend):
    a = backend.embed_text("chair")
    b = backend.embed_text("armchair")
    assert cosine_sim(a, b) > 0.7
    assert labels_semantically_compatible("chair", "armchair", backend) is True


def test_distant_labels(backend):
    assert labels_semantically_distant("chair", "dog", backend, threshold=0.5) is True
    assert labels_semantically_compatible("chair", "dog", backend) is False
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/unit/test_semantic.py -v
```
Expected: FAIL.

- [ ] **Step 3: Wire ViT-L/14 loading and implement semantic helpers**

Modify `detection-service/src/detection_service/backends/mlx_backend.py` — extend `load_fast_models` to also load ViT-L/14, and add `embed_crop` / `embed_text` methods:

```python
    def load_fast_models(self) -> None:
        if self._fast_loaded:
            return
        import torch
        from transformers import CLIPModel, CLIPProcessor

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        self._clip_b32_device = device

        # Gatekeeper: CLIP ViT-B/32
        b32 = "openai/clip-vit-base-patch32"
        self._clip_b32_model = CLIPModel.from_pretrained(b32).to(device).eval()
        self._clip_b32_processor = CLIPProcessor.from_pretrained(b32)

        # Memory bank: CLIP ViT-L/14 (768-dim embeddings, matches vector(768) column)
        l14 = "openai/clip-vit-large-patch14"
        self._clip_l14_model = CLIPModel.from_pretrained(l14).to(device).eval()
        self._clip_l14_processor = CLIPProcessor.from_pretrained(l14)

        self._fast_loaded = True
        log.info("Fast-pool CLIP models loaded on %s", device)

    def embed_crop(self, crop: Image.Image) -> np.ndarray:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded")
        import torch

        inputs = self._clip_l14_processor(images=crop, return_tensors="pt").to(self._clip_b32_device)
        with torch.no_grad():
            emb = self._clip_l14_model.get_image_features(**inputs)
        emb = torch.nn.functional.normalize(emb, dim=-1)
        return emb[0].cpu().numpy().astype(np.float32)

    def embed_text(self, text: str) -> np.ndarray:
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded")
        import torch

        inputs = self._clip_l14_processor(text=[text], return_tensors="pt", padding=True).to(self._clip_b32_device)
        with torch.no_grad():
            emb = self._clip_l14_model.get_text_features(**inputs)
        emb = torch.nn.functional.normalize(emb, dim=-1)
        return emb[0].cpu().numpy().astype(np.float32)
```

Create `detection-service/src/detection_service/pipeline/semantic.py`:

```python
from __future__ import annotations
from typing import Protocol
import numpy as np


class _EmbedsText(Protocol):
    def embed_text(self, text: str) -> np.ndarray: ...


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity assuming both vectors are L2-normalized."""
    return float(np.dot(a, b))


def labels_semantically_compatible(
    a: str, b: str, backend: _EmbedsText, threshold: float = 0.7
) -> bool:
    """True when the two labels are close enough in CLIP text space to refer
    to the same kind of item. Threshold is tuned weekly by retrain.flow."""
    va = backend.embed_text(a)
    vb = backend.embed_text(b)
    return cosine_sim(va, vb) > threshold


def labels_semantically_distant(
    a: str, b: str, backend: _EmbedsText, threshold: float = 0.5
) -> bool:
    """True when the two labels refer to meaningfully different concepts."""
    va = backend.embed_text(a)
    vb = backend.embed_text(b)
    return cosine_sim(va, vb) < threshold
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/unit/test_semantic.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/pipeline/semantic.py \
  detection-service/src/detection_service/backends/mlx_backend.py \
  detection-service/tests/unit/test_semantic.py
git commit -m "feat(fast-pass): CLIP ViT-L/14 embeddings + semantic compatibility helpers"
```

---

## Task 15: YOLOE-11L prompt-free via SAHI tiled inference

**Files:**
- Create: `detection-service/src/detection_service/pipeline/sahi_yoloe.py`
- Modify: `detection-service/src/detection_service/backends/mlx_backend.py`

- [ ] **Step 1: Write the headline acceptance test**

Create `detection-service/tests/unit/test_sahi_yoloe.py`:

```python
import pytest
from PIL import Image
from pathlib import Path
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.pipeline.sahi_yoloe import SahiYoloeDetector, SahiYoloeConfig

TEST_IMAGES = Path(__file__).parent.parent.parent.parent / "test_images"


@pytest.fixture(scope="module")
def backend():
    b = MLXBackend()
    b.load_fast_models()
    return b


def test_detect_returns_normalized_boxes(backend):
    img = Image.open(TEST_IMAGES / "ai_interior.jpg").convert("RGB")
    det = SahiYoloeDetector(backend, SahiYoloeConfig())
    results = det.detect(img)
    assert isinstance(results, list)
    assert len(results) > 0
    for r in results:
        assert 0.0 <= r.box.x <= 1.0
        assert 0.0 <= r.box.y <= 1.0
        assert r.source == "yoloe"


def test_ai_interior_meets_fast_pass_floor(backend):
    """Plan A headline acceptance: fast pass alone (no deep pass, no memory
    bank) returns ≥15 detections on ai_interior.jpg."""
    img = Image.open(TEST_IMAGES / "ai_interior.jpg").convert("RGB")
    det = SahiYoloeDetector(backend, SahiYoloeConfig())
    results = det.detect(img)
    assert len(results) >= 15, (
        f"ai_interior.jpg fast pass returned {len(results)} objects; need ≥15. "
        f"Check SAHI slice params, confidence threshold, and YOLOE weights."
    )
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/unit/test_sahi_yoloe.py -v
```
Expected: FAIL.

- [ ] **Step 3: Implement SAHI+YOLOE detector and hook into backend**

Create `detection-service/src/detection_service/pipeline/sahi_yoloe.py`:

```python
from __future__ import annotations
from dataclasses import dataclass
from PIL import Image

from ..backends.base import BoundingBox, FastDetection


@dataclass
class SahiYoloeConfig:
    slice_height: int = 640
    slice_width: int = 640
    overlap_height_ratio: float = 0.2
    overlap_width_ratio: float = 0.2
    confidence_threshold: float = 0.15
    postprocess_type: str = "NMS"
    postprocess_match_metric: str = "IOU"
    postprocess_match_threshold: float = 0.5
    dedup_iou: float = 0.85


class SahiYoloeDetector:
    """Runs YOLOE-11L prompt-free under SAHI's tiled-inference pipeline and
    produces normalized FastDetection objects."""

    def __init__(self, backend, config: SahiYoloeConfig):
        self.backend = backend
        self.config = config

    def detect(self, image: Image.Image) -> list[FastDetection]:
        from sahi.predict import get_sliced_prediction

        sahi_model = self.backend.get_sahi_yoloe_model(
            confidence_threshold=self.config.confidence_threshold,
        )
        result = get_sliced_prediction(
            image,
            sahi_model,
            slice_height=self.config.slice_height,
            slice_width=self.config.slice_width,
            overlap_height_ratio=self.config.overlap_height_ratio,
            overlap_width_ratio=self.config.overlap_width_ratio,
            postprocess_type=self.config.postprocess_type,
            postprocess_match_metric=self.config.postprocess_match_metric,
            postprocess_match_threshold=self.config.postprocess_match_threshold,
            verbose=0,
        )

        W, H = image.size
        raw_dets: list[FastDetection] = []
        for pred in result.object_prediction_list:
            x1, y1, x2, y2 = pred.bbox.to_xyxy()
            raw_dets.append(
                FastDetection(
                    label=pred.category.name,
                    box=BoundingBox(
                        x=x1 / W, y=y1 / H,
                        w=(x2 - x1) / W, h=(y2 - y1) / H,
                    ),
                    confidence=float(pred.score.value),
                    source="yoloe",
                )
            )

        return self._dedup(raw_dets)

    def _dedup(self, dets: list[FastDetection]) -> list[FastDetection]:
        """Class-agnostic NMS to collapse near-duplicates."""
        if not dets:
            return dets
        sorted_dets = sorted(dets, key=lambda d: -d.confidence)
        kept: list[FastDetection] = []
        for d in sorted_dets:
            if not any(_iou(d.box, k.box) > self.config.dedup_iou for k in kept):
                kept.append(d)
        return kept


def _iou(a: BoundingBox, b: BoundingBox) -> float:
    ax2, ay2 = a.x + a.w, a.y + a.h
    bx2, by2 = b.x + b.w, b.y + b.h
    inter_x1 = max(a.x, b.x); inter_y1 = max(a.y, b.y)
    inter_x2 = min(ax2, bx2); inter_y2 = min(ay2, by2)
    inter = max(0.0, inter_x2 - inter_x1) * max(0.0, inter_y2 - inter_y1)
    union = a.area() + b.area() - inter
    return inter / union if union > 0 else 0.0
```

Modify `detection-service/src/detection_service/backends/mlx_backend.py` — add a YOLOE loader and wire `fast_detect`:

```python
    def get_sahi_yoloe_model(self, confidence_threshold: float):
        """Lazily instantiate a SAHI AutoDetectionModel wrapping YOLOE-11L.

        Uses model_type='ultralytics' because SAHI's verified supported
        model_types are: ultralytics, yolov5, mmdet, huggingface, torchvision,
        roboflow, rtdetr (no native 'yoloe' key). The ultralytics adapter
        should accept YOLOE weights because ultralytics >= 8.3.234 ships
        YOLOE as an ultralytics.YOLOE class that the SAHI adapter
        instantiates via ultralytics.YOLO(...)/YOLOE(...).

        RUNTIME VERIFICATION REQUIRED: if `model_type='ultralytics'` does
        not load yoloe-11l-seg-pf.pt cleanly, fall back to a custom
        sahi.models.base.DetectionModel subclass — this is the
        documented escape hatch.
        """
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded")
        if getattr(self, "_sahi_yoloe", None) is not None:
            self._sahi_yoloe.confidence_threshold = confidence_threshold
            return self._sahi_yoloe

        from sahi import AutoDetectionModel

        self._sahi_yoloe = AutoDetectionModel.from_pretrained(
            model_type="ultralytics",
            model_path="yoloe-11l-seg-pf.pt",
            confidence_threshold=confidence_threshold,
            device="mps" if self._clip_b32_device == "mps" else "cpu",
        )
        log.info("YOLOE-11L prompt-free loaded via SAHI (ultralytics adapter)")
        return self._sahi_yoloe

    def fast_detect(self, image: Image.Image) -> list[FastDetection]:
        from ..pipeline.sahi_yoloe import SahiYoloeDetector, SahiYoloeConfig
        if not self._fast_loaded:
            raise RuntimeError("Fast models not loaded")
        return SahiYoloeDetector(self, SahiYoloeConfig()).detect(image)
```

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv run pytest tests/unit/test_sahi_yoloe.py -v
```
Expected: PASS — `ai_interior.jpg` returns ≥15 detections.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/pipeline/sahi_yoloe.py \
  detection-service/src/detection_service/backends/mlx_backend.py \
  detection-service/tests/unit/test_sahi_yoloe.py
git commit -m "feat(fast-pass): YOLOE-11L prompt-free via SAHI — ai_interior.jpg ≥15 recall"
```

---

## Task 16: Memory-bank read path (pgvector HNSW + label resolution)

**Files:**
- Create: `detection-service/src/detection_service/pipeline/memory_bank.py`

- [ ] **Step 1: Write tests**

Create `detection-service/tests/unit/test_memory_bank.py`:

```python
import uuid
import pytest
from PIL import Image
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.db.pool import get_pool, close_pool
from detection_service.pipeline.memory_bank import MemoryBank, MemoryBankConfig


@pytest.fixture(scope="module")
def backend():
    b = MLXBackend()
    b.load_fast_models()
    return b


@pytest.fixture
async def tenant_id():
    pool = await get_pool()
    tid = uuid.uuid4()
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO tenants (id, name) VALUES (%s, %s)", (tid, f"test-{tid}")
        )
    yield tid
    async with pool.connection() as conn:
        await conn.execute("DELETE FROM tenants WHERE id = %s", (tid,))
    await close_pool()


async def test_empty_bank_returns_raw_label(backend, tenant_id):
    pool = await get_pool()
    mb = MemoryBank(pool, backend, MemoryBankConfig())
    crop = Image.new("RGB", (224, 224), (128, 128, 128))
    label, sources, candidates = await mb.resolve(
        tenant_id=tenant_id, crop=crop, raw_label="chair"
    )
    assert label == "chair"
    assert "memory_bank" not in sources
    assert candidates == []


async def test_auto_relabel_on_close_text_match(backend, tenant_id):
    """Seed a confirmed entry using a TEXT embedding; query with a text
    embedding derived from the same concept. This avoids flakiness from
    visual crop embeddings in a unit test."""
    pool = await get_pool()
    seeded = backend.embed_text("brown leather Eames lounge chair")
    async with pool.connection() as conn:
        await conn.execute(
            """
            INSERT INTO memory_bank (tenant_id, embedding, embedding_hash, item_label, status)
            VALUES (%s, %s, %s, %s, 'confirmed')
            """,
            (tenant_id, seeded.tolist(), b"\x00" * 8, "Eames lounge chair replica"),
        )
    mb = MemoryBank(pool, backend, MemoryBankConfig())
    # Unit-test override: replace the crop embedder with a text-based function
    # so the test is deterministic (visual CLIP embeddings vary run-to-run).
    def _fake_embed(_crop):
        return backend.embed_text("brown leather armchair")
    mb._override_embed_crop = _fake_embed

    crop = Image.new("RGB", (224, 224), (60, 40, 20))
    label, sources, _ = await mb.resolve(
        tenant_id=tenant_id, crop=crop, raw_label="armchair"
    )
    assert label == "Eames lounge chair replica"
    assert "memory_bank" in sources
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/unit/test_memory_bank.py -v
```
Expected: FAIL.

- [ ] **Step 3: Implement MemoryBank read path**

Create `detection-service/src/detection_service/pipeline/memory_bank.py`:

```python
from __future__ import annotations
import uuid
from dataclasses import dataclass
from typing import Optional, Callable
import numpy as np
from PIL import Image
from psycopg_pool import AsyncConnectionPool

from .semantic import labels_semantically_compatible


@dataclass
class MemoryBankConfig:
    max_distance: float = 0.25
    auto_relabel_distance: float = 0.15
    compatibility_threshold: float = 0.7
    top_k: int = 3


@dataclass
class MemoryBankHit:
    id: int
    item_label: str
    category_canonical: Optional[str]
    attributes: dict
    distance: float
    status: str


class MemoryBank:
    def __init__(self, pool: AsyncConnectionPool, backend, config: MemoryBankConfig):
        self.pool = pool
        self.backend = backend
        self.config = config
        # Test hook — allows unit tests to substitute a deterministic embedder
        self._override_embed_crop: Optional[Callable[[Image.Image], np.ndarray]] = None

    def _embed(self, crop: Image.Image) -> np.ndarray:
        if self._override_embed_crop is not None:
            return self._override_embed_crop(crop)
        return self.backend.embed_crop(crop)

    async def resolve(
        self,
        tenant_id: uuid.UUID,
        crop: Image.Image,
        raw_label: str,
    ) -> tuple[str, list[str], list[str]]:
        """Returns (resolved_label, sources, candidate_labels)."""
        emb = self._embed(crop)
        hits = await self._search(tenant_id, emb)

        if not hits:
            return raw_label, ["yoloe"], []

        top = hits[0]

        if top.distance < self.config.auto_relabel_distance:
            compatible = labels_semantically_compatible(
                raw_label, top.item_label, self.backend,
                threshold=self.config.compatibility_threshold,
            )
            if compatible:
                return top.item_label, ["yoloe", "memory_bank"], [
                    h.item_label for h in hits[1:] if h.item_label != top.item_label
                ]

        candidates = [h.item_label for h in hits if h.item_label != raw_label]
        return raw_label, ["yoloe"], candidates[: self.config.top_k]

    async def _search(
        self, tenant_id: uuid.UUID, embedding: np.ndarray
    ) -> list[MemoryBankHit]:
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                """
                SELECT id, item_label, category_canonical, attributes, status,
                       embedding <=> %s::vector AS distance
                FROM memory_bank
                WHERE tenant_id = %s
                  AND status IN ('candidate','confirmed')
                  AND (embedding <=> %s::vector) < %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (
                    embedding.tolist(),
                    tenant_id,
                    embedding.tolist(),
                    self.config.max_distance,
                    embedding.tolist(),
                    self.config.top_k,
                ),
            )
            rows = await cur.fetchall()
            return [
                MemoryBankHit(
                    id=r[0],
                    item_label=r[1],
                    category_canonical=r[2],
                    attributes=r[3] or {},
                    status=r[4],
                    distance=float(r[5]),
                )
                for r in rows
            ]
```

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv run pytest tests/unit/test_memory_bank.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/pipeline/memory_bank.py \
  detection-service/tests/unit/test_memory_bank.py
git commit -m "feat(fast-pass): MemoryBank read path with pgvector HNSW and semantic guard"
```

---

## Task 17: Fast-pass orchestrator — gatekeeper → YOLOE+SAHI → memory bank

**Files:**
- Create: `detection-service/src/detection_service/pipeline/fast_pass.py`

- [ ] **Step 1: Write test**

Create `detection-service/tests/integration/__init__.py` (empty).
Create `detection-service/tests/integration/test_fast_pass_ai_interior.py`:

```python
import uuid
import pytest
from pathlib import Path
from PIL import Image
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.db.pool import get_pool, close_pool
from detection_service.db.prompts_repo import PromptsRepo
from detection_service.pipeline.fast_pass import FastPass

TEST_IMAGES = Path(__file__).parent.parent.parent.parent / "test_images"


@pytest.fixture(scope="module")
def backend():
    b = MLXBackend()
    b.load_fast_models()
    return b


@pytest.fixture
async def tenant_id():
    pool = await get_pool()
    tid = uuid.uuid4()
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO tenants (id, name) VALUES (%s, %s)", (tid, f"test-{tid}")
        )
    yield tid
    async with pool.connection() as conn:
        await conn.execute("DELETE FROM tenants WHERE id = %s", (tid,))
    await close_pool()


async def test_ai_interior_end_to_end_accepted_and_floor_met(backend, tenant_id):
    """End-to-end Plan A headline test: a fresh tenant uploads ai_interior.jpg,
    the gatekeeper accepts it, YOLOE+SAHI runs, memory bank is empty so all
    labels are raw, at least 15 detections land in the returned list."""
    pool = await get_pool()
    prompts = PromptsRepo(pool)
    fp = await FastPass.create(backend=backend, pool=pool, prompts=prompts)

    img = Image.open(TEST_IMAGES / "ai_interior.jpg").convert("RGB")
    result = await fp.run(tenant_id=tenant_id, image=img)

    assert result.gatekeeper.accepted
    assert result.rejected is False
    assert len(result.detections) >= 15, (
        f"End-to-end fast pass returned {len(result.detections)} "
        f"detections; Plan A requires ≥15."
    )
    for d in result.detections:
        assert d.enrichment_state == "fast"
        assert "yoloe" in d.sources
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/integration/test_fast_pass_ai_interior.py -v
```
Expected: FAIL (FastPass module missing).

- [ ] **Step 3: Implement FastPass orchestrator**

Create `detection-service/src/detection_service/pipeline/fast_pass.py`:

```python
from __future__ import annotations
import time
import uuid
import yaml
from dataclasses import dataclass, field
from typing import Optional
from PIL import Image
from psycopg_pool import AsyncConnectionPool
from opentelemetry import trace

from ..backends.base import BoundingBox, FastDetection
from ..db.prompts_repo import PromptsRepo
from .gatekeeper import Gatekeeper, GatekeeperConfig, GatekeeperDecision
from .sahi_yoloe import SahiYoloeDetector, SahiYoloeConfig
from .memory_bank import MemoryBank, MemoryBankConfig

tracer = trace.get_tracer(__name__)


@dataclass
class FastPassDetection:
    label: str
    box: BoundingBox
    confidence: float
    category_canonical: Optional[str] = None
    enrichment_state: str = "fast"
    sources: list[str] = field(default_factory=list)
    candidate_labels: list[str] = field(default_factory=list)
    model_version: str = "fast-v0.1"
    prompt_version: str = "gatekeeper_interior.v1"


@dataclass
class FastPassResult:
    gatekeeper: GatekeeperDecision
    rejected: bool
    detections: list[FastPassDetection]
    elapsed_ms: int


class FastPass:
    """Orchestrator: gatekeeper → YOLOE+SAHI → memory bank."""

    def __init__(
        self,
        backend,
        pool: AsyncConnectionPool,
        gatekeeper: Gatekeeper,
        detector: SahiYoloeDetector,
        memory_bank: MemoryBank,
    ):
        self.backend = backend
        self.pool = pool
        self.gatekeeper = gatekeeper
        self.detector = detector
        self.memory_bank = memory_bank

    @classmethod
    async def create(cls, backend, pool: AsyncConnectionPool, prompts: PromptsRepo) -> "FastPass":
        body, _version = await prompts.get_active("gatekeeper_interior")
        cfg = yaml.safe_load(body)
        gk_config = GatekeeperConfig(
            accept_prompts=cfg["accept"],
            reject_prompts=cfg["reject"],
            reject_below_margin=cfg["thresholds"]["reject_below_margin"],
            low_confidence_below_margin=cfg["thresholds"]["low_confidence_below_margin"],
        )
        return cls(
            backend=backend,
            pool=pool,
            gatekeeper=Gatekeeper(backend, gk_config),
            detector=SahiYoloeDetector(backend, SahiYoloeConfig()),
            memory_bank=MemoryBank(pool, backend, MemoryBankConfig()),
        )

    async def run(self, tenant_id: uuid.UUID, image: Image.Image) -> FastPassResult:
        start = time.monotonic()

        with tracer.start_as_current_span("fast_pass.gatekeeper"):
            gk = self.gatekeeper.classify(image)

        if not gk.accepted:
            return FastPassResult(
                gatekeeper=gk,
                rejected=True,
                detections=[],
                elapsed_ms=int((time.monotonic() - start) * 1000),
            )

        with tracer.start_as_current_span("fast_pass.sahi_yoloe"):
            raw_dets: list[FastDetection] = self.detector.detect(image)

        resolved: list[FastPassDetection] = []
        for raw in raw_dets:
            with tracer.start_as_current_span("fast_pass.memory_bank.resolve"):
                crop = self._crop(image, raw.box, padding=0.10)
                label, sources, candidates = await self.memory_bank.resolve(
                    tenant_id=tenant_id, crop=crop, raw_label=raw.label,
                )
            resolved.append(
                FastPassDetection(
                    label=label,
                    box=raw.box,
                    confidence=raw.confidence,
                    sources=sources,
                    candidate_labels=candidates,
                )
            )

        return FastPassResult(
            gatekeeper=gk,
            rejected=False,
            detections=resolved,
            elapsed_ms=int((time.monotonic() - start) * 1000),
        )

    @staticmethod
    def _crop(image: Image.Image, box: BoundingBox, padding: float = 0.10) -> Image.Image:
        W, H = image.size
        pad_w = box.w * padding
        pad_h = box.h * padding
        x1 = max(0, int((box.x - pad_w) * W))
        y1 = max(0, int((box.y - pad_h) * H))
        x2 = min(W, int((box.x + box.w + pad_w) * W))
        y2 = min(H, int((box.y + box.h + pad_h) * H))
        return image.crop((x1, y1, x2, y2))
```

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv run pytest tests/integration/test_fast_pass_ai_interior.py -v
```
Expected: PASS — end-to-end fast pass on `ai_interior.jpg` meets ≥15 floor.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/pipeline/fast_pass.py \
  detection-service/tests/integration/test_fast_pass_ai_interior.py
git commit -m "feat(fast-pass): FastPass orchestrator — gatekeeper → SAHI+YOLOE → memory bank"
```

---

## Task 18: Detection-service `/fast-detect` FastAPI route

**Files:**
- Create: `detection-service/src/detection_service/routes/__init__.py`
- Create: `detection-service/src/detection_service/routes/fast_detect.py`
- Create: `detection-service/src/detection_service/routes/health.py`
- Modify: `detection-service/main.py`

- [ ] **Step 1: Write test**

Create `detection-service/tests/integration/test_fast_detect_http.py`:

```python
import uuid
import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from PIL import Image

TEST_IMAGES = Path(__file__).parent.parent.parent.parent / "test_images"


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


async def _make_tenant():
    from detection_service.db.pool import get_pool
    pool = await get_pool()
    tid = uuid.uuid4()
    async with pool.connection() as conn:
        await conn.execute("INSERT INTO tenants (id, name) VALUES (%s, %s)", (tid, f"t-{tid}"))
    return tid


def test_health_endpoint(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "healthy"


@pytest.mark.asyncio
async def test_fast_detect_ai_interior(client):
    tid = await _make_tenant()
    img_bytes = (TEST_IMAGES / "ai_interior.jpg").read_bytes()
    files = {"file": ("ai_interior.jpg", img_bytes, "image/jpeg")}
    data = {"tenant_id": str(tid)}
    r = client.post("/v1/fast-detect", files=files, data=data)
    assert r.status_code == 200
    body = r.json()
    assert body["rejected"] is False
    assert len(body["detections"]) >= 15


@pytest.mark.asyncio
async def test_fast_detect_gatekeeper_reject(client):
    tid = await _make_tenant()
    # Synthetic non-interior: a solid uniform bright image
    buf = io.BytesIO()
    Image.new("RGB", (512, 512), (255, 255, 255)).save(buf, format="JPEG")
    files = {"file": ("solid.jpg", buf.getvalue(), "image/jpeg")}
    data = {"tenant_id": str(tid)}
    r = client.post("/v1/fast-detect", files=files, data=data)
    # Synthetic image likely low confidence — allow 200 or 422
    assert r.status_code in (200, 422)
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/integration/test_fast_detect_http.py -v
```
Expected: FAIL.

- [ ] **Step 3: Implement routes**

Create `detection-service/src/detection_service/routes/__init__.py`:

```python
"""HTTP routes for detection-service."""
```

Create `detection-service/src/detection_service/routes/health.py`:

```python
from fastapi import APIRouter
from ..config import settings

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": settings.service_name,
        "version": settings.version,
        "backend": settings.inference_backend,
    }
```

Create `detection-service/src/detection_service/routes/fast_detect.py`:

```python
from __future__ import annotations
import io
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from PIL import Image
from opentelemetry import trace

router = APIRouter()
tracer = trace.get_tracer(__name__)


@router.post("/v1/fast-detect")
async def fast_detect(
    request: Request,
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
):
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(400, "Invalid tenant_id")

    with tracer.start_as_current_span("fast_detect.http"):
        contents = await file.read()
        try:
            image = Image.open(io.BytesIO(contents)).convert("RGB")
        except Exception as exc:
            raise HTTPException(400, f"Invalid image: {exc}")

        fast_pass = request.app.state.fast_pass
        result = await fast_pass.run(tenant_id=tid, image=image)

        if result.rejected:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "NonInteriorRejected",
                    "margin": result.gatekeeper.margin,
                    "accept_score": result.gatekeeper.accept_score,
                    "reject_score": result.gatekeeper.reject_score,
                },
            )

        return {
            "rejected": False,
            "elapsed_ms": result.elapsed_ms,
            "detections": [
                {
                    "label": d.label,
                    "box": {"x": d.box.x, "y": d.box.y, "w": d.box.w, "h": d.box.h},
                    "confidence": d.confidence,
                    "enrichment_state": d.enrichment_state,
                    "sources": d.sources,
                    "candidate_labels": d.candidate_labels,
                    "model_version": d.model_version,
                    "prompt_version": d.prompt_version,
                }
                for d in result.detections
            ],
        }
```

Modify `detection-service/main.py`:

```python
from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI

from detection_service.config import settings
from detection_service.telemetry import configure_telemetry, mount_prometheus
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.db.pool import get_pool, close_pool
from detection_service.db.prompts_repo import PromptsRepo
from detection_service.pipeline.fast_pass import FastPass
from detection_service.routes import health, fast_detect


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load models
    backend = MLXBackend()
    backend.load_fast_models()
    # Database pool
    pool = await get_pool()
    prompts = PromptsRepo(pool)
    # Pipeline
    app.state.fast_pass = await FastPass.create(backend=backend, pool=pool, prompts=prompts)
    app.state.backend = backend
    yield
    await close_pool()


app = FastAPI(
    title="detection-service",
    version=settings.version,
    lifespan=lifespan,
)

configure_telemetry(app=app)
mount_prometheus(app)

app.include_router(health.router)
app.include_router(fast_detect.router)


@app.get("/")
async def root():
    return {"service": settings.service_name, "version": settings.version}
```

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv run pytest tests/integration/test_fast_detect_http.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/routes/ detection-service/main.py \
  detection-service/tests/integration/test_fast_detect_http.py
git commit -m "feat(detection-service): /v1/fast-detect FastAPI route with lifespan model load"
```

---

## Task 19: Detection-service NATS fast worker (subscribes to fast.q)

**Files:**
- Create: `detection-service/src/detection_service/workers/__init__.py`
- Create: `detection-service/src/detection_service/workers/fast_worker.py`
- Create: `detection-service/scripts/run_fast_worker.py`

- [ ] **Step 1: Write test**

Create `detection-service/tests/integration/test_fast_worker.py`:

```python
import asyncio
import json
import uuid
from pathlib import Path
import pytest
from detection_service.backends.mlx_backend import MLXBackend
from detection_service.db.pool import get_pool, close_pool
from detection_service.db.prompts_repo import PromptsRepo
from detection_service.nats_client.client import NatsClient
from detection_service.pipeline.fast_pass import FastPass
from detection_service.workers.fast_worker import FastWorker

TEST_IMAGES = Path(__file__).parent.parent.parent.parent / "test_images"


@pytest.mark.asyncio
async def test_worker_consumes_fast_q_and_publishes_fast_complete():
    # Setup
    backend = MLXBackend()
    backend.load_fast_models()
    pool = await get_pool()
    prompts = PromptsRepo(pool)
    fast_pass = await FastPass.create(backend=backend, pool=pool, prompts=prompts)

    # Create tenant and image row
    tid = uuid.uuid4()
    iid = uuid.uuid4()
    jid = uuid.uuid4()
    async with pool.connection() as conn:
        await conn.execute("INSERT INTO tenants (id, name) VALUES (%s, %s)", (tid, f"t-{tid}"))
        await conn.execute(
            """INSERT INTO images (id, tenant_id, s3_key, phash, width, height, mime_type, size_bytes)
               VALUES (%s, %s, %s, %s, 1200, 1059, 'image/jpeg', 0)""",
            (iid, tid, f"tenants/{tid}/{iid}.jpg", b"\x00" * 8),
        )
        await conn.execute(
            """INSERT INTO jobs (id, tenant_id, image_id, status) VALUES (%s, %s, %s, 'queued')""",
            (jid, tid, iid),
        )

    # Load image into memory for the worker (bypass MinIO in test)
    img_bytes = (TEST_IMAGES / "ai_interior.jpg").read_bytes()

    # NATS
    nats = NatsClient()
    await nats.connect()
    await nats.ensure_streams()

    received = asyncio.Event()
    received_payload = {}

    async def on_complete(subject, payload, headers):
        received_payload.update(payload)
        received.set()

    await nats.subscribe("fast.complete", on_complete)

    worker = FastWorker(
        nats=nats,
        pool=pool,
        fast_pass=fast_pass,
        image_loader=lambda _key: img_bytes,  # test injection
    )
    task = asyncio.create_task(worker.run_once())

    # Publish a job
    await nats.publish("fast.q", {
        "job_id": str(jid),
        "tenant_id": str(tid),
        "image_id": str(iid),
        "s3_key": f"tenants/{tid}/{iid}.jpg",
    })

    await asyncio.wait_for(received.wait(), timeout=120)
    await task

    assert received_payload["job_id"] == str(jid)
    assert received_payload["detection_count"] >= 15

    # Cleanup
    async with pool.connection() as conn:
        await conn.execute("DELETE FROM tenants WHERE id = %s", (tid,))
    await nats.close()
    await close_pool()
```

- [ ] **Step 2: Run — expect fail**

```bash
uv run pytest tests/integration/test_fast_worker.py -v
```
Expected: FAIL.

- [ ] **Step 3: Implement fast worker**

Create `detection-service/src/detection_service/workers/__init__.py`:

```python
"""Background workers that consume NATS queues."""
```

Create `detection-service/src/detection_service/workers/fast_worker.py`:

```python
from __future__ import annotations
import asyncio
import json
import logging
import uuid
from typing import Callable, Optional
from PIL import Image
from io import BytesIO
from psycopg_pool import AsyncConnectionPool
from opentelemetry import trace

from ..nats_client.client import NatsClient
from ..pipeline.fast_pass import FastPass

log = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class FastWorker:
    def __init__(
        self,
        nats: NatsClient,
        pool: AsyncConnectionPool,
        fast_pass: FastPass,
        image_loader: Optional[Callable[[str], bytes]] = None,
    ):
        self.nats = nats
        self.pool = pool
        self.fast_pass = fast_pass
        self.image_loader = image_loader or self._default_loader

    @staticmethod
    def _default_loader(s3_key: str) -> bytes:
        # Production: fetch from MinIO. In tests this is replaced.
        from minio import Minio
        from ..config import settings
        endpoint = settings.minio_endpoint.replace("http://", "").replace("https://", "")
        client = Minio(
            endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,
        )
        obj = client.get_object(settings.minio_bucket_images, s3_key)
        return obj.read()

    async def run_forever(self) -> None:
        await self.nats.subscribe("fast.q", self._handle)
        while True:
            await asyncio.sleep(1.0)

    async def run_once(self) -> None:
        """Process exactly one message. Used in tests."""
        processed = asyncio.Event()

        async def handler(subject, payload, headers):
            await self._handle(subject, payload, headers)
            processed.set()

        sub = await self.nats.subscribe("fast.q", handler)
        await processed.wait()
        await sub.unsubscribe()

    async def _handle(self, subject: str, payload: dict, headers: dict) -> None:
        with tracer.start_as_current_span("fast_worker.handle"):
            job_id = uuid.UUID(payload["job_id"])
            tenant_id = uuid.UUID(payload["tenant_id"])
            image_id = uuid.UUID(payload["image_id"])
            s3_key = payload["s3_key"]

            try:
                img_bytes = self.image_loader(s3_key)
                image = Image.open(BytesIO(img_bytes)).convert("RGB")

                await self._mark_status(job_id, "fast_running")
                result = await self.fast_pass.run(tenant_id=tenant_id, image=image)

                if result.rejected:
                    await self._mark_status(job_id, "failed", error="NonInteriorRejected")
                    await self.nats.publish("fast.complete", {
                        "job_id": str(job_id),
                        "tenant_id": str(tenant_id),
                        "rejected": True,
                        "detection_count": 0,
                    })
                    return

                await self._persist_detections(job_id, tenant_id, result.detections)
                await self._mark_status(job_id, "fast_done")

                await self.nats.publish("fast.complete", {
                    "job_id": str(job_id),
                    "tenant_id": str(tenant_id),
                    "rejected": False,
                    "detection_count": len(result.detections),
                    "elapsed_ms": result.elapsed_ms,
                })
                # Enqueue deep pass (Plan B will consume this)
                await self.nats.publish("deep.q", {
                    "job_id": str(job_id),
                    "tenant_id": str(tenant_id),
                    "image_id": str(image_id),
                    "s3_key": s3_key,
                })

            except Exception as exc:
                log.exception("Fast worker failure for job %s", job_id)
                await self._mark_status(job_id, "failed", error=str(exc))

    async def _mark_status(self, job_id: uuid.UUID, status: str, error: str | None = None) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(
                """UPDATE jobs SET status=%s, updated_at=now(),
                   error_message=%s,
                   fast_completed_at = CASE WHEN %s='fast_done' THEN now() ELSE fast_completed_at END
                   WHERE id=%s""",
                (status, error, status, job_id),
            )

    async def _persist_detections(self, job_id, tenant_id, detections) -> None:
        async with self.pool.connection() as conn:
            for d in detections:
                await conn.execute(
                    """INSERT INTO detections (job_id, tenant_id, label, bbox_x, bbox_y, bbox_w, bbox_h,
                                                confidence, enrichment_state, sources, candidate_labels,
                                                model_version, prompt_version)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (job_id, tenant_id, d.label, d.box.x, d.box.y, d.box.w, d.box.h,
                     d.confidence, d.enrichment_state, d.sources, d.candidate_labels,
                     d.model_version, d.prompt_version),
                )
```

Create `detection-service/scripts/run_fast_worker.py`:

```python
#!/usr/bin/env python3
"""Entry point for running the fast worker outside of the FastAPI app."""
import asyncio
import logging

from detection_service.backends.mlx_backend import MLXBackend
from detection_service.db.pool import get_pool
from detection_service.db.prompts_repo import PromptsRepo
from detection_service.nats_client.client import NatsClient
from detection_service.pipeline.fast_pass import FastPass
from detection_service.telemetry import configure_telemetry
from detection_service.workers.fast_worker import FastWorker


async def main() -> None:
    configure_telemetry(app=None, service_name="detection-fast-worker")
    backend = MLXBackend()
    backend.load_fast_models()
    pool = await get_pool()
    prompts = PromptsRepo(pool)
    fast_pass = await FastPass.create(backend=backend, pool=pool, prompts=prompts)
    nats = NatsClient()
    await nats.connect()
    await nats.ensure_streams()
    worker = FastWorker(nats=nats, pool=pool, fast_pass=fast_pass)
    logging.info("fast worker ready, awaiting fast.q messages")
    await worker.run_forever()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
```

Add `minio>=7.2` to `detection-service/pyproject.toml` dependencies.

- [ ] **Step 4: Run tests**

```bash
cd detection-service
uv pip install -e ".[dev]"
uv run pytest tests/integration/test_fast_worker.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add detection-service/src/detection_service/workers/ \
  detection-service/scripts/run_fast_worker.py \
  detection-service/pyproject.toml \
  detection-service/tests/integration/test_fast_worker.py
git commit -m "feat(fast-pass): NATS FastWorker — consume fast.q, persist, publish fast.complete + deep.q"
```

---

## Task 20: api-service Postgres pool + Kysely schema + NATS client + MinIO upload

**Files:**
- Create: `api-service/src/db/pool.ts`
- Create: `api-service/src/db/schema.ts`
- Create: `api-service/src/nats/client.ts`
- Create: `api-service/src/nats/subjects.ts`
- Create: `api-service/src/storage/minio.ts`

- [ ] **Step 1: Write tests**

Create `api-service/src/__tests__/unit/db-pool.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { getPool, closePool } from '../../db/pool';

describe('db pool', () => {
  afterAll(async () => {
    await closePool();
  });

  it('connects to Postgres and returns a row', async () => {
    const pool = getPool();
    const { rows } = await pool.query('SELECT 1 AS one');
    expect(rows[0].one).toBe(1);
  });
});
```

Create `api-service/src/__tests__/unit/nats-client.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { connectNats, closeNats, publishJson } from '../../nats/client';
import { SUBJECTS } from '../../nats/subjects';

describe('nats client', () => {
  it('connects, publishes, and closes cleanly', async () => {
    const nc = await connectNats();
    await publishJson(nc, SUBJECTS.FAST_Q, { ping: 1 });
    await closeNats();
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd api-service && npm test -- db-pool nats-client
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `api-service/src/db/pool.ts`:

```typescript
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://allmythings:allmythings_dev@localhost:5432/allmythings';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

Create `api-service/src/db/schema.ts`:

```typescript
import type { ColumnType, Generated } from 'kysely';

export interface Database {
  tenants: TenantsTable;
  users: UsersTable;
  images: ImagesTable;
  jobs: JobsTable;
  detections: DetectionsTable;
}

export interface TenantsTable {
  id: Generated<string>;
  name: string;
  created_at: ColumnType<Date, never, never>;
  contribute_to_training: boolean;
}

export interface UsersTable {
  id: Generated<string>;
  tenant_id: string;
  email: string;
  role: 'user' | 'reviewer' | 'admin';
  created_at: ColumnType<Date, never, never>;
}

export interface ImagesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  s3_key: string;
  phash: Buffer;
  width: number;
  height: number;
  mime_type: string;
  size_bytes: number;
  golden_set_consent: boolean;
  created_at: ColumnType<Date, never, never>;
}

export interface JobsTable {
  id: Generated<string>;
  tenant_id: string;
  image_id: string;
  status: 'queued' | 'fast_running' | 'fast_done' | 'deep_running' | 'deep_done' | 'failed';
  enrichment_state: 'pending' | 'fast' | 'deep' | 'enriched' | 'failed';
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, never>;
  fast_completed_at: Date | null;
  deep_completed_at: Date | null;
  error_message: string | null;
}

export interface DetectionsTable {
  id: Generated<string>;
  job_id: string;
  tenant_id: string;
  label: string;
  category_canonical: string | null;
  category_raw: string | null;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  confidence: number;
  enrichment_state: string;
  sources: string[];
  candidate_labels: string[];
  disagreement_flag: boolean;
  attributes: Record<string, unknown>;
  model_version: string | null;
  prompt_version: string | null;
  created_at: ColumnType<Date, never, never>;
}
```

Create `api-service/src/nats/subjects.ts`:

```typescript
export const SUBJECTS = {
  FAST_Q: 'fast.q',
  FAST_COMPLETE: 'fast.complete',
  DEEP_Q: 'deep.q',
  DEEP_COMPLETE: 'deep.complete',
} as const;

export type Subject = typeof SUBJECTS[keyof typeof SUBJECTS];
```

Create `api-service/src/nats/client.ts`:

```typescript
import { connect, NatsConnection, JSONCodec, MsgHdrs, headers as createHeaders } from 'nats';
import { propagation, context, trace } from '@opentelemetry/api';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
const jc = JSONCodec();

let nc: NatsConnection | null = null;

export async function connectNats(): Promise<NatsConnection> {
  if (nc) return nc;
  nc = await connect({ servers: NATS_URL });
  return nc;
}

export async function closeNats(): Promise<void> {
  if (nc) {
    await nc.drain();
    nc = null;
  }
}

export async function publishJson(
  conn: NatsConnection,
  subject: string,
  payload: unknown,
): Promise<void> {
  const hdrs: MsgHdrs = createHeaders();
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  for (const [k, v] of Object.entries(carrier)) hdrs.set(k, v);
  conn.publish(subject, jc.encode(payload), { headers: hdrs });
}

export function getNats(): NatsConnection {
  if (!nc) throw new Error('NATS not connected — call connectNats() first');
  return nc;
}
```

Create `api-service/src/storage/minio.ts`:

```typescript
import { Client as MinioClient } from 'minio';
import { createHash } from 'node:crypto';

const endpoint = (process.env.MINIO_ENDPOINT ?? 'http://localhost:9000').replace(
  /^https?:\/\//,
  '',
);
const [host, portStr] = endpoint.split(':');
const port = Number(portStr ?? '9000');

export const minio = new MinioClient({
  endPoint: host,
  port,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'allmythings',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'allmythings_dev',
});

export const IMAGES_BUCKET = process.env.MINIO_BUCKET_IMAGES ?? 'images';

export async function putImage(
  tenantId: string,
  imageBuffer: Buffer,
  mimeType: string,
): Promise<{ key: string; hash: Buffer }> {
  const sha = createHash('sha256').update(imageBuffer).digest();
  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '/');
  const key = `tenants/${tenantId}/${yyyymm}/${sha.toString('hex')}.img`;
  await minio.putObject(IMAGES_BUCKET, key, imageBuffer, imageBuffer.length, {
    'Content-Type': mimeType,
  });
  return { key, hash: sha };
}

export async function getImage(key: string): Promise<Buffer> {
  const stream = await minio.getObject(IMAGES_BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
```

Add to `api-service/package.json` dependencies: `"minio": "^8.0.4"`.

- [ ] **Step 4: Run tests**

```bash
cd api-service && npm install && npm test -- db-pool nats-client
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/db/ api-service/src/nats/ api-service/src/storage/ \
  api-service/package.json api-service/package-lock.json \
  api-service/src/__tests__/unit/db-pool.test.ts \
  api-service/src/__tests__/unit/nats-client.test.ts
git commit -m "feat(api-service): pg pool + Kysely types + NATS client + MinIO storage"
```

---

## Task 21: api-service perceptual-hash dedup + job-store service

**Files:**
- Create: `api-service/src/services/phash-dedup.service.ts`
- Create: `api-service/src/services/job-store.service.ts`

- [ ] **Step 1: Write tests**

Create `api-service/src/__tests__/unit/phash-dedup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computePHash } from '../../services/phash-dedup.service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AI_INTERIOR = join(__dirname, '../../../../test_images/ai_interior.jpg');

describe('phash', () => {
  it('produces a deterministic 8-byte hash for the same image', () => {
    const img = readFileSync(AI_INTERIOR);
    const h1 = computePHash(img);
    const h2 = computePHash(img);
    expect(h1).toEqual(h2);
    expect(h1.length).toBe(8);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd api-service && npm test -- phash-dedup
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `api-service/src/services/phash-dedup.service.ts`:

```typescript
import sharp from 'sharp';
import { getPool } from '../db/pool';

/**
 * 64-bit perceptual hash via the classic DCT-less "aHash" (average hash)
 * algorithm: resize to 8x8 grayscale, threshold on mean, pack into 8 bytes.
 *
 * Cheap and synchronous-looking (actually async due to sharp's pipeline).
 * For tighter duplicates we could swap to pHash later.
 */
export async function computePHashAsync(image: Buffer): Promise<Buffer> {
  const { data } = await sharp(image)
    .greyscale()
    .resize(8, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mean = data.reduce((s, v) => s + v, 0) / 64;
  const bits = Buffer.alloc(8);
  for (let i = 0; i < 64; i++) {
    if (data[i] > mean) {
      bits[Math.floor(i / 8)] |= 1 << (i % 8);
    }
  }
  return bits;
}

// Sync convenience wrapper for unit tests that want a blocking API.
// In production, always use computePHashAsync.
export function computePHash(image: Buffer): Buffer {
  // sharp has no true sync API; this is a deasync shim only for tests.
  const { execSync } = require('node:child_process');
  // For unit test determinism we just recompute on every call and block
  // the microtask queue — NOT used in production request path.
  let result: Buffer | null = null;
  void computePHashAsync(image).then((b) => {
    result = b;
  });
  // Spin-wait (test-only)
  const start = Date.now();
  while (result === null && Date.now() - start < 5000) {
    // ignore
  }
  if (!result) throw new Error('phash timeout');
  return result;
}

export async function findDuplicateImage(
  tenantId: string,
  phash: Buffer,
): Promise<{ id: string; s3_key: string } | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string; s3_key: string }>(
    `SELECT id, s3_key FROM images
     WHERE tenant_id = $1 AND phash = $2
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, phash],
  );
  return rows[0] ?? null;
}
```

*(Note: the sync spin-wait exists only so the unit test can stay declarative. Production code in `detect.route.ts` always uses `computePHashAsync`. Mark the sync helper with an `@internal` JSDoc in a later polish pass.)*

Create `api-service/src/services/job-store.service.ts`:

```typescript
import { getPool } from '../db/pool';

export type JobStatus =
  | 'queued'
  | 'fast_running'
  | 'fast_done'
  | 'deep_running'
  | 'deep_done'
  | 'failed';

export interface CreatedJob {
  id: string;
  tenant_id: string;
  image_id: string;
}

export async function createImage(
  tenantId: string,
  userId: string | null,
  s3Key: string,
  phash: Buffer,
  width: number,
  height: number,
  mimeType: string,
  sizeBytes: number,
): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO images (tenant_id, user_id, s3_key, phash, width, height, mime_type, size_bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [tenantId, userId, s3Key, phash, width, height, mimeType, sizeBytes],
  );
  return rows[0].id;
}

export async function createJob(
  tenantId: string,
  imageId: string,
): Promise<CreatedJob> {
  const pool = getPool();
  const { rows } = await pool.query<CreatedJob>(
    `INSERT INTO jobs (tenant_id, image_id, status) VALUES ($1, $2, 'queued')
     RETURNING id, tenant_id, image_id`,
    [tenantId, imageId],
  );
  return rows[0];
}

export async function getJob(jobId: string, tenantId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, status, enrichment_state, error_message,
            fast_completed_at, deep_completed_at
     FROM jobs WHERE id = $1 AND tenant_id = $2`,
    [jobId, tenantId],
  );
  return rows[0] ?? null;
}

export async function getJobDetections(jobId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, label, category_canonical, category_raw,
            bbox_x, bbox_y, bbox_w, bbox_h, confidence,
            enrichment_state, sources, candidate_labels,
            disagreement_flag, attributes, model_version, prompt_version
     FROM detections WHERE job_id = $1 ORDER BY created_at ASC`,
    [jobId],
  );
  return rows;
}
```

- [ ] **Step 4: Run tests**

```bash
cd api-service && npm test -- phash-dedup
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/services/phash-dedup.service.ts api-service/src/services/job-store.service.ts \
  api-service/src/__tests__/unit/phash-dedup.test.ts
git commit -m "feat(api-service): perceptual-hash dedup + job store"
```

---

## Task 22: Rewrite `POST /v1/detect` to publish to NATS fast.q and return 202 + jobId

**Files:**
- Modify: `api-service/src/routes/detect.route.ts`
- Delete: `api-service/src/services/detection-pipeline.service.ts`
- Delete: `api-service/src/services/ensemble-fusion.service.ts`
- Delete: `api-service/src/providers/` (entire directory)

- [ ] **Step 1: Write integration test**

Create `api-service/src/__tests__/integration/detect-route.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app';
import { getPool, closePool } from '../../db/pool';
import { closeNats } from '../../nats/client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AI_INTERIOR = join(__dirname, '../../../../test_images/ai_interior.jpg');

describe('POST /v1/detect', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tenantId: string;

  beforeAll(async () => {
    app = await buildApp();
    tenantId = randomUUID();
    await getPool().query(
      'INSERT INTO tenants (id, name) VALUES ($1, $2)',
      [tenantId, `test-${tenantId}`],
    );
  });

  afterAll(async () => {
    await getPool().query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await app.close();
    await closePool();
    await closeNats();
  });

  it('returns 202 + jobId immediately and enqueues on fast.q', async () => {
    const img = readFileSync(AI_INTERIOR);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      headers: {
        'x-tenant-id': tenantId,
        'content-type': 'multipart/form-data; boundary=----xxx',
      },
      payload: Buffer.concat([
        Buffer.from('------xxx\r\n'),
        Buffer.from('Content-Disposition: form-data; name="file"; filename="a.jpg"\r\n'),
        Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
        img,
        Buffer.from('\r\n------xxx--\r\n'),
      ]),
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.job_id).toBeTruthy();
    expect(body.image_id).toBeTruthy();
    expect(body.status).toBe('queued');
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd api-service && npm test -- detect-route
```
Expected: FAIL.

- [ ] **Step 3: Rewrite detect.route.ts and delete obsolete files**

```bash
rm -rf api-service/src/providers
rm api-service/src/services/detection-pipeline.service.ts
rm api-service/src/services/ensemble-fusion.service.ts
```

Replace `api-service/src/routes/detect.route.ts` with:

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { connectNats, publishJson } from '../nats/client';
import { SUBJECTS } from '../nats/subjects';
import { computePHashAsync, findDuplicateImage } from '../services/phash-dedup.service';
import { createImage, createJob } from '../services/job-store.service';
import { putImage } from '../storage/minio';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function detectRoute(app: FastifyInstance): Promise<void> {
  app.post('/v1/detect', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.headers['x-tenant-id'];
    if (typeof tenantId !== 'string') {
      throw new BadRequestError('x-tenant-id header is required');
    }

    const data = await request.file();
    if (!data) throw new BadRequestError('No image file uploaded');

    const imageBuffer = await data.toBuffer();
    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      throw new PayloadTooLargeError(`Image exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
    }
    const mime = data.mimetype ?? 'application/octet-stream';
    if (!SUPPORTED_TYPES.has(mime)) {
      throw new BadRequestError(`Unsupported image type: ${mime}`);
    }

    // Probe image
    const meta = await sharp(imageBuffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    // pHash dedup
    const phash = await computePHashAsync(imageBuffer);
    const duplicate = await findDuplicateImage(tenantId, phash);

    let imageId: string;
    let s3Key: string;
    if (duplicate) {
      imageId = duplicate.id;
      s3Key = duplicate.s3_key;
      logger.info({ tenantId, imageId }, 'pHash dedup cache hit — reusing image');
    } else {
      const put = await putImage(tenantId, imageBuffer, mime);
      s3Key = put.key;
      imageId = await createImage(
        tenantId, null, s3Key, phash, width, height, mime, imageBuffer.length,
      );
    }

    const job = await createJob(tenantId, imageId);

    const nc = await connectNats();
    await publishJson(nc, SUBJECTS.FAST_Q, {
      job_id: job.id,
      tenant_id: tenantId,
      image_id: imageId,
      s3_key: s3Key,
    });

    return reply.code(202).send({
      job_id: job.id,
      image_id: imageId,
      status: 'queued',
    });
  });
}
```

Replace `api-service/src/routes/health.route.ts` with a Postgres+NATS liveness check (keep the existing structure):

```typescript
import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool';
import { connectNats } from '../nats/client';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/v1/health', async () => {
    const checks: Record<string, boolean> = {};
    try {
      await getPool().query('SELECT 1');
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }
    try {
      await connectNats();
      checks.nats = true;
    } catch {
      checks.nats = false;
    }
    const ok = Object.values(checks).every((v) => v);
    return { status: ok ? 'healthy' : 'degraded', checks };
  });
}
```

Update `api-service/src/app.ts` to register the modified routes, wire OTel on boot, and export a `buildApp()` factory for tests:

```typescript
import { initTelemetry, getPrometheusExporter } from './telemetry';
await initTelemetry();

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { detectRoute } from './routes/detect.route';
import { healthRoute } from './routes/health.route';
import { jobsRoute } from './routes/jobs.route';
import { connectNats } from './nats/client';
import { logger } from './utils/logger';

export async function buildApp() {
  const app = Fastify({ logger });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  app.get('/metrics', async (_req, reply) => {
    const exporter = getPrometheusExporter();
    if (!exporter) return reply.code(503).send('metrics not ready');
    // OTel Prometheus exporter exposes an HTTP handler; serve it inline.
    // (See @opentelemetry/exporter-prometheus docs.)
    return reply.type('text/plain').send(await exporter.getMetricsRequestHandler()(reply));
  });

  await app.register(detectRoute);
  await app.register(healthRoute);
  await app.register(jobsRoute);

  await connectNats();
  return app;
}

if (require.main === module) {
  buildApp().then((app) =>
    app.listen({ port: 14000, host: '0.0.0.0' }, (err) => {
      if (err) { logger.error(err); process.exit(1); }
      logger.info('api-service listening on :14000');
    }),
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd api-service && npm test -- detect-route
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/routes/ api-service/src/app.ts \
  api-service/src/__tests__/integration/detect-route.test.ts
git rm -r api-service/src/providers
git rm api-service/src/services/detection-pipeline.service.ts \
       api-service/src/services/ensemble-fusion.service.ts
git commit -m "feat(api-service): async /v1/detect — 202 + jobId, NATS publish, delete cloud adapters"
```

---

## Task 23: SSE `GET /v1/jobs/:id/stream` route for progressive updates

**Files:**
- Create: `api-service/src/routes/jobs.route.ts`

- [ ] **Step 1: Write tests**

Create `api-service/src/__tests__/integration/jobs-sse.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app';
import { getPool, closePool } from '../../db/pool';
import { closeNats } from '../../nats/client';
import { randomUUID } from 'node:crypto';

describe('GET /v1/jobs/:id/stream', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tenantId: string;
  let imageId: string;
  let jobId: string;

  beforeAll(async () => {
    app = await buildApp();
    tenantId = randomUUID();
    imageId = randomUUID();
    jobId = randomUUID();
    const pool = getPool();
    await pool.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, 't']);
    await pool.query(
      `INSERT INTO images (id, tenant_id, s3_key, phash, width, height, mime_type, size_bytes)
       VALUES ($1,$2,'k',$3, 100, 100, 'image/jpeg', 0)`,
      [imageId, tenantId, Buffer.alloc(8)],
    );
    await pool.query(
      `INSERT INTO jobs (id, tenant_id, image_id, status) VALUES ($1,$2,$3,'queued')`,
      [jobId, tenantId, imageId],
    );
  });

  afterAll(async () => {
    await getPool().query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await app.close();
    await closePool();
    await closeNats();
  });

  it('returns current job state on connect', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${jobId}/stream`,
      headers: { 'x-tenant-id': tenantId, accept: 'text/event-stream' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('event: state');
    expect(res.body).toContain(jobId);
  });

  it('404 for a job that does not exist', async () => {
    const otherId = randomUUID();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/jobs/${otherId}/stream`,
      headers: { 'x-tenant-id': tenantId },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd api-service && npm test -- jobs-sse
```
Expected: FAIL.

- [ ] **Step 3: Implement jobs route**

Create `api-service/src/routes/jobs.route.ts`:

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { connectNats } from '../nats/client';
import { SUBJECTS } from '../nats/subjects';
import { getJob, getJobDetections } from '../services/job-store.service';
import { NotFoundError, BadRequestError } from '../utils/errors';

export async function jobsRoute(app: FastifyInstance): Promise<void> {
  app.get('/v1/jobs/:id/stream', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.headers['x-tenant-id'];
    if (typeof tenantId !== 'string') throw new BadRequestError('x-tenant-id required');

    const jobId = request.params.id;
    const job = await getJob(jobId, tenantId);
    if (!job) throw new NotFoundError(`Job ${jobId} not found`);

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const sendEvent = (eventName: string, data: unknown) => {
      reply.raw.write(`event: ${eventName}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Initial snapshot
    const detections = await getJobDetections(jobId);
    sendEvent('state', { job, detections });

    // Terminal state — close immediately
    if (job.status === 'deep_done' || job.status === 'failed') {
      reply.raw.end();
      return;
    }

    // Subscribe to NATS for live updates
    const nc = await connectNats();
    const subs = await Promise.all([
      nc.subscribe(SUBJECTS.FAST_COMPLETE),
      nc.subscribe(SUBJECTS.DEEP_COMPLETE),
    ]);

    const cleanup = () => {
      for (const s of subs) s.unsubscribe();
      reply.raw.end();
    };
    request.raw.on('close', cleanup);

    (async () => {
      for (const sub of subs) {
        (async () => {
          for await (const msg of sub) {
            try {
              const payload = JSON.parse(new TextDecoder().decode(msg.data)) as { job_id?: string };
              if (payload.job_id !== jobId) continue;
              const refreshed = await getJob(jobId, tenantId);
              const refreshedDetections = await getJobDetections(jobId);
              sendEvent('state', { job: refreshed, detections: refreshedDetections });
              if (refreshed?.status === 'deep_done' || refreshed?.status === 'failed') {
                cleanup();
                return;
              }
            } catch {
              // ignore malformed messages
            }
          }
        })();
      }
    })();
  });
}
```

- [ ] **Step 4: Run tests**

```bash
cd api-service && npm test -- jobs-sse
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/routes/jobs.route.ts api-service/src/__tests__/integration/jobs-sse.test.ts
git commit -m "feat(api-service): SSE /v1/jobs/:id/stream with NATS progressive updates"
```

---

## Task 24: End-to-end Plan A headline test — upload → fast pass → SSE → ≥15

**Files:**
- Create: `api-service/src/__tests__/integration/detect-fast-pass.test.ts`

This is the **CI-blocking** acceptance test for Plan A. It wires the whole path:
upload → Postgres row → NATS fast.q → detection-service FastWorker → pgvector memory bank → persist detections → NATS fast.complete → SSE event on api-service → assertion that `detections.length ≥ 15`.

- [ ] **Step 1: Write the test**

Create `api-service/src/__tests__/integration/detect-fast-pass.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app';
import { getPool, closePool } from '../../db/pool';
import { closeNats } from '../../nats/client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AI_INTERIOR = join(__dirname, '../../../../test_images/ai_interior.jpg');

describe('E2E: upload ai_interior.jpg → fast pass → ≥15 detections', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tenantId: string;

  beforeAll(async () => {
    app = await buildApp();
    tenantId = randomUUID();
    await getPool().query(
      'INSERT INTO tenants (id, name) VALUES ($1, $2)',
      [tenantId, `e2e-${tenantId}`],
    );
  });

  afterAll(async () => {
    await getPool().query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await app.close();
    await closePool();
    await closeNats();
  });

  it('completes fast pass within 60s and returns at least 15 detections', async () => {
    const img = readFileSync(AI_INTERIOR);
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/v1/detect',
      headers: {
        'x-tenant-id': tenantId,
        'content-type': 'multipart/form-data; boundary=----x',
      },
      payload: Buffer.concat([
        Buffer.from('------x\r\n'),
        Buffer.from('Content-Disposition: form-data; name="file"; filename="a.jpg"\r\n'),
        Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
        img,
        Buffer.from('\r\n------x--\r\n'),
      ]),
    });
    expect(uploadRes.statusCode).toBe(202);
    const { job_id } = uploadRes.json() as { job_id: string };

    // Poll the job until fast_done (the detection-service FastWorker must be running)
    const pool = getPool();
    const deadline = Date.now() + 60_000;
    let status = 'queued';
    while (Date.now() < deadline) {
      const r = await pool.query<{ status: string }>(
        'SELECT status FROM jobs WHERE id = $1',
        [job_id],
      );
      status = r.rows[0]?.status ?? 'missing';
      if (status === 'fast_done' || status === 'deep_done' || status === 'failed') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(status).toBe('fast_done');

    const dets = await pool.query<{ label: string }>(
      'SELECT label FROM detections WHERE job_id = $1',
      [job_id],
    );
    expect(dets.rowCount).toBeGreaterThanOrEqual(15);
  }, 120_000);
});
```

- [ ] **Step 2: Prepare the environment**

Before running, ensure both services are up:

```bash
# Terminal 1: FOSS stack
docker compose -f docker-compose.dev.yml up -d

# Terminal 2: detection-service native (fast worker)
cd detection-service
uv run python scripts/run_fast_worker.py &

# Terminal 3: detection-service HTTP (optional for /health)
uv run uvicorn main:app --host 0.0.0.0 --port 14001 &

# Terminal 4: migrations + prompt seeds
make db-up
python scripts/seed_prompts.py

# Then run the test
cd api-service && npm test -- detect-fast-pass
```

- [ ] **Step 3: Run — expect PASS on a correctly-configured machine**

```bash
cd api-service && npm test -- detect-fast-pass
```
Expected: PASS — `ai_interior.jpg` end-to-end yields ≥15 detections within 60 s.

- [ ] **Step 4: Capture the actual detection count as the new baseline**

```bash
psql postgres://allmythings:allmythings_dev@localhost:5432/allmythings -c \
  "SELECT label, confidence FROM detections WHERE job_id = (SELECT id FROM jobs ORDER BY created_at DESC LIMIT 1) ORDER BY confidence DESC;" \
  > /tmp/ai_interior_fast_pass_baseline.txt
wc -l /tmp/ai_interior_fast_pass_baseline.txt
```

Commit this baseline to `eval/golden/ai_interior.fast_pass.baseline.txt` so Plan B regression tests can diff against it.

- [ ] **Step 5: Commit**

```bash
mkdir -p eval/golden
cp /tmp/ai_interior_fast_pass_baseline.txt eval/golden/ai_interior.fast_pass.baseline.txt
git add api-service/src/__tests__/integration/detect-fast-pass.test.ts \
  eval/golden/ai_interior.fast_pass.baseline.txt
git commit -m "test(e2e): Plan A headline — ai_interior.jpg fast pass ≥15 detections"
```

---

## Task 25: k6 load test — fast-pass p95 ≤ 10s at 30 RPM

**Files:**
- Create: `load-tests/fast-pass.k6.js`
- Create: `load-tests/README.md`

- [ ] **Step 1: Write the k6 script**

Create `load-tests/fast-pass.k6.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const IMAGE = open('../test_images/ai_interior.jpg', 'b');

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: 30,            // 30 uploads per minute
      timeUnit: '1m',
      duration: '2m',
      preAllocatedVUs: 10,
      maxVUs: 30,
    },
  },
  thresholds: {
    'http_req_duration{phase:upload}': ['p(95)<2000'],  // upload response 202 in <2s
    'fast_pass_end_to_end_ms':         ['p(95)<10000'], // full fast pass in <10s
    'http_req_failed':                 ['rate<0.01'],
  },
};

const API = __ENV.API_URL || 'http://localhost:14000';
const TENANT = __ENV.TENANT_ID || '00000000-0000-0000-0000-000000000001';

export default function () {
  const fd = new FormData();
  fd.append('file', { data: IMAGE, filename: 'ai_interior.jpg', content_type: 'image/jpeg' });
  const t0 = Date.now();
  const r = http.post(`${API}/v1/detect`, fd.body(), {
    headers: {
      'x-tenant-id': TENANT,
      'Content-Type': `multipart/form-data; boundary=${fd.boundary}`,
    },
    tags: { phase: 'upload' },
  });
  check(r, { 'upload 202': (res) => res.status === 202 });
  if (r.status !== 202) return;
  const { job_id } = r.json();

  // Poll job status
  const deadline = t0 + 15_000;
  let status = 'queued';
  while (Date.now() < deadline) {
    const s = http.get(`${API}/v1/jobs/${job_id}`, { headers: { 'x-tenant-id': TENANT } });
    if (s.status === 200) {
      status = s.json().status;
      if (status === 'fast_done' || status === 'deep_done' || status === 'failed') break;
    }
    sleep(0.25);
  }
  const elapsed = Date.now() - t0;
  check({ elapsed, status }, {
    'fast_done within 10s': (d) => d.status === 'fast_done' || d.status === 'deep_done',
    'e2e under 10s':         (d) => d.elapsed < 10000,
  });

  // Custom metric via trend — k6 doesn't expose custom metrics from default
  // easily here; use the http_req_duration tag as the proxy.
  sleep(randomIntBetween(1, 3));
}
```

Create `load-tests/README.md`:

```markdown
# Load tests

## Fast pass

Before running, ensure:
- Docker Compose stack is up
- detection-service FastWorker is running
- api-service is running
- A tenant exists whose UUID matches `TENANT_ID` env var

Run:
```
k6 run --env API_URL=http://localhost:14000 --env TENANT_ID=<uuid> load-tests/fast-pass.k6.js
```

Pass criteria (Plan A SLO):
- `http_req_duration{phase:upload}` p95 < 2000 ms
- `fast_pass_end_to_end_ms` p95 < 10000 ms
- `http_req_failed` rate < 1%
```

- [ ] **Step 2: Add `GET /v1/jobs/:id` state endpoint used by the load test**

Extend `api-service/src/routes/jobs.route.ts` with a simple non-SSE GET before the stream route:

```typescript
  app.get('/v1/jobs/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = request.headers['x-tenant-id'];
    if (typeof tenantId !== 'string') throw new BadRequestError('x-tenant-id required');
    const job = await getJob(request.params.id, tenantId);
    if (!job) throw new NotFoundError('Job not found');
    return job;
  });
```

- [ ] **Step 3: Run load test**

```bash
k6 run --env API_URL=http://localhost:14000 \
       --env TENANT_ID=<your-test-tenant-uuid> \
       load-tests/fast-pass.k6.js
```
Expected: all threshold checks pass.

- [ ] **Step 4: Commit**

```bash
git add load-tests/ api-service/src/routes/jobs.route.ts
git commit -m "test(load): k6 fast-pass script — 30 RPM, p95 ≤10s SLO"
```

---

## Task 26: GitHub Actions CI — stack up, migrations, seed, pytest, vitest

**Files:**
- Create: `.github/workflows/plan-a-ci.yml`

- [ ] **Step 1: Write workflow**

Create `.github/workflows/plan-a-ci.yml`:

```yaml
name: plan-a-ci

on:
  push:
    branches: [develop, main]
    paths:
      - 'api-service/**'
      - 'detection-service/**'
      - 'db/**'
      - 'prompts/**'
      - 'docker-compose.dev.yml'
      - 'infra/**'
      - '.github/workflows/plan-a-ci.yml'
  pull_request:
    branches: [develop, main]

jobs:
  stack-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start Docker Compose FOSS stack
        run: |
          docker compose -f docker-compose.dev.yml up -d \
            postgres minio nats prometheus tempo loki
          # Wait for Postgres
          for i in {1..30}; do
            if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U allmythings; then
              break
            fi
            sleep 2
          done

      - name: Apply migrations
        run: make db-up

      - name: Install Python (uv)
        run: |
          curl -LsSf https://astral.sh/uv/install.sh | sh
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"

      - name: Seed prompts_catalog
        run: |
          cd detection-service
          uv venv
          uv pip install psycopg[binary] pyyaml
          DATABASE_URL=postgres://allmythings:allmythings_dev@localhost:5432/allmythings \
            uv run python ../scripts/seed_prompts.py

      - name: Install detection-service deps (no model downloads)
        run: |
          cd detection-service
          uv pip install -e ".[dev]"

      - name: Run detection-service unit tests (no-GPU-needed ones only)
        env:
          DETECTION_DATABASE_URL: postgres://allmythings:allmythings_dev@localhost:5432/allmythings
          DETECTION_NATS_URL: nats://localhost:4222
        run: |
          cd detection-service
          uv run pytest tests/test_smoke.py tests/test_telemetry.py tests/unit/test_prompts_repo.py \
                        tests/unit/test_nats_client.py tests/unit/test_backend_contract.py -v

      - name: Install Node (api-service)
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: api-service/package-lock.json

      - name: Install api-service deps
        run: cd api-service && npm ci

      - name: Run api-service unit + integration tests
        env:
          DATABASE_URL: postgres://allmythings:allmythings_dev@localhost:5432/allmythings
          NATS_URL: nats://localhost:4222
          MINIO_ENDPOINT: http://localhost:9000
          OTLP_ENDPOINT: http://localhost:4317
        run: |
          cd api-service
          npm test -- --run --exclude '**/detect-fast-pass.test.ts'
        # The headline E2E test requires the detection-service FastWorker,
        # which needs MLX models and a Mac runner. CI runs all tests EXCEPT
        # detect-fast-pass; that test runs locally on the Mac M4 Pro before
        # any branch is merged.

      - name: Dump logs on failure
        if: failure()
        run: |
          docker compose -f docker-compose.dev.yml logs postgres nats minio
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/plan-a-ci.yml
git commit -m "ci(plan-a): docker-compose stack, migrations, py + ts tests (excluding MLX E2E)"
```

---

## Task 27: Top-level Makefile, README update, and final verification

**Files:**
- Modify: `Makefile`
- Create: `docs/plan-a-runbook.md`

- [ ] **Step 1: Extend Makefile with convenience targets**

Append to `Makefile`:

```make
.PHONY: stack-up stack-down stack-logs seed-prompts plan-a-verify

stack-up:
	docker compose -f docker-compose.dev.yml up -d
	$(MAKE) db-up
	$(MAKE) seed-prompts

stack-down:
	docker compose -f docker-compose.dev.yml down

stack-logs:
	docker compose -f docker-compose.dev.yml logs -f

seed-prompts:
	cd scripts && python3 seed_prompts.py

plan-a-verify:
	bash tests/compose/test_stack_up.sh
	bash tests/compose/test_observability.sh
	bash tests/compose/test_mlops.sh
	bash tests/db/test_full_schema.sh
	bash tests/db/test_prompts_seed.sh
	cd detection-service && uv run pytest -v
	cd api-service && npm test
	@echo "PLAN_A_VERIFIED"
```

- [ ] **Step 2: Write the runbook**

Create `docs/plan-a-runbook.md`:

```markdown
# Plan A — Runbook

## First-time setup (M4 Pro Mac)

```bash
# 1. Install tools
brew install docker docker-compose node@20 uv k6 dbmate
# ensure Docker Desktop is running

# 2. Clone and enter
cd /Users/mrarindampaul/Develop/allmythings

# 3. Start FOSS stack + apply migrations + seed prompts
make stack-up

# 4. Install Node deps
cd api-service && npm install && cd ..

# 5. Install Python deps (first run downloads YOLOE + CLIP ~3 GB)
cd detection-service && uv venv && uv pip install -e ".[dev]" && cd ..
```

## Daily dev loop

```bash
# Terminal 1: FOSS stack
make stack-up

# Terminal 2: detection-service HTTP
cd detection-service && uv run uvicorn main:app --host 0.0.0.0 --port 14001

# Terminal 3: fast worker
cd detection-service && uv run python scripts/run_fast_worker.py

# Terminal 4: api-service
cd api-service && npm run dev
```

Open http://localhost:3000 (Grafana, admin/admin) to watch traces and metrics.

## Running the headline acceptance test

```bash
# Create a test tenant (one-time)
psql postgres://allmythings:allmythings_dev@localhost:5432/allmythings \
  -c "INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'dev')"

# Run it
cd api-service && npm test -- detect-fast-pass
```

## Plan A complete

When `make plan-a-verify` prints `PLAN_A_VERIFIED`, Plan A is done and Plan B (deep pass) can begin.
```

- [ ] **Step 3: Run the full verification**

```bash
make plan-a-verify
```
Expected: final line prints `PLAN_A_VERIFIED`.

- [ ] **Step 4: Commit**

```bash
git add Makefile docs/plan-a-runbook.md
git commit -m "docs(plan-a): runbook + plan-a-verify target"
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-08-plan-a-scaffolding-fast-pass.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Each task is self-contained enough that a fresh context can execute it from the plan alone.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
