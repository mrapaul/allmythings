# API Service Testing Guide

Comprehensive testing guide for the Visual Home Inventory Manager API service.

## Overview

This project includes comprehensive contract and integration tests using Vitest and Supertest:

- **Contract Tests**: Validate API responses match OpenAPI specifications
- **Integration Tests**: Test all endpoints with real HTTP requests
- **Load Tests**: Validate performance under concurrent load
- **Error Handling Tests**: Verify error responses and status codes
- **Authentication Tests**: Validate JWT token handling

## Test Structure

```
api-service/src/__tests__/
├── contract/
│   └── api-contract.test.ts          # Contract and schema validation tests
├── integration/
│   ├── detect.integration.test.ts    # Detection endpoint tests
│   ├── items.integration.test.ts     # Items CRUD tests
│   ├── labels.integration.test.ts    # Labels tests
│   ├── search.integration.test.ts    # Search tests
│   ├── sync.integration.test.ts      # Sync endpoint tests
│   ├── auth.integration.test.ts      # Authentication tests
│   ├── error-handling.integration.test.ts # Error handling tests
│   └── load.integration.test.ts      # Load/performance tests
├── fixtures/
│   └── test-data.ts                  # Test data factories and fixtures
├── utils/
│   ├── test-app.ts                   # Test app factory
│   ├── test-auth.ts                  # Authentication utilities
│   └── test-db.ts                    # Database utilities
└── setup.ts                          # Global test setup
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm test -- src/__tests__/contract/api-contract.test.ts
```

### Run Tests Matching Pattern
```bash
npm test -- --grep "Detection"
```

### Run Only Integration Tests
```bash
npm test -- src/__tests__/integration/
```

### Run Only Contract Tests
```bash
npm test -- src/__tests__/contract/
```

### Run E2E Tests (requires running API)
```bash
npm run test:e2e
```

## Test Categories

### 1. Contract Tests (`api-contract.test.ts`)

Validates API responses match OpenAPI specifications and Zod schemas.

**Coverage:**
- Health endpoint response format
- Detection response schema validation
- Inventory item schema validation
- Paginated responses
- HTTP status codes (401, 404, 400)
- Error response format consistency
- CORS headers
- Content-Type validation

**Running:**
```bash
npm test -- api-contract.test.ts
```

### 2. Detection Endpoint Tests (`detect.integration.test.ts`)

Tests the POST /v1/detect endpoint for image object detection.

**Coverage:**
- Valid image upload and detection
- Invalid image handling
- Large file rejection (>10MB)
- Missing required fields
- minConfidence parameter validation
- Bounding box validation
- Ensemble details inclusion
- Authentication validation
- Multiple concurrent requests

**Running:**
```bash
npm test -- detect.integration.test.ts
```

### 3. Items Endpoint Tests (`items.integration.test.ts`)

Tests CRUD operations on /v1/items endpoint.

**Coverage:**
- POST /v1/items - Create inventory item
  - Valid item creation
  - Detection data storage
  - Initial labels creation
  - Field validation (required fields)
  - Authentication required

- GET /v1/items - List items
  - Pagination support
  - Sort options
  - Filtering by minConfidence
  - User data isolation
  - Invalid parameters handling

- GET /v1/items/:id - Retrieve single item
  - Successful retrieval
  - 404 for non-existent items
  - 403 for other user's items
  - Authentication required

- PATCH /v1/items/:id - Update item
  - Update photoUrl
  - Update thumbnailUrl
  - 404 for non-existent items
  - 403 for other user's items

- DELETE /v1/items/:id - Delete item
  - Soft delete behavior
  - Item not visible after deletion
  - 404 for non-existent items
  - 403 for other user's items

**Running:**
```bash
npm test -- items.integration.test.ts
```

### 4. Labels Endpoint Tests (`labels.integration.test.ts`)

Tests label management endpoints.

**Coverage:**
- POST /v1/labels - Create label
- PATCH /v1/labels/:id - Update label
- DELETE /v1/labels/:id - Delete label
- Required fields validation
- Authentication validation

**Running:**
```bash
npm test -- labels.integration.test.ts
```

### 5. Search Endpoint Tests (`search.integration.test.ts`)

Tests full-text search functionality.

**Coverage:**
- Full-text search with query parameter
- Empty search handling
- Pagination support
- Missing query parameter handling
- Authentication required

**Running:**
```bash
npm test -- search.integration.test.ts
```

### 6. Sync Endpoint Tests (`sync.integration.test.ts`)

Tests offline-first synchronization endpoints.

**Coverage:**
- GET /v1/sync - Pull changes since timestamp
- POST /v1/sync - Push changes to server
- Batch operations
- Conflict resolution
- Authentication required

**Running:**
```bash
npm test -- sync.integration.test.ts
```

### 7. Authentication Tests (`auth.integration.test.ts`)

Tests JWT token validation and user context extraction.

**Coverage:**
- Valid JWT token acceptance
- Invalid token rejection
- Missing token handling
- Bearer prefix validation
- Token format validation
- userId extraction from token
- Email extraction from token
- Multi-user support

**Running:**
```bash
npm test -- auth.integration.test.ts
```

### 8. Error Handling Tests (`error-handling.integration.test.ts`)

Tests error responses and HTTP status codes.

