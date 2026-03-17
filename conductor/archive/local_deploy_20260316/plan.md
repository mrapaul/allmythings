# Implementation Plan: Local Deployment and Continuous Improvement

## Phase 1: Local Backend Orchestration (Docker Compose) [checkpoint: efe3ee3]
- [x] Task: Configure Docker Compose for Local Services (29d6ce2)
    - [x] Create/Update `docker-compose.yml` for API and Detection services.
    - [x] Define local-specific volumes and networks.
- [x] Task: Environment Configuration for Local Run (skipped git commit for ignored files)
    - [x] Create `.env.local` template for the API service.
    - [x] Create configuration for the Detection service (YOLO model paths).
- [x] Task: Verify Local Service Integration (Implemented test, confirmed 503 when services down)
    - [x] Write integration test to verify API can reach Detection service in Docker.
    - [x] Implement health check aggregation in API service.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Local Backend Orchestration' (Protocol in workflow.md)

## Phase 2: Mobile Deployment Configuration (Android & iOS)
- [x] Task: Android Build and Deployment Scripts (be8ae7e)
    - [x] Create `scripts/build-android.sh` for APK generation.
    - [x] Create `scripts/deploy-android.sh` for ADB installation.
- [x] Task: iOS Build and Deployment Instructions (f0b1db3)
    - [x] Document manual Xcode build process for physical devices.
    - [x] Create `scripts/check-ios-env.sh` to verify development certificates/provisioning.
- [x] Task: Dynamic Local API Connection Logic (7ffe7b27)
    - [x] Write unit tests for IP discovery/connection logic in Flutter.
    - [x] Implement logic to switch between localhost (emulator) and host IP (physical device).
- [x] Task: Conductor - User Manual Verification 'Phase 2: Mobile Deployment Configuration' (Protocol in workflow.md)

## Phase 3: Full Local Automation (Unified Script) [checkpoint: 3d4f0ff]
- [x] Task: Create Unified Auto-Deploy Script (3e7fdcf)
    - [x] Create `scripts/auto-deploy.sh` that starts Docker, detects device, and runs app.
    - [x] Add logic to automatically fetch Mac IP for physical device connection.
    - [x] Implement smart device detection (iPhone vs Android).
- [x] Task: Conductor - User Manual Verification 'Phase 3: Full Local Automation' (Protocol in workflow.md)

## Phase 4: Continuous Integration (GitHub Actions) [checkpoint: e3cbbc6]
- [x] Task: Core CI Workflow Implementation
    - [x] Create `.github/workflows/ci.yml` (Updated existing with Detection tests).
    - [x] Add jobs for API linting, type-checking, and unit tests (Verified).
    - [x] Add jobs for Detection service linting and unit tests (Created tests and CI job).
- [x] Task: Flutter Build Verification in CI
    - [x] Add job to run `flutter analyze` and `flutter test` (Already in ci.yml).
    - [x] Add job for basic `flutter build apk` verification (Already in ci.yml).
- [x] Task: Conductor - User Manual Verification 'Phase 4: Continuous Integration' (Protocol in workflow.md)

## Phase 5: Automated E2E Testing [checkpoint: a295db3]
- [x] Task: E2E Framework Setup
    - [x] Configure `integration_test` package in the Flutter app.
    - [x] Setup a mock environment for E2E tests (MockDetectionRepository).
- [x] Task: Core Flow E2E Test Implementation
    - [x] Write E2E test for the "Capture -> Detect -> Inventory" user journey.
    - [x] Implement automated verification of result counts and categories.
- [x] Task: Conductor - User Manual Verification 'Phase 5: Automated E2E Testing' (Protocol in workflow.md)
