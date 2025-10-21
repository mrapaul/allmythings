# Visual Home Inventory Manager - Mobile App

Camera-based object detection and inventory tracking mobile application for iOS and Android.

## Overview

This Flutter application allows users to:
- Capture photos of household items using the device camera
- Automatically detect objects using cloud-based ensemble vision AI
- Tag and label inventory items with custom metadata
- Search their entire home inventory using full-text search
- Manage everything with an Instagram-style minimal UI

## Tech Stack

- **Framework**: Flutter 3.16+
- **Language**: Dart 3.x
- **State Management**: Riverpod
- **Database**: SQLite with Drift ORM
- **HTTP Client**: Dio
- **Navigation**: GoRouter
- **Code Generation**: Freezed, JSON Serializable

## Prerequisites

- Flutter SDK 3.16 or higher
- Dart SDK 3.2 or higher
- iOS: Xcode 15+ (for iOS development)
- Android: Android Studio with SDK 29+ (for Android development)

## Quick Start

```bash
# Install dependencies
flutter pub get

# Run code generation
dart run build_runner build --delete-conflicting-outputs

# Run the app (iOS)
flutter run -d "iPhone 15 Pro"

# Run the app (Android)
flutter run -d emulator-5554
```

## Development

### Code Generation

This project uses code generation for models, database, and state management:

```bash
# Watch mode (auto-rebuild on changes)
dart run build_runner watch

# One-time build
dart run build_runner build --delete-conflicting-outputs
```

### Testing

```bash
# Run all tests
flutter test

# Run with coverage
flutter test --coverage
genhtml coverage/lcov.info -o coverage/html
```

### Linting

```bash
# Analyze code
flutter analyze

# Format code
dart format lib/ test/ --line-length=80
```

## Project Structure

```
lib/
├── application/        # Riverpod providers and state
├── core/              # Database, models, theme, navigation
├── data/              # Repositories and data sources
├── domain/            # Business logic and services
└── presentation/      # UI screens and widgets
```

## API Configuration

Set the API endpoint in your environment:

```dart
// lib/core/config/app_config.dart
const apiBaseUrl = 'http://localhost:3000'; // Development
// const apiBaseUrl = 'https://api.example.com'; // Production
```

## Building for Release

### Android

```bash
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

### iOS

```bash
flutter build ios --release
# Then open ios/Runner.xcworkspace in Xcode and archive
```

## Documentation

- [Feature Specification](../specs/001-build-a-mobile/spec.md)
- [Data Model](../specs/001-build-a-mobile/data-model.md)
- [API Contract](../specs/001-build-a-mobile/contracts/vision-api.yaml)
- [Developer Quickstart](../specs/001-build-a-mobile/quickstart.md)

## License

Private project - not for distribution
