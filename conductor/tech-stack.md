# Technology Stack: Visual Home Inventory Manager

## 1. Mobile Application (Client)
- **Framework:** Flutter 3.16+
- **State Management:** Riverpod 3.0
- **Database (Offline-First):** Drift 2.29 (SQLite)
- **Routing:** GoRouter 17
- **Networking:** Dio
- **Data Models:** Freezed 3.2 (Immutable)

## 2. API Service (Backend Orchestrator)
- **Runtime:** Node.js 20+
- **Web Framework:** Fastify 4.25
- **Language:** TypeScript
- **Validation:** Zod 3.22
- **Logging:** Pino
- **Database:** PostgreSQL 15 (Managed or Containerized)

## 3. Specialized Services (Microservices)
- **Detection Service:**
    - **Framework:** FastAPI (Python)
    - **Core ML:** Ultralytics YOLO (Object Detection)
    - **Inference:** ONNX / PyTorch

## 4. AI & Machine Learning (Vision Pipeline)
- **Primary Provider (Cloud):** Google Gemini 1.5 Flash (Optimized for Free Tier)
- **Secondary Provider (Local):** Ollama (LLaVA / Qwen2.5-VL)
- **Fallback:** Mock Adapter (Development)

## 5. Infrastructure & DevOps
- **Containerization:** Docker & Docker Compose
- **Orchestration & IaC:** Terraform
- **Deployment Strategy:** Independent release orchestration (via local-release.sh)
- **Production Target:** Independent NixOS hosting or Docker-based VPS deployment.
- **Observability:** OpenObserve (Logs, Metrics, Traces)
