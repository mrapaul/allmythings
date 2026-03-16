# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Visual Home Inventory Manager** is an AI-powered mobile app with Instagram-style UI and multi-provider vision AI integration. The project is split into two main services:

1. **Mobile App** (`/mobile-app`): Flutter 3.16+ with Riverpod state management, Drift ORM, and offline-first architecture
2. **API Service** (`/api-service`): Node.js 20+ with Fastify, TypeScript, and ensemble AI vision providers

## Architecture Overview

### System Design

```
Mobile App (Flutter)
├── Presentation Layer (UI Components)
├── Application Layer (Riverpod Providers, State Management)
├── Data Layer (Repositories, Drift ORM Database)
└── Domain Layer (Models, Services)
        ↓ (API calls)
API Service (Node.js/Fastify)
├── Routes (HTTP endpoints)
├── Services (Business logic)
├── Adapters (Vision AI providers)
└── Utils (Helpers, logging)
        ↓ (API calls)
Vision Providers (Google Vision, AWS Rekognition, Mock)
```

### Key Architecture Patterns

- **Mobile App**: Clean Architecture with Riverpod for reactive state management
  - `lib/presentation/` - UI components and screens
  - `lib/application/` - Business logic via Riverpod providers (state, logic)
  - `lib/data/` - Repositories, API client, Drift database
  - `lib/domain/` - Models, service interfaces, pure business logic

- **API Service**: Service-oriented architecture with adapter pattern
  - Routes delegate to services via handlers
  - `VisionOrchestratorService` coordinates multiple vision providers (Google, AWS, Mock)
  - `EnsembleFusionService` combines results from multiple providers
  - Provider adapters implement `ProviderAdapter` interface for consistency

### Key Dependencies & Patterns

**Mobile App:**
- **Riverpod 3.0**: State management with providers and async value notifiers
- **Drift 2.29**: Type-safe SQLite ORM with code generation
- **Freezed 3.2**: Immutable models with pattern matching
- **GoRouter 17**: Navigation and routing
- **Flutter Hooks**: Functional widget composition

**API Service:**
- **Fastify 4.25**: High-performance HTTP framework
- **Zod 3.22**: Type-safe schema validation
- **Google Cloud Vision**: Object detection via REST
- **AWS Rekognition**: Image analysis via SDK
- **Pino**: Structured logging

## Common Development Commands

### Setup & Installation

```bash
make setup              # Install all dependencies and generate code
make install           # Install all dependencies
make install-api       # Install API dependencies only
make install-mobile    # Install Flutter dependencies only
```

### Development

```bash
make dev               # Start API and mobile app in parallel (requires two terminals)
make dev-api           # Start API server on http://localhost:14000 (watch mode)
make dev-mobile        # Start Flutter app (connects to hot reload)
```

### Building

```bash
make build             # Build both API and mobile app
make build-api         # Build API (TypeScript compilation)
make build-mobile      # Build Flutter app for release
```

### Testing & Code Quality

```bash
# Testing
make test              # Run all tests (API + Mobile)
make test-api          # Run API unit tests with Vitest
make test-mobile       # Run Flutter unit tests

# Linting & Formatting
make lint              # Run all linters
make lint-api          # Run ESLint on API code
make lint-mobile       # Run Flutter analyzer
make format            # Format all code
make format-api        # Format API with Prettier
make format-mobile     # Format Flutter with dart format

# Code Generation
make generate          # Run Flutter build_runner for code generation
```

### Advanced Testing

```bash
# From project root:
./build-and-test.sh         # Comprehensive verification before building
./test-e2e.sh               # End-to-end workflow test
./test-all-platforms.sh     # Test on multiple platforms
```

### Cleanup

```bash
make clean             # Remove all build artifacts and dependencies
make clean-api         # Clean API (removes dist/, node_modules/)
make clean-mobile      # Clean Flutter app (flutter clean)
```

## API Service Development

### Endpoints

- `GET /v1/health` - Health check with provider status
- `POST /v1/detect` - Image object detection (multipart file upload)
- `GET /` - Service info and available endpoints

### Adding a New Vision Provider

1. Create adapter in `src/adapters/provider-name.adapter.ts` implementing `ProviderAdapter` interface
2. Register in `VisionOrchestratorService` constructor
3. Add provider-specific environment variables in `src/config/env.config.ts`
4. Test with mock data in development mode

### Running API in Development

```bash
cd api-service
npm run dev            # Start with tsx watch (auto-reload on changes)
npm run type-check     # Type checking without building
npm run lint:fix       # Auto-fix linting issues
npm test               # Run unit tests (Vitest)
npm run test:watch     # Watch mode for tests
```

### Key Services

- **VisionOrchestratorService** (`src/services/vision-orchestrator.service.ts`): Manages multiple vision providers, handles health checks, coordinates detection
- **EnsembleFusionService** (`src/services/ensemble-fusion.service.ts`): Combines results from multiple providers with weighting
- **ProviderAdapters** (`src/adapters/`): Normalize output from different vision APIs (Google Vision, AWS Rekognition, Mock)

