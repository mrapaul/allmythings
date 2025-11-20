# Requirements Document: Fix Implementation Issues and Complete Functionality

## Introduction

Based on analysis of the CLAUDE.md, GEMINI.md documentation and current codebase, the Instagram-Style Home Inventory App claims to be complete but has significant implementation issues that prevent it from building and running. This spec addresses fixing these issues and ensuring all documented functionality works as described.

## Requirements

### Requirement 1: Fix Build and Compilation Issues

**User Story:** As a developer, I want the app to build and compile successfully, so that I can run and test the application.

#### Acceptance Criteria

1. WHEN I run `flutter pub get` and `dart run build_runner build` THEN the mobile app should compile without errors
2. WHEN I run `flutter analyze` THEN there should be no critical errors preventing compilation
3. WHEN I run `npm install` and `npm run build` in api-service THEN the API service should build successfully
4. WHEN I run the mobile app THEN it should launch without crashing

### Requirement 2: Fix Test Suite Issues

**User Story:** As a developer, I want all tests to have correct imports and structure, so that the test suite can run and validate functionality.

#### Acceptance Criteria

1. WHEN I run `flutter test` THEN all test files should have correct package imports (`home_inventory` not `allmythings`)
2. WHEN test files reference models and services THEN they should use the correct class names and constructors
3. WHEN I run the test suite THEN tests should either pass or fail gracefully (not crash due to import errors)
4. WHEN I run API tests THEN they should validate the ensemble vision functionality

### Requirement 3: Implement Missing Core Functionality

**User Story:** As a user, I want all the features described in the documentation to work, so that I can use the app as intended.

#### Acceptance Criteria

1. WHEN I open the app THEN I should see the Instagram-style bottom navigation with 4 tabs
2. WHEN I tap the camera button THEN I should be able to capture photos and see object detection results
3. WHEN objects are detected THEN they should be saved to the local database with auto-generated labels
4. WHEN I view the home feed THEN I should see a 3-column grid of captured items
5. WHEN I tap an item THEN I should see full details with the ability to edit labels
6. WHEN I use search THEN I should be able to find items by their labels using FTS5
7. WHEN I view the profile THEN I should see inventory statistics

### Requirement 4: Ensure API Service Functionality

**User Story:** As a user, I want the AI object detection to work reliably, so that I can automatically identify objects in my photos.

#### Acceptance Criteria

1. WHEN the API service starts THEN it should be accessible at localhost:3000
2. WHEN I send a photo to POST /v1/detect THEN it should return detected objects with confidence scores
3. WHEN multiple vision providers are configured THEN the ensemble fusion should work correctly
4. WHEN I check GET /v1/health THEN it should report the status of all vision providers
5. WHEN there are API errors THEN they should be handled gracefully with appropriate error messages

### Requirement 5: Complete Instagram-Style UI Implementation

**User Story:** As a user, I want the app to have a clean, Instagram-like interface, so that it's intuitive and pleasant to use.

#### Acceptance Criteria

1. WHEN I use the app THEN it should have a black and white color scheme
2. WHEN I navigate THEN I should use gesture-based interactions (swipe, tap, pull to refresh)
3. WHEN I view photos THEN they should be displayed in a 3-column grid layout
4. WHEN I interact with the app THEN it should provide immediate visual feedback
5. WHEN I use the camera THEN it should have a prominent, Instagram-style capture button

### Requirement 6: Ensure Data Persistence and Search

**User Story:** As a user, I want my inventory data to be saved locally and searchable, so that I can find my items quickly.

#### Acceptance Criteria

1. WHEN I capture items THEN they should be saved to the local SQLite database
2. WHEN I add or edit labels THEN they should be immediately searchable via FTS5
3. WHEN I search for items THEN results should appear in real-time as I type
4. WHEN I restart the app THEN all my data should persist
5. WHEN I delete items THEN associated labels should be cascade deleted

## Edge Cases

- What happens when the camera permission is denied?
  - App should show clear instructions on how to enable camera access in settings

- What happens when there's no internet connection for object detection?
  - App should display a clear message that internet is required for AI detection

- What happens when the API service is not running?
  - Mobile app should show appropriate error messages and retry options

- What happens when object detection fails or returns no results?
  - App should handle gracefully with options to retry or manually add labels

- What happens when the database becomes corrupted?
  - App should handle database errors gracefully and potentially offer to reset data

## Success Criteria

- **SC-001**: The mobile app builds and runs without errors on iOS and Android
- **SC-002**: All test files compile and can be executed (even if some tests fail)
- **SC-003**: The API service starts and responds to health checks
- **SC-004**: Users can complete the full workflow: capture → detect → save → search
- **SC-005**: The UI matches the Instagram-style design described in documentation
- **SC-006**: All data operations (create, read, update, delete) work correctly
- **SC-007**: Search functionality returns results in under 1 second
- **SC-008**: The app handles errors gracefully without crashing

## Assumptions

- The existing file structure and architecture are generally correct
- The main issues are import errors, syntax errors, and missing implementations
- The API service foundation is solid and just needs configuration
- The database schema is correctly designed
- The vision AI integration approach is sound