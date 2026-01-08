# Visual Home Inventory Manager

An AI-powered mobile application with an Instagram-style UI for comprehensive home inventory management. Features a hybrid detection pipeline combining local YOLO-World, Ollama (LLaVA), and Google Gemini.

## 🌟 Key Features

- **Hybrid AI Pipeline:** Real-time local detection (YOLO) + deep analysis (Ollama/Gemini).
- **Instagram-Style Feed:** Polished, infinite-scroll interface for browsing items.
- **Offline-First:** Full capture and search capabilities without internet, syncing when online.
- **Smart Tagging:** Automatic attribute extraction (brand, material, condition).
- **Intelligent Search:** Real-time full-text search across items and labels.

## 🏗 System Architecture

- **Mobile App (`/mobile-app`):** Flutter + Riverpod + Drift (SQLite). Clean Architecture.
- **API Service (`/api-service`):** Node.js + Fastify + TypeScript. Orchestrates AI providers.
- **Detection Service (`/detection-service`):** Python + FastAPI + YOLO-World. Local inference.

## 🛠 Tech Stack

- **Frontend:** Flutter 3.16+, Riverpod 3.0, Drift 2.29.
- **Backend:** Node.js 20+, Fastify 4.25, PostgreSQL, Redis.
- **AI/ML:** Ultralytics YOLO, Ollama (LLaVA), Google Gemini 1.5 Flash.
- **Infrastructure:** Docker, Terraform, OpenObserve.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+, Flutter 3.16+, Python 3.12+.
- Docker & Docker Compose.
- Ollama (running locally with `llava` model).

### Setup
```bash
# Install all dependencies and set up the project
make setup

# Start services in development mode
# Term 1: API
make dev-api
# Term 2: Mobile
make dev-mobile
# Term 3: Detection Service
cd detection-service && venv/bin/python main.py
```

## 🧪 Testing
- **API:** `cd api-service && npm test`
- **Mobile:** `cd mobile-app && flutter test`
- **Cleanup & Verify:** `./build-and-test.sh`

## 📄 License
Private project. All rights reserved.