## Mobile App Development

### Running the App

```bash
cd mobile-app
flutter pub get         # Install dependencies
flutter run             # Run on connected device/emulator
flutter run -v          # Verbose output for debugging
```

### Key Providers (Riverpod)

Located in `lib/application/providers/`:

- **detection_providers.dart**: Vision API calls and detection state
- **inventory_providers.dart**: Inventory management and searching
- **camera_providers.dart**: Camera initialization and frame capture
- **database_provider.dart**: Drift database instance
- **image_picker_provider.dart**: Image selection from gallery/camera
- **search_providers.dart**: Search history and FTS queries

### Code Generation

```bash
cd mobile-app
flutter pub run build_runner build --delete-conflicting-outputs
```

This generates:
- Freezed models (`.freezed.dart` files)
- Riverpod providers (from `@riverpod` annotations)
- Drift database code (`.g.dart` files)

### Database (Drift)

- Defined in `lib/data/database/app_database.dart`
- Tables in `lib/data/database/tables/`
- Run code generation after modifying schema
- Supports migrations and offline-first sync

### Key Screens

- `lib/presentation/home/inventory_feed_screen.dart` - Main feed (Instagram-style)
- `lib/presentation/detection/detection_results_screen.dart` - Detection results from camera
- `lib/presentation/items/item_detail_screen.dart` - Item details and label editing
- `lib/presentation/search/search_screen.dart` - Full-text search with label filters

## Code Style & Standards

### API Service (TypeScript)

- **ESLint**: Enforces code quality rules
- **Prettier**: Automatic code formatting (3 space indentation)
- **Strict TypeScript**: `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`
- Run `npm run lint:fix` to auto-fix issues

### Mobile App (Flutter/Dart)

- **Very Good Analysis**: Comprehensive linting rules
- **Dart Format**: Standard formatting (`dart format .`)
- Run `flutter analyze` to check for issues
- Freezed models for immutability and pattern matching
- Riverpod for reactive state without boilerplate

## Testing Strategy

### API Tests (Vitest)

```bash
cd api-service
npm test                    # Run all unit tests
npm test -- --watch         # Watch mode
npm run test:coverage       # Coverage report
npm run test:e2e            # Integration tests (requires running API)
```

Test files: `api-service/tests/unit/` and `api-service/tests/integration/`

### Mobile Tests (Flutter)

```bash
cd mobile-app
flutter test                # Run all unit tests
flutter test --watch        # Watch mode
```

Integration tests: `mobile-app/integration_test/`

## Debugging & Troubleshooting

### API Service Debugging

- Enable Pino logging with `NODE_ENV=development`
- Check logs: `npm run dev 2>&1 | grep -i error`
- Type errors: `npm run type-check`
- Port conflicts: `lsof -i :14000` (or your PORT)

### Mobile App Debugging

- Use DevTools: `flutter pub global run devtools`
- Enable verbose logging: `flutter run -v`
- Check database: Use Drift's built-in debugging
- Emulator issues: `flutter clean && flutter pub get && flutter run`

### API Server Won't Start

1. Check port availability: `lsof -i :14000`
2. Kill existing process: `pkill -f "node.*api-service"`
3. Clear dependencies: `make clean-api && make install-api`
4. Type check: `npm run type-check`

### Flutter App Build Issues

1. Clean everything: `make clean-mobile`
2. Get dependencies: `flutter pub get`
3. Regenerate code: `flutter pub run build_runner clean && flutter pub run build_runner build --delete-conflicting-outputs`
4. Check Flutter health: `flutter doctor`

## Environment Configuration

### API Service

Set in `.env` or via `envConfig` in `src/config/env.config.ts`:

```
PORT=14000
NODE_ENV=development
GOOGLE_PROJECT_ID=your-project-id
AWS_REGION=us-east-1
```

In development with default credentials, the API automatically uses `MockVisionAdapter`.

### Mobile App

Configuration in `lib/core/config/app_config.dart`:
- API base URL
- Feature flags
- Database initialization

## Git Workflow

- Work on feature branches from `feature/` prefix
- Ensure tests pass before committing
- Run linters and formatters: `make lint` and `make format`
- Comprehensive test: `./build-and-test.sh`

## Performance Considerations

### API Service

- Image size limited to 10MB (multipart upload)
- Rate limiting: 100 requests per minute
- CORS enabled for all origins in development
- Circuit breaker pattern for failing providers

### Mobile App

- Offline-first with Drift local database
- Caching via `cached_network_image`
- Full-text search (FTS) for label queries
- Image processing before upload (compression, resizing)

## Additional Resources

- README.md: Project overview and quick start
- build-and-test.sh: Comprehensive verification script
- Architecture decisions in comments throughout the codebase
