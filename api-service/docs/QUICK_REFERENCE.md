# Quick Reference Guide - Visual Home Inventory Manager API

## API Endpoints Summary

### Detection
```
POST   /v1/detect                    Upload image for object detection
```

### Inventory Items
```
GET    /v1/items                     List all items (paginated)
POST   /v1/items                     Create new item
GET    /v1/items/{itemId}            Get item details
PATCH  /v1/items/{itemId}            Update item metadata
DELETE /v1/items/{itemId}            Delete item (soft delete)
```

### Labels
```
POST   /v1/labels                    Add label to item
GET    /v1/items/{itemId}/labels     Get all labels for item
PATCH  /v1/labels/{labelId}          Update label value
DELETE /v1/labels/{labelId}          Delete label
```

### Search
```
GET    /v1/search?q={query}          Full-text search inventory
```

### Sync
```
GET    /v1/sync?since={timestamp}    Pull changes (offline sync)
POST   /v1/sync                      Push local changes
```

### Health
```
GET    /v1/health                    Service health check
```

---

## Request Examples

### 1. Detect Objects
```bash
curl -X POST https://api.homeinventory.app/v1/detect \
  -H "Authorization: Bearer {token}" \
  -F "image=@photo.jpg" \
  -F "minConfidence=0.8"
```

### 2. List Items
```bash
curl -X GET "https://api.homeinventory.app/v1/items?page=1&limit=20&sort=createdAt_desc" \
  -H "Authorization: Bearer {token}"
```

### 3. Create Item
```bash
curl -X POST https://api.homeinventory.app/v1/items \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "photoS3Key": "users/123/photos/photo.jpg",
    "thumbnailS3Key": "users/123/thumbnails/photo_thumb.jpg",
    "detectionData": { ... },
    "initialLabels": [
      {"key": "type", "value": "laptop"},
      {"key": "brand", "value": "Apple"}
    ]
  }'
```

### 4. Search Inventory
```bash
curl -X GET "https://api.homeinventory.app/v1/search?q=laptop%20black&minConfidence=0.8" \
  -H "Authorization: Bearer {token}"
```

### 5. Sync Changes
```bash
curl -X GET "https://api.homeinventory.app/v1/sync?since=2024-01-15T10:00:00Z&page=1&limit=100" \
  -H "Authorization: Bearer {token}"
```

---

## Response Formats

### Detection Response
```json
{
  "success": true,
  "ensembleMode": "partial",
  "processingTimeMs": 1250,
  "detections": [
    {
      "id": "det_abc123",
      "label": "laptop",
      "confidence": 0.92,
      "boundingBox": {
        "x": 0.2,
        "y": 0.3,
        "width": 0.4,
        "height": 0.5
      },
      "ensembleDetails": {
        "providerAgreement": 2,
        "confidenceByProvider": {
          "google": 0.95,
          "aws": 0.89
        },
        "labelConsensus": "majority"
      },
      "alternativeLabels": []
    }
  ],
  "ensembleMetrics": {
    "providersUsed": 2,
    "averageConfidence": 0.92,
    "consensusRate": 1.0
  }
}
```

### Paginated Items Response
```json
{
  "items": [
    {
      "id": "item_123",
      "userId": "user_456",
      "photoUrl": "https://s3.../photo.jpg",
      "thumbnailUrl": "https://s3.../thumb.jpg",
      "detectionData": { ... },
      "labels": [
        {
          "id": "label_789",
          "itemId": "item_123",
          "key": "type",
          "value": "laptop",
          "createdAt": "2024-01-15T10:30:00Z"
        }
      ],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Error Response
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Image format not supported. Accepted: JPEG, PNG, WebP",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_abc123"
}
```

---

## HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET, PATCH requests |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input data |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Resource doesn't exist or user lacks access |
| 409 | Conflict | Duplicate resource (e.g., label already exists) |
| 413 | Payload Too Large | Image exceeds 10MB limit |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 503 | Service Unavailable | Vision providers down, circuit breaker open |

---

## Authentication

