# Backend Services Implementation

## Overview

This document describes the implementation of backend services for the Visual Home Inventory Manager API, building on the Phase 1 foundation with object detection capabilities.

## Architecture

### Service Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Fastify Application                 │
├─────────────────────────────────────────────────────────┤
│  Middleware                                             │
│  - Authentication (JWT)                                 │
│  - Error Handling                                       │
│  - Rate Limiting                                        │
│  - CORS                                                 │
├─────────────────────────────────────────────────────────┤
│  API Routes                                             │
│  - /v1/detect      - Object detection                   │
│  - /v1/items       - Inventory CRUD                     │
│  - /v1/labels      - Label management                   │
│  - /v1/search      - Full-text search                   │
│  - /v1/sync        - Offline sync                       │
│  - /v1/health      - Health check                       │
├─────────────────────────────────────────────────────────┤
│  Service Layer                                          │
│  - DetectionService     - Image validation & detection  │
│  - InventoryService     - Item management               │
│  - SearchService        - Full-text search              │
│  - SyncService          - Offline-first sync            │
│  - VisionOrchestrator   - Multi-provider ensemble       │
├─────────────────────────────────────────────────────────┤
│  Repository Layer                                       │
│  - InventoryRepository  - Item data access              │
│  - LabelRepository      - Label data access             │
├─────────────────────────────────────────────────────────┤
│  Database Layer                                         │
│  - PostgreSQL Connection Pool                           │
│  - Transaction Management                               │
└─────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Database Layer

**Files:**
- `/src/db/database.ts` - PostgreSQL connection pool
- `/src/db/repositories/base.repository.ts` - Generic repository pattern
- `/src/db/repositories/inventory.repository.ts` - Inventory data access
- `/src/db/repositories/label.repository.ts` - Label data access

**Features:**
- Connection pooling with configurable size
- Transaction support
- Health check capabilities
- Graceful shutdown
- Prepared statement support

**Database Schema:**
- `inventory_items` - Core inventory table with JSONB detection data
- `labels` - User labels with optional key-value pairs
- `label_search_fts` - Full-text search index (auto-maintained via triggers)

### 2. Service Layer

#### DetectionService
**File:** `/src/services/detection.service.ts`

**Responsibilities:**
- Image validation (format, size, dimensions)
- Image preprocessing (placeholder for Phase 1)
- Orchestrating vision providers via VisionOrchestratorService
- Confidence filtering
- Thumbnail generation (placeholder)

**Features:**
- Magic byte detection for image formats (JPEG, PNG, WebP)
- Size limits (10MB max)
- Integration with existing vision ensemble

#### InventoryService
**File:** `/src/services/inventory.service.ts`

**Responsibilities:**
- CRUD operations for inventory items
- Label management (add, update, delete)
- Data validation via Zod schemas

**Features:**
- User-based data isolation
- Soft delete support
- Paginated item listing
- Confidence-based filtering
- Label association

#### SearchService
**File:** `/src/services/search.service.ts`

**Responsibilities:**
- Full-text search across items and labels
- PostgreSQL tsvector search
- Result ranking

**Features:**
- Full-text search using `search_inventory()` function
- Fallback fuzzy matching with ILIKE
- Search result highlighting
- Confidence filtering
- Date range filtering
- Pagination

#### SyncService
**File:** `/src/services/sync.service.ts`

**Responsibilities:**
- Pull changes from server since timestamp
- Push changes from client with conflict detection
- Last-write-wins conflict resolution

**Features:**
- Incremental sync based on timestamps
- Conflict detection and resolution
- Batch operations
- Deleted items tracking

### 3. API Routes

#### Detection Route
**File:** `/src/routes/detect.route.ts`

```typescript
POST /v1/detect
Headers: Authorization: Bearer <token>
Body: multipart/form-data (image file)
Query: ?minConfidence=0.7

Response: DetectionResponse with ensemble results
```

#### Items Route
**File:** `/src/routes/items.route.ts`

```typescript
GET /v1/items
  ?page=1&limit=20&sort=createdAt_desc&minConfidence=0.7
POST /v1/items
  Body: CreateItemRequest
GET /v1/items/:id
PATCH /v1/items/:id
  Body: UpdateItemRequest
DELETE /v1/items/:id
```

#### Labels Route
**File:** `/src/routes/labels.route.ts`

```typescript
POST /v1/labels
  Body: { itemId, key?, value }
PATCH /v1/labels/:id
  Body: { value }
DELETE /v1/labels/:id
```

#### Search Route
**File:** `/src/routes/search.route.ts`

```typescript
GET /v1/search
  ?q=laptop&page=1&limit=20&minConfidence=0.7
```

#### Sync Route
**File:** `/src/routes/sync.route.ts`

```typescript
GET /v1/sync
  ?since=2024-01-01T00:00:00Z&page=1&limit=100
POST /v1/sync
  Body: { items[], labels[], deletedItemIds[] }
```

### 4. Middleware

#### Authentication Middleware
**File:** `/src/middleware/auth.middleware.ts`

**Features:**
- JWT token extraction from Authorization header
- Token parsing and validation (Phase 1: basic, production: full JWT verification)
- User extraction and request attachment
- Optional authentication support

**Development Auth:**
For Phase 1, supports simple token formats:
- JWT format: `eyJhbGciOi...` (parsed but not signature-verified)
- Simple format: `userId:email`
- Just userId: `user-123`

#### Error Handling Middleware
**File:** `/src/middleware/error.middleware.ts`

**Features:**
- AppError handling with proper status codes
- Zod validation error formatting
- Fastify error handling
- Consistent error response format
- Operational vs non-operational error distinction

### 5. Type Safety

