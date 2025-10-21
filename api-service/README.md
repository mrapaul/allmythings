# Vision AI API Service

Ensemble vision AI proxy service for the Visual Home Inventory Manager.

## Overview

This Node.js/TypeScript API service provides:
- Multi-provider ensemble vision AI (Meta Detectron2, Google Cloud Vision, AWS Rekognition, TensorFlow Serving)
- Parallel provider execution with result fusion
- Non-Maximum Suppression (NMS) for overlapping detections
- Confidence-weighted voting and label consensus
- Circuit breaker pattern for provider failover
- Structured logging and error handling

## Architecture

```
┌─────────────────────────────────────────┐
│  Fastify API (Node.js + TypeScript)     │
├─────────────────────────────────────────┤
│  Vision Orchestrator Service            │
│  ├─ Request Router                      │
│  ├─ Parallel Executor (Promise.all)     │
│  ├─ Result Aggregator                   │
│  └─ Ensemble Fusion Engine              │
├─────────────────────────────────────────┤
│  Provider Adapters (Circuit Breakers)   │
│  ├─ Meta API Adapter                    │
│  ├─ Google Vision SDK                   │
│  ├─ AWS Rekognition SDK                 │
│  └─ TensorFlow Serving Client           │
└─────────────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript 5.x
- **Framework**: Fastify 4.x
- **Validation**: Zod
- **Logging**: Pino
- **Testing**: Vitest + Supertest

## Prerequisites

- Node.js 20 LTS
- npm 10+ or pnpm 8+
- Google Cloud Platform account with Vision API enabled
- AWS account with Rekognition access (optional)

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# GOOGLE_CLOUD_PROJECT_ID=your-project-id
# GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
# AWS_ACCESS_KEY_ID=your-key (optional)
# AWS_SECRET_ACCESS_KEY=your-secret (optional)

# Start development server
npm run dev

# Server runs on http://localhost:3000
```

## Environment Variables

Create a `.env` file:

```env
# Server
PORT=3000
NODE_ENV=development

# Google Cloud Vision
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# AWS Rekognition (optional)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Ensemble Configuration
ENSEMBLE_CONFIDENCE_THRESHOLD=0.7
PROVIDER_TIMEOUT_MS=4000
NMS_IOU_THRESHOLD=0.5

# Provider Weights
META_WEIGHT=0.30
GOOGLE_WEIGHT=0.30
AWS_WEIGHT=0.25
TENSORFLOW_WEIGHT=0.15
```

## API Endpoints

### POST /v1/detect

Detect objects in an uploaded image using ensemble vision AI.

**Request:**
```bash
curl -X POST http://localhost:3000/v1/detect \
  -F "image=@photo.jpg" \
  -F "minConfidence=0.7"
```

**Response:**
```json
{
  "success": true,
  "ensembleMode": "full",
  "processingTimeMs": 3420,
  "detections": [
    {
      "id": "det-1",
      "label": "Laptop",
      "confidence": 0.92,
      "boundingBox": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4 },
      "ensembleDetails": {
        "providerAgreement": 4,
        "confidenceByProvider": { "meta": 0.91, "google": 0.93, "aws": 0.90, "tensorflow": 0.94 },
        "labelConsensus": "unanimous"
      }
    }
  ],
  "ensembleMetrics": {
    "providersUsed": 4,
    "averageConfidence": 0.92,
    "consensusRate": 1.0
  }
}
```

### GET /v1/health

Check service health and provider status.

```bash
curl http://localhost:3000/v1/health
```

## Development

```bash
# Watch mode (auto-restart on changes)
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Build for production
npm run build

# Start production server
npm start
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
open coverage/index.html
```

## Deployment

### Google Cloud Run

```bash
# Build container
docker build -t gcr.io/PROJECT_ID/vision-api .

# Push to registry
docker push gcr.io/PROJECT_ID/vision-api

# Deploy to Cloud Run
gcloud run deploy vision-api \
  --image gcr.io/PROJECT_ID/vision-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## Cost Optimization

**Provider Costs** (per 1,000 images):
- Meta Detectron2: $0 (self-hosted)
- Google Cloud Vision: $1.50
- AWS Rekognition: $1.00
- TensorFlow Serving: $0 (self-hosted)

**Recommendations:**
- Start with Google + AWS for 2-provider baseline
- Add Meta + TensorFlow after validating accuracy improvement
- Use Circuit Breaker to avoid failed provider costs

## Documentation

- [API Contract](../specs/001-build-a-mobile/contracts/vision-api.yaml)
- [Research & Architecture](../specs/001-build-a-mobile/research.md)
- [Implementation Plan](../specs/001-build-a-mobile/plan.md)

## License

Private project - not for distribution
