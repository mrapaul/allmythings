# Quick Start - Testing Guide

Get up and running with API testing in 5 minutes.

## Installation

```bash
cd api-service
npm install
```

## Run Tests

### All Tests
```bash
npm test
```

### Watch Mode (auto-rerun on file changes)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Specific Test File
```bash
npm test -- src/__tests__/contract/api-contract.test.ts
```

## Test Suites

| Suite | Command | Tests |
|-------|---------|-------|
| Contract | `npm test -- api-contract.test.ts` | Schema validation, HTTP status codes |
| Detection | `npm test -- detect.integration.test.ts` | Image upload, detection results |
| Items | `npm test -- items.integration.test.ts` | CRUD operations, pagination |
| Labels | `npm test -- labels.integration.test.ts` | Label management |
| Search | `npm test -- search.integration.test.ts` | Full-text search |
| Sync | `npm test -- sync.integration.test.ts` | Offline sync |
| Auth | `npm test -- auth.integration.test.ts` | JWT validation |
| Errors | `npm test -- error-handling.integration.test.ts` | Error responses |
| Load | `npm test -- load.integration.test.ts` | Concurrent requests |

## Common Tasks

### Test Single Feature
```bash
npm test -- --grep "should create item"
```

### Test with Coverage
```bash
npm run test:coverage
```

### View Coverage Report
```bash
open coverage/index.html
```

### Debug Tests
```bash
npm test -- --reporter=verbose
```

## Test Structure

- **Contract Tests**: Validate response schemas match API spec
- **Integration Tests**: Test HTTP endpoints with real requests
- **Fixtures**: Reusable test data factories
- **Utilities**: Authentication, database, app helpers

## Key Files

```
src/__tests__/
├── contract/api-contract.test.ts       # Schema validation
├── integration/
│   ├── detect.integration.test.ts      # Detection endpoint
│   ├── items.integration.test.ts       # Items CRUD
│   ├── labels.integration.test.ts      # Labels
│   ├── search.integration.test.ts      # Search
│   ├── sync.integration.test.ts        # Sync
│   ├── auth.integration.test.ts        # Authentication
│   ├── error-handling.integration.test.ts # Errors
│   └── load.integration.test.ts        # Load tests
├── fixtures/test-data.ts               # Test data factories
├── utils/
│   ├── test-app.ts                     # App factory
│   ├── test-auth.ts                    # Auth helpers
│   └── test-db.ts                      # DB utilities
└── setup.ts                            # Global setup
```

## Writing Tests

### Basic Test
```typescript
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('should do something', async () => {
    const response = await request.get('/v1/items')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
  });
});
```

### Using Fixtures
```typescript
import { createTestItemRequest, createAuthHeader } from '../fixtures/test-data';

const item = createTestItemRequest();
const header = createAuthHeader('user-123');
```

### Testing Errors
```typescript
it('should return 401 without auth', async () => {
  const response = await request.get('/v1/items');
  expect(response.status).toBe(401);
});
```

## Coverage Goals

- Lines: 70%
- Functions: 70%
- Branches: 65%
- Statements: 70%

Check coverage:
```bash
npm run test:coverage
```

## Troubleshooting

### Tests Timeout
- Increase timeout in vitest.config.ts
- Check external service latency

### Database Connection Failed
- Ensure PostgreSQL is running
- Check DATABASE_URL environment variable

### Import Errors
- Run `npm install`
- Check TypeScript compilation: `npm run type-check`

## Environment Variables

For testing, set:
```bash
NODE_ENV=test
LOG_LEVEL=silent
DATABASE_URL=postgres://user:pass@localhost/testdb
```

## CI/CD

Tests run automatically on:
- Push to main/develop branches
- Pull requests to main/develop

See `.github/workflows/test-api.yml`

## Resources

- [Vitest Docs](https://vitest.dev)
- [Supertest Docs](https://github.com/visionmedia/supertest)
- [Full Testing Guide](./TESTING.md)
