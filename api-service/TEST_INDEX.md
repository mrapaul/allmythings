# API Service Test Suite Index

## Quick Navigation

### For First-Time Users
1. Start here: **[QUICK_START_TESTS.md](./QUICK_START_TESTS.md)** (5-minute setup)
2. Learn more: **[TESTING.md](./TESTING.md)** (comprehensive guide)

### For Developers
- **Run tests**: `npm test`
- **Watch mode**: `npm run test:watch`
- **Coverage**: `npm run test:coverage`

### For CI/CD Engineers
- Workflow: **[.github/workflows/test-api.yml](../.github/workflows/test-api.yml)**
- Configuration: **[vitest.config.ts](./vitest.config.ts)**

## Test Suites Overview

### 1. Contract Tests (Schema Validation)
📄 `src/__tests__/contract/api-contract.test.ts`
- Validates response schemas match OpenAPI spec
- Tests HTTP status codes
- Verifies error response format
- Checks CORS headers and content types

Run: `npm test -- api-contract.test.ts`

### 2. Detection Endpoint Tests
📄 `src/__tests__/integration/detect.integration.test.ts`
- Image upload and processing
- Invalid image handling
- File size limits (10MB)
- minConfidence parameter
- Authentication validation

Run: `npm test -- detect.integration.test.ts`

### 3. Items Endpoint Tests
📄 `src/__tests__/integration/items.integration.test.ts`
- CREATE: POST /v1/items
- READ: GET /v1/items (list), GET /v1/items/:id (single)
- UPDATE: PATCH /v1/items/:id
- DELETE: DELETE /v1/items/:id
- Pagination, filtering, sorting
- User data isolation

Run: `npm test -- items.integration.test.ts`

### 4. Labels Endpoint Tests
📄 `src/__tests__/integration/labels.integration.test.ts`
- Create custom labels: POST /v1/labels
- Update labels: PATCH /v1/labels/:id
- Delete labels: DELETE /v1/labels/:id

Run: `npm test -- labels.integration.test.ts`

### 5. Search Endpoint Tests
📄 `src/__tests__/integration/search.integration.test.ts`
- Full-text search: GET /v1/search
- Query parameters and pagination
- Empty search handling

Run: `npm test -- search.integration.test.ts`

### 6. Sync Endpoint Tests
📄 `src/__tests__/integration/sync.integration.test.ts`
- Pull changes: GET /v1/sync
- Push changes: POST /v1/sync
- Batch operations
- Offline sync

Run: `npm test -- sync.integration.test.ts`

### 7. Authentication Tests
📄 `src/__tests__/integration/auth.integration.test.ts`
- JWT token validation
- Bearer prefix handling
- User context extraction
- Multi-user support

Run: `npm test -- auth.integration.test.ts`

### 8. Error Handling Tests
📄 `src/__tests__/integration/error-handling.integration.test.ts`
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 413 Payload Too Large
- Error response consistency

Run: `npm test -- error-handling.integration.test.ts`

### 9. Load Testing Tests
📄 `src/__tests__/integration/load.integration.test.ts`
- 10+ concurrent requests
- Large pagination (1000+ items)
- Bulk sync operations
- Rate limiting
- Response time validation

Run: `npm test -- load.integration.test.ts`

## Utilities and Helpers

### Test Data Factories
📄 `src/__tests__/fixtures/test-data.ts`
```typescript
createTestDetection()           // Detection object
createTestDetectionResponse()   // Full response
createTestItemRequest()         // Item data
createTestImageBuffer()         // Valid image
createLargeImageBuffer(size)    // Large file
createInvalidImageBuffer()      // Invalid image
createTestLabel()               // Label data
```

### Authentication Helpers
📄 `src/__tests__/utils/test-auth.ts`
```typescript
createAuthHeader()              // Auth header
createTestUserId()              // Unique user ID
createMultipleTestTokens(n)     // Multiple users
createTestToken()               // JWT payload
```

### Database Utilities
📄 `src/__tests__/utils/test-db.ts`
```typescript
resetDatabase()                 // Clean state
clearDatabase()                 // Truncate tables
seedTestData()                  // Populate data
checkDatabaseHealth()           // DB status
```

