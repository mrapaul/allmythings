# Developer Quickstart: Visual Home Inventory Manager

**Feature**: Visual Home Inventory Manager
**Date**: 2025-10-18
**Last Updated**: 2025-10-18

## Overview

This guide will help you set up the development environment, understand the architecture, and start contributing to the Visual Home Inventory Manager project.

**Project Structure**:
- `mobile-app/`: Flutter mobile application (iOS + Android)
- `api-service/`: Node.js + TypeScript vision API proxy
- `specs/001-build-a-mobile/`: This feature's specification and planning docs

---

## Prerequisites

### Required Tools

**Mobile Development**:
- Flutter SDK 3.16+ ([install guide](https://docs.flutter.dev/get-started/install))
- Dart SDK 3.2+ (comes with Flutter)
- iOS: Xcode 15+ and CocoaPods
- Android: Android Studio with SDK 29+ (Android 10+)
- VS Code or Android Studio with Flutter plugins

**API Development**:
- Node.js 20 LTS ([install via nvm](https://github.com/nvm-sh/nvm))
- npm 10+ or pnpm 8+ (recommended for speed)
- Docker Desktop (for local cloud services simulation)

**General**:
- Git 2.30+
- Lefthook 1.5+ (git hooks): `npm install -g lefthook`
- Maestro 1.35+ (E2E testing): [install guide](https://maestro.mobile.dev/getting-started/installing-maestro)

### Cloud Accounts (for development)

- **Google Cloud Platform**: For Cloud Vision API
  - Create project at [console.cloud.google.com](https://console.cloud.google.com)
  - Enable Cloud Vision API
  - Create service account and download JSON key
  - Set up billing (free tier: 1000 images/month)

- **AWS** (optional, for fallback):
  - Create account at [aws.amazon.com](https://aws.amazon.com)
  - Enable Rekognition service
  - Create IAM user with Rekognition permissions
  - Get access key ID and secret

---

## Quick Setup (10 minutes)

### 1. Clone Repository

```bash
git clone <repository-url>
cd allmythings
git checkout 001-build-a-mobile
```

### 2. Setup Mobile App

```bash
cd mobile-app

# Install Flutter dependencies
flutter pub get

# Generate code (freezed, json_serializable, drift)
dart run build_runner build --delete-conflicting-outputs

# Verify setup
flutter doctor -v

# Run code analyzer
flutter analyze

# Run tests
flutter test

# Run on iOS simulator
flutter run -d "iPhone 15 Pro"

# Run on Android emulator
flutter run -d emulator-5554
```

### 3. Setup API Service

```bash
cd api-service

# Install Node.js 20 LTS via nvm
nvm install 20
nvm use 20

# Install dependencies
npm install
# or with pnpm (faster)
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env and add your Google Cloud Vision API key
# GOOGLE_CLOUD_PROJECT_ID=your-project-id
# GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
# AWS_ACCESS_KEY_ID=your-access-key (optional)
# AWS_SECRET_ACCESS_KEY=your-secret (optional)

# Run tests
npm test

# Start development server
npm run dev

# Server will start on http://localhost:3000
```

### 4. Setup Git Hooks

```bash
# From repository root
cd allmythings

# Install lefthook hooks
lefthook install

# Verify hooks are installed
lefthook run pre-commit --all-files
```

---

## Project Architecture

### Mobile App (Flutter)

**Architecture**: Clean Architecture with Feature-First Organization

```
mobile-app/src/
├── features/           # Feature modules (camera, inventory, labels, search)
│   ├── camera/
│   │   ├── screens/    # CameraScreen, DetectionResultsScreen
│   │   ├── components/ # CameraPreview, DetectionOverlay
│   │   └── providers/  # Riverpod state management
│   ├── inventory/
│   ├── labels/
│   └── search/
├── core/               # Core infrastructure
│   ├── database/       # Drift database setup
│   ├── models/         # Domain models (InventoryItem, Label)
│   ├── navigation/     # go_router configuration
│   └── theme/          # App theme and styling
├── shared/             # Shared components and utilities
│   ├── components/     # Reusable widgets
│   ├── hooks/          # Custom hooks
│   └── utils/          # Helper functions
└── services/           # External services
    ├── vision_api/     # Vision API client
    └── storage/        # Local file storage
```

**Key Patterns**:
- **Riverpod**: State management and dependency injection
- **Drift**: Type-safe SQLite ORM with migrations
- **freezed**: Immutable models with code generation
- **fpdart**: Functional error handling with Either

**Example Flow** (Camera → Detection → Storage):

```dart
// 1. Capture photo (CameraScreen)
final photo = await cameraController.takePicture();

// 2. Call vision API (VisionRepository)
final result = await ref.read(visionRepositoryProvider)
    .detectObjects(DetectionRequest(imageFile: File(photo.path)));

// 3. Handle result (functional style)
result.fold(
  (failure) => // Show error
  (response) => // Save to database
);

// 4. Save to database (InventoryRepository)
final item = await ref.read(inventoryRepositoryProvider)
    .createItem(
      photoPath: photo.path,
      detectionData: response.detections.first,
    );
```

---

### API Service (Node.js + TypeScript)

**Architecture**: Lightweight proxy service

```
api-service/src/
├── handlers/           # Route handlers
│   └── vision.ts       # POST /detect endpoint
├── integrations/       # Cloud provider SDKs
│   ├── google-vision/  # Google Cloud Vision client
│   └── aws-rekognition/ # AWS Rekognition client (fallback)
├── middleware/         # Express middleware
│   ├── validation.ts   # Zod schema validation
│   ├── rate-limit.ts   # Rate limiting
│   └── error.ts        # Error handling
├── models/             # TypeScript types
│   └── detection.ts    # Detection types
└── utils/              # Utilities
    ├── circuit-breaker.ts  # Circuit breaker pattern
    └── logger.ts           # Pino logger
```

**Key Patterns**:
- **Fastify**: High-performance HTTP server
- **Zod**: Runtime schema validation
- **Circuit Breaker**: Auto-failover between providers
- **Structured Logging**: Pino for JSON logs

**Example Flow** (Receive Image → Detect → Return):

```typescript
// 1. Receive multipart image upload
app.post('/v1/detect', async (request, reply) => {
  const data = await request.file();

  // 2. Validate with Zod
  const validated = DetectionRequestSchema.parse({
    image: data,
    minConfidence: request.body.minConfidence ?? 0.7,
  });

  // 3. Try Google Vision (with circuit breaker)
  try {
    const result = await googleVisionClient.detectObjects(validated);
    return reply.send(result);
  } catch (error) {
    // 4. Fallback to AWS Rekognition
    return awsRekognitionClient.detectObjects(validated);
  }
});
```

---

## Development Workflow

### Daily Development

**1. Start Development Servers**:

```bash
# Terminal 1: API service
cd api-service
npm run dev

# Terminal 2: Mobile app
cd mobile-app
flutter run -d "iPhone 15 Pro"
```

**2. Make Changes** (example: add new label field):

```bash
# 1. Update Drift schema
# Edit: mobile-app/lib/core/database/tables.dart
# Add new column to Labels table

# 2. Run migration
cd mobile-app
dart run build_runner build --delete-conflicting-outputs

# 3. Write tests first (TDD)
# Create: mobile-app/test/core/database/label_dao_test.dart
flutter test test/core/database/label_dao_test.dart

# 4. Implement feature
# Edit: mobile-app/lib/core/database/daos/label_dao.dart

# 5. Run all tests
flutter test

# 6. Check code coverage
flutter test --coverage
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html
```

**3. Commit Changes** (lefthook runs automatically):

```bash
git add .
git commit -m "feat: add label priority field"

# Lefthook runs:
# - dart format
# - flutter analyze
# - flutter test (unit tests only)
# - Prevents commit if failures
```

**4. Push and Create PR**:

```bash
git push origin 001-build-a-mobile

# Create PR on GitHub
# CI runs:
# - All tests (unit, widget, integration)
# - Code coverage check (must be >80%)
# - E2E tests with Maestro
# - Build verification (iOS + Android)
```

---

## Testing Strategy

### Mobile App Testing

**1. Unit Tests** (business logic):

```dart
// test/core/models/bounding_box_test.dart
void main() {
  group('BoundingBox', () {
    test('validates coordinates in 0-1 range', () {
      final box = BoundingBox(x: 0.1, y: 0.2, width: 0.3, height: 0.4);
      expect(box.isValid, isTrue);
    });

    test('rejects coordinates exceeding bounds', () {
      final box = BoundingBox(x: 0.8, y: 0.8, width: 0.5, height: 0.5);
      expect(box.isValid, isFalse);
    });
  });
}

// Run: flutter test test/core/models/bounding_box_test.dart
```

**2. Widget Tests** (UI components):

```dart
// test/features/camera/components/detection_overlay_test.dart
void main() {
  testWidgets('DetectionOverlay renders bounding boxes', (tester) async {
    final detections = [
      Detection(/* ... */),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: DetectionOverlay(detections: detections),
      ),
    );

    expect(find.byType(CustomPaint), findsOneWidget);
  });
}

// Run: flutter test test/features/camera/components/detection_overlay_test.dart
```

**3. Integration Tests** (feature flows):

```dart
// integration_test/camera_flow_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Camera capture and detection flow', (tester) async {
    app.main();
    await tester.pumpAndSettle();

    // Tap camera button
    await tester.tap(find.byIcon(Icons.camera));
    await tester.pumpAndSettle();

    // Wait for detection
    await tester.pump(Duration(seconds: 5));

    // Verify detections shown
    expect(find.text('Laptop'), findsOneWidget);
  });
}

// Run: flutter test integration_test/camera_flow_test.dart
```

**4. E2E Tests** (Maestro):

```yaml
# maestro/camera_to_search.yaml
appId: com.example.homeinventory
---
- launchApp
- tapOn: "Camera"
- takeScreenshot: camera_screen
- tapOn:
    id: "capture_button"
- assertVisible: "Detecting objects..."
- waitForAnimationToEnd:
    timeout: 10000
- assertVisible: "Laptop"
- tapOn: "Laptop"
- tapOn: "Add Label"
- inputText: "Electronics"
- tapOn: "Save"
- back
- tapOn: "Search"
- inputText: "Electronics"
- assertVisible: "Laptop"
```

```bash
# Run: maestro test maestro/camera_to_search.yaml
```

---

### API Service Testing

**1. Unit Tests** (Vitest):

```typescript
// src/integrations/google-vision/client.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('GoogleVisionClient', () => {
  it('normalizes bounding box coordinates', () => {
    const client = new GoogleVisionClient(mockConfig);
    const result = client.normalizeBoundingBox({
      vertices: [{ x: 100, y: 200 }, { x: 400, y: 600 }],
      imageWidth: 1000,
      imageHeight: 1000,
    });

    expect(result).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });
  });
});

// Run: npm test -- client.test.ts
```

**2. Integration Tests** (Supertest):

```typescript
// src/handlers/vision.integration.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';

describe('POST /v1/detect', () => {
  it('detects objects in uploaded image', async () => {
    const response = await request(app)
      .post('/v1/detect')
      .attach('image', './test/fixtures/laptop.jpg')
      .field('minConfidence', '0.7');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.detections).toHaveLength(1);
    expect(response.body.detections[0].label).toBe('Laptop');
  });
});

// Run: npm test -- vision.integration.test.ts
```

---

## Code Quality Standards

### Linting and Formatting

**Mobile App**:

```yaml
# analysis_options.yaml (very_good_analysis)
include: package:very_good_analysis/analysis_options.yaml

analyzer:
  strong-mode:
    implicit-casts: false
    implicit-dynamic: false
  errors:
    missing_required_param: error
    missing_return: error

linter:
  rules:
    - prefer_const_constructors
    - avoid_print
    - prefer_single_quotes
```

```bash
# Run linter
flutter analyze

# Auto-fix formatting
dart format lib/ test/ --line-length=80

# Check formatting without modifying
dart format lib/ test/ --set-exit-if-changed
```

**API Service**:

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "no-console": "error"
  }
}
```

```bash
# Run linter
npm run lint

# Auto-fix
npm run lint:fix

# Check formatting
npm run format:check

# Auto-format
npm run format
```

---

### Code Coverage Requirements

**Minimum Coverage**: 80% (enforced in CI)

**Mobile App**:

```bash
# Generate coverage report
flutter test --coverage

# View HTML report
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html

# Check coverage threshold
dart run coverage:test_with_coverage --min-coverage=80
```

**API Service**:

```bash
# Run tests with coverage
npm run test:coverage

# View HTML report
open coverage/index.html

# Check threshold (configured in vitest.config.ts)
```

---

## Debugging Tips

### Mobile App Debugging

**1. Flutter DevTools**:

```bash
# Start app in debug mode
flutter run --debug

# Open DevTools
flutter devtools
```

**2. Drift Database Inspector**:

```dart
// Add to main.dart (dev only)
if (kDebugMode) {
  final db = await AppDatabase().database;
  print('Database path: ${db.path}');
  // Use DB Browser for SQLite to inspect
}
```

**3. Riverpod Debugging**:

```dart
// Enable logging
final container = ProviderContainer(
  observers: [ProviderLogger()],
);
```

### API Service Debugging

**1. Pino Pretty Logs**:

```bash
# Development with pretty logs
npm run dev | pino-pretty
```

**2. Request/Response Logging**:

```typescript
// Enable in development
app.use(loggingMiddleware({
  logRequestBody: true,
  logResponseBody: true,
}));
```

---

## Common Issues

### Flutter Issues

**1. Build runner fails**:

```bash
# Clean and regenerate
flutter clean
flutter pub get
dart run build_runner clean
dart run build_runner build --delete-conflicting-outputs
```

**2. iOS build fails**:

```bash
cd ios
pod deintegrate
pod install
cd ..
flutter clean
flutter run
```

**3. Android build fails**:

```bash
cd android
./gradlew clean
cd ..
flutter clean
flutter run
```

### API Issues

**1. Google Cloud Vision 403 Forbidden**:

```bash
# Check service account permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID

# Ensure Vision API is enabled
gcloud services enable vision.googleapis.com
```

**2. Module not found errors**:

```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## Useful Commands

### Mobile App

```bash
# Code generation (after model changes)
dart run build_runner watch  # Auto-rebuild on file changes

# Run specific test file
flutter test test/core/models/label_test.dart

# Run tests with tags
flutter test --tags=integration

# Build APK (debug)
flutter build apk --debug

# Build IPA (requires Apple account)
flutter build ios --release

# Check outdated dependencies
flutter pub outdated

# Update dependencies
flutter pub upgrade
```

### API Service

```bash
# Watch mode (auto-restart on changes)
npm run dev

# Type check only
npm run type-check

# Build for production
npm run build

# Start production server
npm start

# Run specific test file
npm test -- vision.test.ts

# Update dependencies
npm update
```

---

## Resources

### Documentation

- **Feature Spec**: [spec.md](./spec.md)
- **Data Model**: [data-model.md](./data-model.md)
- **API Contract**: [contracts/vision-api.yaml](./contracts/vision-api.yaml)
- **Research**: [research.md](./research.md)

### External Links

- **Flutter**: https://docs.flutter.dev
- **Riverpod**: https://riverpod.dev
- **Drift**: https://drift.simonbinder.eu
- **Fastify**: https://fastify.dev
- **Google Cloud Vision**: https://cloud.google.com/vision/docs
- **Maestro**: https://maestro.mobile.dev

---

## Getting Help

1. **Check Documentation**: Start with [spec.md](./spec.md) and this file
2. **Search Issues**: Check GitHub issues for similar problems
3. **Ask Team**: Reach out on Slack/Discord
4. **Create Issue**: If stuck, create a detailed GitHub issue

---

## Next Steps

After completing this quickstart:

1. Read the [feature specification](./spec.md) to understand requirements
2. Review the [data model](./data-model.md) to understand database structure
3. Explore the [API contract](./contracts/vision-api.yaml) to understand endpoints
4. Check [tasks.md](./tasks.md) (once generated) for implementation tasks
5. Start with a simple task and submit your first PR!

**Happy coding!** 🚀
