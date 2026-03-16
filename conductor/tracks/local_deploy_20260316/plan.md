# Implementation Plan: Local Deployment and Continuous Improvement

## Phase 1: Local Backend Orchestration (Docker Compose)
- [x] Task: Configure Docker Compose for Local Services (29d6ce2)
    - [x] Create/Update `docker-compose.yml` for API and Detection services.
    - [x] Define local-specific volumes and networks.
- [x] Task: Environment Configuration for Local Run (skipped git commit for ignored files)
    - [x] Create `.env.local` template for the API service.
    - [x] Create configuration for the Detection service (YOLO model paths).
- [x] Task: Verify Local Service Integration (Implemented test, confirmed 503 when services down)
    - [x] Write integration test to verify API can reach Detection service in Docker.
    - [x] Implement health check aggregation in API service.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Local Backend Orchestration' (Protocol in workflow.md)

## Phase 2: Mobile Deployment Configuration (Android & iOS)
- [ ] Task: Android Build and Deployment Scripts
    - [ ] Create `scripts/build-android.sh` for APK generation.
    - [ ] Create `scripts/deploy-android.sh` for ADB installation.
- [ ] Task: iOS Build and Deployment Instructions
    - [ ] Document manual Xcode build process for physical devices.
    - [ ] Create `scripts/check-ios-env.sh` to verify development certificates/provisioning.
- [ ] Task: Dynamic Local API Connection Logic
    - [ ] Write unit tests for IP discovery/connection logic in Flutter.
    - [ ] Implement logic to switch between localhost (emulator) and host IP (physical device).
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Mobile Deployment Configuration' (Protocol in workflow.md)

## Phase 3: Continuous Integration (GitHub Actions)
- [ ] Task: Core CI Workflow Implementation
    - [ ] Create `.github/workflows/ci.yml`.
    - [ ] Add jobs for API linting, type-checking, and unit tests.
    - [ ] Add jobs for Detection service linting and unit tests.
- [ ] Task: Flutter Build Verification in CI
    - [ ] Add job to run `flutter analyze` and `flutter test`.
    - [ ] Add job for basic `flutter build apk` verification (dry run).
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Continuous Integration' (Protocol in workflow.md)

## Phase 4: Automated E2E Testing
- [ ] Task: E2E Framework Setup
    - [ ] Configure `integration_test` package in the Flutter app.
    - [ ] Setup a mock environment for E2E tests (or use local Docker).
- [ ] Task: Core Flow E2E Test Implementation
    - [ ] Write E2E test for the "Capture -> Detect -> Inventory" user journey.
    - [ ] Implement automated verification of result counts and categories.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Automated E2E Testing' (Protocol in workflow.md)