### App Factory
📄 `src/__tests__/utils/test-app.ts`
```typescript
getTestApp()                    // Get/create app
closeTestApp()                  // Close app
resetTestApp()                  // Reset instance
```

## Common Commands

```bash
# Run everything
npm test

# Run with live updates
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific suite
npm test -- detect.integration.test.ts

# Run matching pattern
npm test -- --grep "should create"

# Run with verbose output
npm test -- --reporter=verbose

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check
```

## Directory Structure

```
api-service/
├── src/
│   └── __tests__/
│       ├── contract/
│       │   └── api-contract.test.ts
│       ├── integration/
│       │   ├── auth.integration.test.ts
│       │   ├── detect.integration.test.ts
│       │   ├── error-handling.integration.test.ts
│       │   ├── items.integration.test.ts
│       │   ├── labels.integration.test.ts
│       │   ├── load.integration.test.ts
│       │   ├── search.integration.test.ts
│       │   └── sync.integration.test.ts
│       ├── fixtures/
│       │   └── test-data.ts
│       ├── utils/
│       │   ├── test-app.ts
│       │   ├── test-auth.ts
│       │   └── test-db.ts
│       └── setup.ts
├── vitest.config.ts
├── TESTING.md                     (Comprehensive guide)
├── QUICK_START_TESTS.md          (5-minute setup)
└── TEST_INDEX.md                 (This file)

.github/
└── workflows/
    └── test-api.yml              (CI/CD configuration)
```

## Coverage Requirements

- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 65%
- **Statements**: 70%

Check coverage:
```bash
npm run test:coverage
open coverage/index.html
```

## CI/CD Integration

Tests automatically run on:
- Push to `main` or `develop`
- Pull requests to `main` or `develop`
- Changes to `api-service/**`

Configuration: `.github/workflows/test-api.yml`

## Endpoints Tested

| Method | Path | Status | Tests |
|--------|------|--------|-------|
| GET | / | ✅ | Schema |
| GET | /v1/health | ✅ | Contract |
| POST | /v1/detect | ✅ | 18 tests |
| GET | /v1/items | ✅ | 9 tests |
| POST | /v1/items | ✅ | 6 tests |
| GET | /v1/items/:id | ✅ | 4 tests |
| PATCH | /v1/items/:id | ✅ | 4 tests |
| DELETE | /v1/items/:id | ✅ | 5 tests |
| POST | /v1/labels | ✅ | 3 tests |
| PATCH | /v1/labels/:id | ✅ | 2 tests |
| DELETE | /v1/labels/:id | ✅ | 2 tests |
| GET | /v1/search | ✅ | 5 tests |
| GET | /v1/sync | ✅ | 3 tests |
| POST | /v1/sync | ✅ | 3 tests |

**Total: 112 test cases**

## Getting Help

- **Quick answers**: See `QUICK_START_TESTS.md`
- **Detailed info**: See `TESTING.md`
- **Implementation details**: See `TEST_IMPLEMENTATION_SUMMARY.md`
- **Test examples**: See individual test files
- **Configuration**: See `vitest.config.ts`

## Support Resources

- [Vitest Documentation](https://vitest.dev)
- [Supertest Guide](https://github.com/visionmedia/supertest)
- [Zod Validation](https://zod.dev)
- [Fastify Testing](https://www.fastify.io/docs/latest/Guides/Testing/)

## Key Features

✅ 9 comprehensive test suites
✅ 112 test cases covering all endpoints
✅ Contract tests for schema validation
✅ Integration tests with real HTTP requests
✅ Load and performance testing
✅ Authentication and authorization testing
✅ Error handling validation
✅ User data isolation verification
✅ Test data factories and fixtures
✅ Database transaction support
✅ GitHub Actions CI/CD
✅ Coverage reporting
✅ TypeScript support

## Next Steps

1. Read `QUICK_START_TESTS.md`
2. Run `npm test` to verify setup
3. Explore individual test files
4. Check coverage: `npm run test:coverage`
5. Read `TESTING.md` for advanced usage

---

**Last Updated**: November 18, 2025
**Status**: Complete and ready for use