All schemas defined with Zod:
- `/src/schemas/detection.schema.ts` - Detection types
- `/src/schemas/inventory.schema.ts` - Item and label types
- `/src/schemas/search.schema.ts` - Search types
- `/src/schemas/sync.schema.ts` - Sync types

TypeScript strict mode enabled, no `any` types in production code.

## Testing

### Unit Tests

**Files:**
- `/src/services/__tests__/detection.service.test.ts`
- `/src/services/__tests__/inventory.service.test.ts`

**Coverage:**
- Service logic testing with mocked dependencies
- Image validation edge cases
- Error handling scenarios

### Integration Tests

**Files:**
- `/src/__tests__/integration/items.integration.test.ts`

**Coverage:**
- Full API endpoint testing
- Database integration
- Authentication flows
- Error responses

**Run Tests:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Configuration

### Environment Variables

All configuration via environment variables (`.env` file):

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=visual_inventory
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false
DB_POOL_SIZE=20

# Storage
S3_BASE_URL=https://storage.example.com
S3_BUCKET=inventory-photos
S3_REGION=us-east-1

# Vision Providers (existing)
GOOGLE_CLOUD_PROJECT_ID=...
AWS_ACCESS_KEY_ID=...
```

### Database Setup

1. Create database:
```sql
CREATE DATABASE visual_inventory;
```

2. Run schema:
```bash
psql -U postgres -d visual_inventory -f database/schema.sql
```

3. Verify:
```bash
psql -U postgres -d visual_inventory -c "\dt"
```

## Deployment

### Development

```bash
# Install dependencies
npm install

# Setup database
createdb visual_inventory
psql -d visual_inventory -f database/schema.sql

# Configure environment
cp .env.example .env
# Edit .env with your values

# Run in development mode
npm run dev
```

### Production

```bash
# Build
npm run build

# Run
npm start
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/app.js"]
```

## API Documentation

### Authentication

All endpoints (except `/` and `/v1/health`) require authentication:

```
Authorization: Bearer <jwt-token>
```

The token should contain:
- `userId` - User identifier
- `email` - User email

### Error Responses

All errors follow consistent format:

```json
{
  "statusCode": 400,
  "error": "BadRequest",
  "message": "Error message here",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "details": {} // Optional additional details
}
```

### Response Formats

#### Inventory Item
```json
{
  "id": "uuid",
  "userId": "uuid",
  "photoUrl": "https://...",
  "thumbnailUrl": "https://...",
  "detectionData": { /* DetectionResponse */ },
  "labels": [
    {
      "id": "uuid",
      "itemId": "uuid",
      "key": "type",
      "value": "laptop",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### Paginated Response
```json
{
  "items": [ /* array of items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Performance Considerations

### Database Optimization
- Indexes on frequently queried columns
- JSONB GIN indexes for detection data
- Full-text search indexes on labels
- Connection pooling (default 20 connections)

### Caching Strategy
- Phase 1: No caching (database queries)
- Future: Redis for frequently accessed items

### Rate Limiting
- 100 requests per minute per IP
- Ban after 10 violations

## Security

### Current Implementation
- JWT authentication (basic in Phase 1)
- User-based data isolation in all queries
- SQL injection prevention via parameterized queries
- Input validation with Zod schemas
- File size limits (10MB)
- Supported file format validation

### Production Requirements
- Full JWT signature verification
- HTTPS/TLS encryption
- Rate limiting per user
- API key rotation
- Secrets management (AWS Secrets Manager, Vault)
- CORS configuration per environment

## Observability

### Logging
- Structured logging with Pino
- Request ID tracking
- User ID in all logs
- Error stack traces
- Performance metrics

### Monitoring
- Health check endpoint
- Database connection health
- Vision provider health

## Future Enhancements

1. **Image Storage**
   - S3 presigned URL generation
   - Upload directly to S3
   - Thumbnail generation with sharp library

2. **Advanced Search**
   - Semantic search with embeddings
   - Image similarity search
   - Multi-language support

3. **Caching**
   - Redis for frequently accessed items
   - Search result caching
   - Detection result caching

4. **Analytics**
   - User activity tracking
   - Search analytics
   - Detection accuracy metrics

5. **Advanced Sync**
   - Real-time sync with WebSockets
   - Conflict resolution UI
   - Sync status tracking

## Dependencies

### Runtime
- `fastify` - Web framework
- `pg` - PostgreSQL client
- `zod` - Schema validation
- `pino` - Logging
- `@fastify/cors` - CORS support
- `@fastify/multipart` - File upload
- `@fastify/rate-limit` - Rate limiting

### Development
- `typescript` - Type safety
- `vitest` - Testing
- `eslint` - Linting
- `prettier` - Code formatting

## File Structure

```
api-service/
├── src/
│   ├── config/
│   │   └── env.config.ts
│   ├── db/
│   │   ├── database.ts
│   │   └── repositories/
│   │       ├── base.repository.ts
│   │       ├── inventory.repository.ts
│   │       └── label.repository.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   ├── routes/
│   │   ├── detect.route.ts
│   │   ├── health.route.ts
│   │   ├── items.route.ts
│   │   ├── labels.route.ts
│   │   ├── search.route.ts
│   │   └── sync.route.ts
│   ├── schemas/
│   │   ├── detection.schema.ts
│   │   ├── inventory.schema.ts
│   │   ├── search.schema.ts
│   │   └── sync.schema.ts
│   ├── services/
│   │   ├── detection.service.ts
│   │   ├── inventory.service.ts
│   │   ├── search.service.ts
│   │   ├── sync.service.ts
│   │   └── vision-orchestrator.service.ts
│   ├── utils/
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── __tests__/
│   │   └── integration/
│   └── app.ts
├── database/
│   └── schema.sql
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## License

ISC
