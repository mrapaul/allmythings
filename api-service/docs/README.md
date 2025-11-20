# Visual Home Inventory Manager - Backend Documentation

Complete backend architecture and implementation guide for the Visual Home Inventory Manager system.

## Overview

The Visual Home Inventory Manager backend is a Fastify-based REST API that orchestrates multiple computer vision providers through an ensemble pattern to deliver high-confidence object detection for a Flutter mobile application.

### Key Features

- Multi-provider vision AI ensemble (Google Vision, AWS Rekognition)
- User-based data isolation with JWT authentication
- Offline-first sync support for mobile apps
- Full-text search across inventory items and labels
- Redis caching for improved performance
- Circuit breaker pattern for resilience
- PostgreSQL database with FTS support
- S3-compatible object storage for images

---

## Documentation Structure

### 1. [ARCHITECTURE.md](./ARCHITECTURE.md)
**Complete system architecture and design patterns**

Contents:
- System overview and architecture principles
- Service architecture diagrams (Mermaid)
- API routes and service responsibilities
- Authentication and authorization strategy
- Data flow diagrams for all major operations
- Error handling and resilience patterns
- Caching strategy with Redis
- Technology stack details

Key sections:
- Detection flow with ensemble fusion
- Label management flow
- Offline sync flow
- Search flow with PostgreSQL FTS
- Circuit breaker implementation
- Retry logic with exponential backoff
- User context propagation

### 2. [OPENAPI.yaml](./OPENAPI.yaml)
**Complete OpenAPI 3.1 specification**

Contains:
- All API endpoints with request/response schemas
- Authentication with JWT Bearer tokens
- Validation schemas using Zod
- Error response formats
- Example requests and responses
- Security definitions

Endpoints:
- `POST /v1/detect` - Object detection
- `GET /v1/items` - List inventory items
- `POST /v1/items` - Create item
- `GET /v1/items/{itemId}` - Get item details
- `PATCH /v1/items/{itemId}` - Update item
- `DELETE /v1/items/{itemId}` - Delete item
- `POST /v1/labels` - Add label
- `PATCH /v1/labels/{labelId}` - Update label
- `DELETE /v1/labels/{labelId}` - Delete label
- `GET /v1/search` - Search inventory
- `GET /v1/sync` - Pull changes
- `POST /v1/sync` - Push changes
- `GET /v1/health` - Health check

### 3. [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
**Step-by-step implementation instructions**

Contents:
- Project setup and dependencies
- Environment configuration
- Database setup (PostgreSQL + Redis)
- Service implementation order (5 phases)
- Testing strategy (unit, integration, E2E)
- Deployment guide (Docker, Kubernetes)

Implementation phases:
1. Core Infrastructure (Week 1)
2. Image Processing (Week 2)
3. Detection Enhancement (Week 2-3)
4. Inventory Management (Week 3-4)
5. API Routes (Week 4)
6. Testing (Week 5)

---

## Database Schema

### PostgreSQL Tables

Located in: `/database/schema.sql`

**Core Tables:**
- `users` - User accounts and authentication
- `inventory_items` - Inventory items with detection metadata (JSONB)
- `labels` - Custom labels/tags for items
- `label_search_fts` - Full-text search index (tsvector)
- `sync_metadata` - Sync state tracking per user

**Key Features:**
- User-based data isolation (all queries include `user_id`)
- Soft deletes for offline sync (`deleted_at` column)
- JSONB for flexible detection metadata
- PostgreSQL full-text search with triggers
- Indexes for performance (user_id, timestamps, JSONB paths)

**Functions:**
- `search_inventory()` - Full-text search with ranking
- `get_changes_since()` - Incremental sync support

---

## Quick Start

### Prerequisites

- Node.js 20 LTS
- PostgreSQL 15+
- Redis 7+
- AWS account (for S3 and Rekognition)
- Google Cloud account (for Vision API)

### Local Development Setup

```bash
# 1. Clone repository
cd api-service

# 2. Install dependencies
npm install

# 3. Start infrastructure (Docker Compose)
docker-compose up -d postgres redis

# 4. Create database schema
psql -U postgres -d home_inventory -f database/schema.sql

# 5. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 6. Start development server
npm run dev

# 7. Run tests
npm test

# 8. Generate OpenAPI docs
npm run docs:serve
```

