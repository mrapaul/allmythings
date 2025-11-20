# Implementation Guide - Backend Service Architecture

This guide provides step-by-step instructions for implementing the Visual Home Inventory Manager backend service.

## Table of Contents
1. [Project Setup](#project-setup)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Service Implementation Order](#service-implementation-order)
5. [Testing Strategy](#testing-strategy)
6. [Deployment Guide](#deployment-guide)

---

## Project Setup

### 1. Install Dependencies

```bash
cd api-service

# Install production dependencies
npm install \
  @fastify/cors@^8.5.0 \
  @fastify/multipart@^8.0.0 \
  @fastify/rate-limit@^9.1.0 \
  @fastify/helmet@^11.1.1 \
  @fastify/jwt@^8.0.0 \
  @aws-sdk/client-rekognition@^3.478.0 \
  @aws-sdk/client-s3@^3.478.0 \
  @google-cloud/vision@^4.1.0 \
  fastify@^4.25.0 \
  pg@^8.11.3 \
  ioredis@^5.3.2 \
  zod@^3.22.4 \
  pino@^10.1.0 \
  pino-pretty@^10.3.1 \
  sharp@^0.33.2 \
  bcrypt@^5.1.1 \
  jsonwebtoken@^9.0.2

# Install development dependencies
npm install -D \
  @types/node@^20.10.5 \
  @types/pg@^8.10.9 \
  @types/bcrypt@^5.0.2 \
  @types/jsonwebtoken@^9.0.5 \
  @typescript-eslint/eslint-plugin@^6.15.0 \
  @typescript-eslint/parser@^6.15.0 \
  @vitest/coverage-v8@^3.2.4 \
  eslint@^8.56.0 \
  prettier@^3.1.1 \
  tsx@^4.7.0 \
  typescript@^5.3.3 \
  vitest@^3.2.4
```

### 2. Update Directory Structure

```
api-service/
├── src/
│   ├── config/
│   │   ├── env.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   └── s3.config.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── request-id.middleware.ts
│   │   └── validation.middleware.ts
│   ├── routes/
│   │   ├── detect.route.ts
│   │   ├── items.route.ts
│   │   ├── labels.route.ts
│   │   ├── search.route.ts
│   │   ├── sync.route.ts
│   │   └── health.route.ts
│   ├── services/
│   │   ├── detection.service.ts
│   │   ├── inventory.service.ts
│   │   ├── label.service.ts
│   │   ├── search.service.ts
│   │   ├── sync.service.ts
│   │   ├── image-processing.service.ts
│   │   ├── vision-orchestrator.service.ts (existing)
│   │   └── ensemble-fusion.service.ts (existing)
│   ├── repositories/
│   │   ├── inventory.repository.ts
│   │   ├── label.repository.ts
│   │   └── user.repository.ts
│   ├── adapters/
│   │   ├── provider-adapter.interface.ts
│   │   ├── google-vision.adapter.ts (existing)
│   │   ├── aws-rekognition.adapter.ts (existing)
│   │   └── mock-vision.adapter.ts (existing)
│   ├── schemas/
│   │   ├── detection.schema.ts (existing)
│   │   ├── inventory.schema.ts
│   │   ├── label.schema.ts
│   │   ├── search.schema.ts
│   │   └── sync.schema.ts
│   ├── utils/
│   │   ├── circuit-breaker.ts (existing)
│   │   ├── retry.ts
│   │   ├── cache.ts
│   │   ├── logger.ts (existing)
│   │   └── errors.ts
│   ├── types/
│   │   ├── fastify.d.ts
│   │   └── index.ts
│   └── app.ts (existing)
├── database/
│   ├── schema.sql
│   ├── migrations/
│   └── seeds/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── OPENAPI.yaml
│   └── IMPLEMENTATION_GUIDE.md
└── package.json
```

---

## Environment Configuration

### 1. Create `.env` File

```bash
# Server Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/home_inventory
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=home-inventory-images
AWS_S3_REGION=us-east-1

# Google Cloud Vision
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Vision API Configuration
PROVIDER_TIMEOUT_MS=4000
ENSEMBLE_CONFIDENCE_THRESHOLD=0.7
NMS_IOU_THRESHOLD=0.5

# Provider Weights
META_WEIGHT=0.30
GOOGLE_WEIGHT=0.30
AWS_WEIGHT=0.25
TENSORFLOW_WEIGHT=0.15

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000  # 1 minute in ms

# Image Processing
MAX_IMAGE_SIZE_MB=10
MAX_IMAGE_DIMENSION=2048
THUMBNAIL_SIZE=256

# Feature Flags
ENABLE_CACHE=true
ENABLE_METRICS=true
```

### 2. Update `env.config.ts`

```typescript
// src/config/env.config.ts
export interface EnvConfig {
  // Server
  port: number;
  nodeEnv: string;
  logLevel: string;

  // Database
  databaseUrl: string;
  databasePoolMin: number;
  databasePoolMax: number;

  // Redis
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  redisDb: number;

  // AWS
  awsRegion: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsS3Bucket: string;
  awsS3Region: string;

  // Google Cloud
  googleProjectId: string;
  googleCredentials: string;

  // JWT
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;

  // Vision API
  providerTimeoutMs: number;
  ensembleConfidenceThreshold: number;
  nmsIouThreshold: number;

  // Provider Weights
  metaWeight: number;
  googleWeight: number;
  awsWeight: number;
  tensorflowWeight: number;

  // Rate Limiting
  rateLimitMax: number;
  rateLimitWindow: number;

  // Image Processing
  maxImageSizeMb: number;
  maxImageDimension: number;
  thumbnailSize: number;

  // Feature Flags
  enableCache: boolean;
  enableMetrics: boolean;
}

export const envConfig: EnvConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  databaseUrl: process.env.DATABASE_URL || '',
  databasePoolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
  databasePoolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),

  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD,
  redisDb: parseInt(process.env.REDIS_DB || '0', 10),

  awsRegion: process.env.AWS_REGION || 'us-east-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsS3Bucket: process.env.AWS_S3_BUCKET || '',
  awsS3Region: process.env.AWS_S3_REGION || 'us-east-1',

  googleProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  providerTimeoutMs: parseInt(process.env.PROVIDER_TIMEOUT_MS || '4000', 10),
  ensembleConfidenceThreshold: parseFloat(
    process.env.ENSEMBLE_CONFIDENCE_THRESHOLD || '0.7'
  ),
  nmsIouThreshold: parseFloat(process.env.NMS_IOU_THRESHOLD || '0.5'),

  metaWeight: parseFloat(process.env.META_WEIGHT || '0.30'),
  googleWeight: parseFloat(process.env.GOOGLE_WEIGHT || '0.30'),
  awsWeight: parseFloat(process.env.AWS_WEIGHT || '0.25'),
  tensorflowWeight: parseFloat(process.env.TENSORFLOW_WEIGHT || '0.15'),

  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),

  maxImageSizeMb: parseInt(process.env.MAX_IMAGE_SIZE_MB || '10', 10),
  maxImageDimension: parseInt(process.env.MAX_IMAGE_DIMENSION || '2048', 10),
  thumbnailSize: parseInt(process.env.THUMBNAIL_SIZE || '256', 10),

  enableCache: process.env.ENABLE_CACHE === 'true',
  enableMetrics: process.env.ENABLE_METRICS === 'true',
};

// Validation
if (!envConfig.jwtSecret && envConfig.nodeEnv === 'production') {
  throw new Error('JWT_SECRET is required in production');
}

if (!envConfig.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
```

---

## Database Setup

### 1. Install PostgreSQL Locally (Development)

```bash
# macOS with Homebrew
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb home_inventory

# Or use Docker
docker run --name postgres-dev \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=home_inventory \
  -p 5432:5432 \
  -d postgres:15-alpine
```

### 2. Run Schema

```bash
psql -U your_user -d home_inventory -f database/schema.sql
```

### 3. Create Database Client

```typescript
// src/config/database.config.ts
import { Pool, PoolClient } from 'pg';
import { envConfig } from './env.config';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: envConfig.databaseUrl,
      min: envConfig.databasePoolMin,
      max: envConfig.databasePoolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('connect', () => {
      logger.info('PostgreSQL client connected');
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected PostgreSQL error');
    });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 4. Setup Redis Client

```typescript
// src/config/redis.config.ts
import Redis from 'ioredis';
import { envConfig } from './env.config';
import { logger } from '../utils/logger';

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis({
      host: envConfig.redisHost,
      port: envConfig.redisPort,
      password: envConfig.redisPassword,
      db: envConfig.redisDb,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });
  }

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
}
```

---

## Service Implementation Order

Implement services in this order to manage dependencies:

### Phase 1: Core Infrastructure (Week 1)

1. **Error Handling**
   - File: `src/utils/errors.ts`
   - Custom error classes (ValidationError, NotFoundError, etc.)
   - Global error handler middleware

2. **Authentication Middleware**
   - File: `src/middleware/auth.middleware.ts`
   - JWT verification
   - User context extraction

3. **Database Repositories**
   - File: `src/repositories/inventory.repository.ts`
   - File: `src/repositories/label.repository.ts`
   - CRUD operations with proper SQL

### Phase 2: Image Processing (Week 2)

4. **Image Processing Service**
   - File: `src/services/image-processing.service.ts`
   - Image validation (format, size)
   - Resizing with Sharp
   - Hash generation for caching
   - S3 upload

5. **S3 Configuration**
   - File: `src/config/s3.config.ts`
   - S3 client setup
   - Presigned URL generation

### Phase 3: Detection Enhancement (Week 2-3)

6. **Enhanced Detection Service**
   - File: `src/services/detection.service.ts`
   - Integrate image processing
   - Add Redis caching
   - Connect to existing VisionOrchestratorService

7. **Update Vision Orchestrator**
   - Add circuit breakers per provider
   - Add result caching

### Phase 4: Inventory Management (Week 3-4)

8. **Inventory Service**
   - File: `src/services/inventory.service.ts`
   - CRUD for items
   - User isolation

9. **Label Service**
   - File: `src/services/label.service.ts`
   - CRUD for labels
   - Validation

10. **Search Service**
    - File: `src/services/search.service.ts`
    - Full-text search with PostgreSQL
    - Ranked results

11. **Sync Service**
    - File: `src/services/sync.service.ts`
    - Incremental sync logic
    - Conflict resolution

### Phase 5: API Routes (Week 4)

12. **Implement All Routes**
    - Detection route (enhance existing)
    - Items routes (new)
    - Labels routes (new)
    - Search route (new)
    - Sync routes (new)
    - Health route (enhance existing)

### Phase 6: Testing (Week 5)

13. **Write Tests**
    - Unit tests for all services
    - Integration tests for routes
    - E2E tests for critical flows

---

## Testing Strategy

### Unit Tests

```typescript
// tests/unit/services/inventory.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../../../src/services/inventory.service';
import { InventoryRepository } from '../../../src/repositories/inventory.repository';

describe('InventoryService', () => {
  let service: InventoryService;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      findByUserId: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    service = new InventoryService(mockRepository);
  });

  describe('createItem', () => {
    it('should create inventory item with valid data', async () => {
      const userId = 'user-123';
      const itemData = {
        photoS3Key: 'photos/test.jpg',
        thumbnailS3Key: 'thumbs/test.jpg',
        detectionData: { detections: [] },
      };

      mockRepository.create.mockResolvedValue({
        id: 'item-123',
        ...itemData,
        userId,
      });

      const result = await service.createItem(userId, itemData);

      expect(result.id).toBe('item-123');
      expect(mockRepository.create).toHaveBeenCalledWith(userId, itemData);
    });
  });
});
```

### Integration Tests

```typescript
// tests/integration/items.route.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';

describe('Items Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await buildApp();
    // Get test auth token
    authToken = 'test-jwt-token';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/items', () => {
    it('should return paginated items', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/items?page=1&limit=20',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('items');
      expect(response.json()).toHaveProperty('pagination');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/items',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

---

## Deployment Guide

### Docker Setup

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/app.js"]
```

### Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/home_inventory
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=home_inventory
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-service
  template:
    metadata:
      labels:
        app: api-service
    spec:
      containers:
      - name: api
        image: your-registry/api-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /v1/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /v1/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

## Next Steps

1. Start with Phase 1 (Core Infrastructure)
2. Set up local development environment with Docker Compose
3. Implement services following the order above
4. Write tests as you implement each service
5. Review and update OpenAPI spec as needed
6. Deploy to staging environment for testing
7. Configure monitoring and alerting
8. Deploy to production

For questions or issues, refer to:
- Architecture documentation: `docs/ARCHITECTURE.md`
- OpenAPI specification: `docs/OPENAPI.yaml`
- Database schema: `database/schema.sql`