### JWT Token Structure
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "roles": ["user"],
  "iat": 1234567890,
  "exp": 1234571490
}
```

### Authorization Header
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Lifecycle
- Access Token: 1 hour expiration
- Refresh Token: 7 days expiration
- Refresh endpoint: `/v1/auth/refresh` (if implemented)

---

## Rate Limits

| User Type | Limit | Window |
|-----------|-------|--------|
| Free | 50 requests | 1 minute |
| Premium | 200 requests | 1 minute |
| Admin | Unlimited | - |

Rate limit headers:
```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1234567890
```

---

## Image Requirements

| Property | Requirement |
|----------|-------------|
| Max File Size | 10 MB |
| Formats | JPEG, PNG, WebP |
| Max Dimension | 2048px (auto-resized) |
| Thumbnail Size | 256x256px (auto-generated) |

---

## Caching

| Resource | TTL | Cache Key |
|----------|-----|-----------|
| Detection Results | 24 hours | `detection:{imageHash}` |
| Search Results | 5 minutes | `search:{userId}:{query}:{filters}` |
| User Items | 10 minutes | `user:{userId}:items:{pagination}` |
| Provider Health | 1 minute | `health:{provider}` |

---

## Database Indexes

Performance-critical indexes:
```sql
-- User lookup
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- Item queries
CREATE INDEX idx_inventory_items_user_id ON inventory_items(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_items_created_at ON inventory_items(created_at DESC);
CREATE INDEX idx_inventory_items_updated_at ON inventory_items(updated_at DESC);

-- Label search
CREATE INDEX idx_label_search_fts_vector ON label_search_fts USING gin(search_vector);

-- JSONB queries
CREATE INDEX idx_inventory_items_detection_data_gin
  ON inventory_items USING gin (detection_data jsonb_path_ops);
```

---

## Environment Variables

### Required
```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_HOST=localhost
JWT_SECRET=your-secret-key
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
GOOGLE_APPLICATION_CREDENTIALS=/path/to/creds.json
```

### Optional (with defaults)
```bash
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
PROVIDER_TIMEOUT_MS=4000
ENSEMBLE_CONFIDENCE_THRESHOLD=0.7
RATE_LIMIT_MAX=100
MAX_IMAGE_SIZE_MB=10
```

---

## Common Query Parameters

### Pagination
```
?page=1&limit=20
```

### Sorting
```
?sort=createdAt_desc
?sort=createdAt_asc
?sort=updatedAt_desc
?sort=confidence_desc
```

### Filtering
```
?minConfidence=0.8
?startDate=2024-01-01T00:00:00Z
?endDate=2024-01-31T23:59:59Z
```

### Search
```
?q=laptop
?q=laptop%20black%20apple
```

---

## Service Health Check

### Request
```bash
curl https://api.homeinventory.app/v1/health
```

### Response
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "providers": {
    "google": true,
    "aws": true,
    "mock": false
  },
  "database": {
    "connected": true,
    "responseTimeMs": 12
  },
  "cache": {
    "connected": true,
    "responseTimeMs": 3
  }
}
```

---

## Circuit Breaker States

| State | Behavior | Transition |
|-------|----------|------------|
| CLOSED | Normal operation | → OPEN after 5 failures |
| OPEN | Reject all requests | → HALF-OPEN after 30s |
| HALF-OPEN | Test with limited requests | → CLOSED after 3 successes<br>→ OPEN on failure |

---

## Retry Configuration

```typescript
{
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'Rate limit exceeded',
    'Service unavailable'
  ]
}
```

Delays: 1s → 2s → 4s (with 30% jitter)

---

## Sync Conflict Resolution

Strategy: Last-Write-Wins (LWW)

```json
{
  "conflicts": [
    {
      "itemId": "item_123",
      "field": "labels",
      "clientValue": "bedroom",
      "serverValue": "living room",
      "resolution": "server_wins"
    }
  ]
}
```

Resolution based on `updated_at` timestamp comparison.

---

## Ensemble Modes

| Mode | Providers Used | Description |
|------|----------------|-------------|
| full | 4 | All providers succeeded |
| partial | 2-3 | Some providers succeeded |
| single | 1 | Only one provider succeeded |
| none | 0 | All providers failed |

---

## Search Ranking

PostgreSQL `ts_rank` calculation:
```sql
ORDER BY
  ts_rank(search_vector, plainto_tsquery('english', query)) DESC,
  created_at DESC
```

Factors:
1. Term frequency in document
2. Number of unique query terms matched
3. Document length normalization
4. Proximity of terms

---

## Useful SQL Queries

### Find items with high confidence
```sql
SELECT * FROM inventory_items
WHERE user_id = $1
  AND (detection_data -> 'ensembleMetrics' ->> 'averageConfidence')::numeric >= 0.9
  AND deleted_at IS NULL;
```

### Count items per user
```sql
SELECT user_id, COUNT(*) as item_count
FROM inventory_items
WHERE deleted_at IS NULL
GROUP BY user_id;
```

### Search by label
```sql
SELECT DISTINCT i.*
FROM inventory_items i
JOIN labels l ON i.id = l.item_id
WHERE i.user_id = $1
  AND l.value ILIKE '%laptop%'
  AND i.deleted_at IS NULL;
```

---

## Performance Benchmarks

Target metrics:
- Detection endpoint: < 5s (p95)
- List items: < 200ms (p95)
- Search: < 500ms (p95)
- Sync pull: < 1s for 100 items (p95)

---

## Monitoring Metrics

### RED Metrics
- **Rate**: Requests per second
- **Errors**: Error rate (%)
- **Duration**: Response time (p50, p95, p99)

### Custom Metrics
- Circuit breaker state changes
- Cache hit/miss ratio
- Provider response times
- Database query duration
- S3 upload duration

---

## Logging Best Practices

```typescript
logger.info({ userId, itemId }, 'Item created successfully');
logger.warn({ provider: 'google', error }, 'Provider failed');
logger.error({ err, requestId }, 'Unhandled error');
```

Include context:
- `userId` - for user tracking
- `requestId` - for request correlation
- `provider` - for provider-specific issues
- `itemId` - for resource identification

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid or expired token" | JWT expired or malformed | Request new token |
| "Image format not supported" | Wrong file type | Use JPEG, PNG, or WebP |
| "Circuit breaker is OPEN" | Provider failures | Wait and retry |
| "Rate limit exceeded" | Too many requests | Wait 60s or upgrade plan |
| "Item not found or access denied" | Wrong itemId or not owner | Verify itemId and ownership |

---

## Troubleshooting Checklist

1. Check JWT token expiration
2. Verify request headers (Authorization, Content-Type)
3. Validate request body against schema
4. Check service health endpoint
5. Review circuit breaker states in logs
6. Verify database connectivity
7. Check Redis connectivity
8. Review rate limit headers
9. Validate image format and size
10. Check network connectivity to external services

---

## Support Resources

- Architecture: `/docs/ARCHITECTURE.md`
- OpenAPI Spec: `/docs/OPENAPI.yaml`
- Implementation Guide: `/docs/IMPLEMENTATION_GUIDE.md`
- Database Schema: `/database/schema.sql`

For additional help, check logs with correlation `requestId` for detailed error context.