### Environment Variables

Required variables (see `.env.example`):
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/home_inventory
REDIS_HOST=localhost
JWT_SECRET=your-secret-key
AWS_ACCESS_KEY_ID=your-aws-key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

---

## Architecture Highlights

### Layered Architecture

```
Routes (HTTP handlers)
    ↓
Services (Business logic)
    ↓
Repositories (Data access)
    ↓
Database (PostgreSQL)
```

### Service Boundaries

**Detection Service:**
- Validates uploaded images
- Coordinates with Vision Orchestrator
- Caches results in Redis
- Returns ensemble-fused detections

**Inventory Service:**
- CRUD operations for items
- User-based data isolation
- S3 integration for photos
- Associates labels with items

**Label Service:**
- Custom label management
- Validation and uniqueness checks
- Triggers FTS index updates

**Search Service:**
- Full-text search with PostgreSQL
- Ranked results by relevance
- Filter by confidence, date range

**Sync Service:**
- Incremental sync for offline apps
- Conflict resolution (last-write-wins)
- Soft delete handling

**Image Processing Service:**
- Format validation (JPEG, PNG, WebP)
- Resize to max dimensions
- Generate thumbnails (256x256)
- Upload to S3 with metadata
- SHA-256 hashing for cache keys

**Vision Orchestrator Service:**
- Parallel execution of all providers
- Per-provider circuit breakers
- Timeout management (4s per provider)
- Result aggregation

**Ensemble Fusion Service:**
- Non-Maximum Suppression (NMS)
- Weighted confidence fusion
- Provider agreement calculation
- Consensus determination

### Resilience Patterns

**Circuit Breaker:**
- Per-provider circuit breakers
- States: CLOSED → OPEN → HALF-OPEN
- Failure threshold: 5 consecutive failures
- Reset timeout: 30 seconds
- Half-open test: 3 successful requests to close

**Retry Logic:**
- Exponential backoff (1s, 2s, 4s)
- 30% jitter to prevent thundering herd
- Max 3 attempts
- Retryable errors: ECONNRESET, ETIMEDOUT, rate limits

**Timeout Management:**
- Vision provider: 4s per provider
- Database queries: 2s
- S3 uploads: 10s
- Total request: 15s

**Graceful Degradation:**
- Returns partial results if some providers fail
- Falls back to cached results when available
- Continues with available providers

### Caching Strategy

**L1: In-Memory (Node.js Map)**
- TTL: 5 minutes
- Use case: Recent requests

**L2: Redis**
- Detection results: 24 hours
- Search results: 5 minutes
- User items: 10 minutes
- Provider health: 1 minute

**Cache Invalidation:**
- Time-based (TTL)
- Event-driven (on data changes)
- Cache warming (after login)

---

## API Authentication

### JWT-based Authentication

**Token Format:**
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "roles": ["user"],
  "iat": 1234567890,
  "exp": 1234571490
}
```

**Request Headers:**
```
Authorization: Bearer <jwt-token>
```

**User Context Propagation:**
All service methods receive `userId` from JWT:
```typescript
async createItem(userId: string, data: CreateItemDto)
```

All database queries include user isolation:
```sql
WHERE user_id = $1 AND deleted_at IS NULL
```

---

## Data Flow Examples

### 1. Object Detection Flow

```
1. Mobile app uploads image via POST /v1/detect
2. API validates JWT and extracts userId
3. Image Processing Service:
   - Validates format (JPEG/PNG/WebP)
   - Resizes to max 2048px
   - Generates SHA-256 hash
4. Check Redis cache by hash
5. If cache miss:
   - Upload to S3 (original + thumbnail)
   - Call Vision Orchestrator
   - Parallel calls to Google Vision + AWS Rekognition
   - Apply ensemble fusion (NMS + weighted averaging)
   - Cache result in Redis (24h TTL)
   - Save to PostgreSQL
6. Return detection response to mobile app
```

### 2. Search Flow

```
1. Mobile app sends GET /v1/search?q=laptop
2. API validates JWT and extracts userId
3. Search Service builds PostgreSQL FTS query:
   - Joins inventory_items + labels + label_search_fts
   - Filters by user_id and deleted_at IS NULL
   - Applies full-text search with ts_rank
   - Orders by relevance