**Coverage:**
- 400 Bad Request (validation errors)
- 401 Unauthorized (missing/invalid token)
- 403 Forbidden (data isolation)
- 404 Not Found (non-existent resources)
- 413 Payload Too Large (file size)
- Error response format consistency
- Error timestamp validation
- HTTP status matching response body

**Running:**
```bash
npm test -- error-handling.integration.test.ts
```

### 9. Load Tests (`load.integration.test.ts`)

Tests performance under concurrent load.

**Coverage:**
- 10 concurrent list requests
- Concurrent requests from different users
- Large pagination limits (100 items)
- Multiple page navigation
- Bulk sync operations (50+ items)
- Rate limiting
- Response time validation (<5 seconds)

**Running:**
```bash
npm test -- load.integration.test.ts
```

## Test Data Fixtures

Test data is generated using factory functions in `src/__tests__/fixtures/test-data.ts`:

```typescript
// Create test detection object
const detection = createTestDetection();
const detection = createTestDetection({ label: 'table', confidence: 0.95 });

// Create test detection response
const response = createTestDetectionResponse();

// Create test item request
const item = createTestItemRequest();
const item = createTestItemRequest({ initialLabels: [...] });

// Create image buffers
const imageBuffer = createTestImageBuffer();
const largeImage = createLargeImageBuffer(11); // 11 MB
const invalidImage = createInvalidImageBuffer();

// Create labels
const label = createTestLabel({ value: 'new-location' });

// Create search queries
const query = createTestSearchQuery();

// Create sync data
const syncData = createTestSyncData();
```

## Authentication Utilities

Authentication helpers in `src/__tests__/utils/test-auth.ts`:

```typescript
// Create test token payload
const token = createTestToken();
const token = createTestToken({ userId: 'custom-id' });

// Generate Authorization header
const header = createAuthHeader();
const header = createAuthHeader('user-123', 'user@example.com');

// Create test user ID
const userId = createTestUserId();

// Create multiple test tokens
const users = createMultipleTestTokens(5);
// Returns: [{ userId, token }, ...]
```

## Database Utilities

Database helpers in `src/__tests__/utils/test-db.ts`:

```typescript
// Clear all tables
await clearDatabase();

// Seed test data
const { itemIds, labelIds } = await seedTestData();

// Execute with transaction
await withTransaction(async (db) => {
  // Transaction operations
});

// Reset database to clean state
await resetDatabase();

// Check database health
const isHealthy = await checkDatabaseHealth();
```

## Test App Factory

App factory in `src/__tests__/utils/test-app.ts`:

```typescript
// Get or create test app
const app = await getTestApp();

// Close test app
await closeTestApp();

// Reset app (close and recreate)
const newApp = await resetTestApp();
```

## Configuration

### Vitest Configuration (`vitest.config.ts`)

```typescript
{
  environment: 'node',
  globals: true,
  testTimeout: 30000,
  coverage: {
    provider: 'v8',
    lines: 70,      // 70% line coverage required
    functions: 70,  // 70% function coverage required
    branches: 65,   // 65% branch coverage required
    statements: 70, // 70% statement coverage required
  },
  setupFiles: ['./src/__tests__/setup.ts'],
}
```

### Setup File (`setup.ts`)

- Runs before all tests
- Configures test environment
- Suppresses logging during tests
- Handles global cleanup

## Coverage Requirements

Current coverage targets:
- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 65%
- **Statements**: 70%

Generate coverage report:
```bash
npm run test:coverage
```

Coverage report location: `coverage/index.html`

## Best Practices

### 1. Test Isolation
- Each test is independent
- Database resets between tests
- No shared state between tests
- Use `beforeEach` for setup, `afterEach` for cleanup

### 2. Test Naming
```typescript
describe('Component/Endpoint', () => {
  describe('Feature/Method', () => {
    it('should do something specific', () => {
      // Test
    });
  });
});
```

### 3. Assertions
```typescript
// Good - specific
expect(response.status).toBe(200);
expect(response.body).toHaveProperty('items');

// Less specific
expect(response).toBeTruthy();
```

### 4. Error Testing
```typescript
// Test both success and error cases
it('should handle valid input', () => { /* ... */ });
it('should reject invalid input', () => { /* ... */ });
it('should return 401 without auth', () => { /* ... */ });
```

### 5. Async/Await
```typescript
// Use async/await for clarity
it('should create item', async () => {
  const response = await request.post('/v1/items')...
  expect(response.status).toBe(201);
});
```

## Debugging Tests

### Run Single Test
```bash
npm test -- --grep "should create item"
```

### Run with Debug Output
```bash
DEBUG=* npm test
```

### Run with Verbose Output
```bash
npm test -- --reporter=verbose
```

### Inspect Test Environment
Add `console.log()` statements - they'll be suppressed but visible with:
```bash
npm test -- --reporter=verbose
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Troubleshooting

### Tests Timeout
- Increase `testTimeout` in vitest.config.ts
- Check if external services are slow
- Review test for blocking operations

### Database Errors
- Ensure PostgreSQL is running
- Check database connection string in .env
- Verify tables are created
- Run `resetDatabase()` in beforeEach

### Authentication Failures
- Verify token format in createAuthHeader()
- Check auth middleware implementation
- Ensure userId is properly extracted

### Coverage Below Target
- Add tests for error paths
- Test edge cases
- Cover all branches
- Test integration scenarios

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Zod Validation](https://zod.dev)
- [Fastify Testing](https://www.fastify.io/docs/latest/Guides/Testing/)