4. Returns ranked results with highlights
```

### 3. Offline Sync Flow

```
1. Mobile app comes online after offline work
2. GET /v1/sync?since=2024-01-15T10:00:00Z
3. Sync Service queries:
   - Items updated since timestamp
   - Labels created since timestamp
   - Deleted item IDs (soft deletes)
4. Mobile app merges changes with local SQLite
5. POST /v1/sync/push with local changes
6. Server applies changes with conflict resolution
7. Returns synced item IDs and conflicts
```

---

## Testing

### Unit Tests
- All services with mocked dependencies
- Validation schemas
- Utility functions
- Error handling

### Integration Tests
- API routes with real database
- Database repositories
- Redis caching
- S3 uploads

### E2E Tests
- Complete user flows
- Detection → Save → Search → Sync
- Error scenarios

### Test Coverage
Target: 80%+ code coverage

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
npm run test:e2e          # E2E tests only
```

---

## Deployment

### Docker

```bash
docker build -t api-service:latest .
docker run -p 3000:3000 --env-file .env api-service:latest
```

### Kubernetes

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

### Environment-specific Configs

- **Development**: Full logging, mock providers available
- **Staging**: Production-like, test credentials
- **Production**: Minimal logging, real providers only, strict security

---

## Monitoring and Observability

### Logging (Pino)
- Structured JSON logs
- Correlation IDs for request tracking
- Log levels: debug, info, warn, error

### Metrics (Prometheus)
- Request rate, duration, errors (RED metrics)
- Circuit breaker state changes
- Cache hit/miss rates
- Provider response times

### Tracing (OpenTelemetry)
- Distributed tracing across services
- Vision provider call traces
- Database query traces

### Health Checks
- `/v1/health` endpoint
- Database connectivity
- Redis connectivity
- Provider availability
- Liveness and readiness probes

---

## Security Best Practices

1. JWT tokens with short expiration (1h)
2. HTTPS only in production
3. Rate limiting per user (50 req/min)
4. Input validation with Zod schemas
5. SQL injection prevention (parameterized queries)
6. CORS whitelist for mobile app origins
7. Helmet.js security headers
8. Secrets in environment variables
9. S3 presigned URLs with expiration
10. User-based data isolation in all queries

---

## Performance Optimization

1. Redis caching for vision results (24h)
2. PostgreSQL indexes on user_id, timestamps
3. JSONB GIN indexes for detection data
4. Connection pooling (PostgreSQL: 2-10 connections)
5. Parallel vision provider calls
6. Image resizing before API calls
7. Thumbnail generation (256x256)
8. CDN for static assets (if applicable)
9. Database query optimization with EXPLAIN ANALYZE
10. Horizontal scaling (stateless services)

---

## Troubleshooting

### Common Issues

**Database connection errors:**
- Check `DATABASE_URL` in `.env`
- Verify PostgreSQL is running
- Check network connectivity

**Vision provider failures:**
- Verify API credentials
- Check circuit breaker state in logs
- Review rate limits

**Redis connection errors:**
- Check Redis is running
- Verify `REDIS_HOST` and `REDIS_PORT`
- Review Redis logs

**High memory usage:**
- Check image processing queue
- Review Redis memory usage
- Monitor connection pool sizes

---

## Support and Resources

### Documentation Files
- `/docs/ARCHITECTURE.md` - Complete architecture
- `/docs/OPENAPI.yaml` - API specification
- `/docs/IMPLEMENTATION_GUIDE.md` - Implementation steps
- `/database/schema.sql` - Database schema

### Code Examples
- `/src/services/` - Service implementations
- `/src/schemas/` - Validation schemas
- `/tests/` - Test examples

### External Resources
- [Fastify Documentation](https://www.fastify.io/)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [Google Cloud Vision API](https://cloud.google.com/vision/docs)
- [AWS Rekognition](https://docs.aws.amazon.com/rekognition/)

---

## Next Steps

1. Review architecture document: `ARCHITECTURE.md`
2. Set up local development environment
3. Review OpenAPI specification: `OPENAPI.yaml`
4. Follow implementation guide: `IMPLEMENTATION_GUIDE.md`
5. Implement services in recommended order
6. Write tests as you build
7. Deploy to staging
8. Set up monitoring
9. Deploy to production

For questions or issues, refer to the detailed documentation files linked above.
