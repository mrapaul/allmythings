# Design Document: Instagram-Style Home Inventory App

## 1. Overview

This document outlines the design for a minimalistic, resilient, and fully functional home inventory application with an Instagram-style user interface and AI-powered object detection. The app aims to provide users with an intuitive way to catalog their belongings, leveraging modern mobile development practices and a clean architectural approach.

## 2. Detailed Analysis of the Goal or Problem

The primary goal is to solve the common problem of home inventory management. Users often struggle to keep track of their possessions, especially for insurance purposes, moving, or simply knowing what they own. Traditional methods are often cumbersome and inefficient. This app addresses these pain points by offering:

*   **Ease of Use**: An Instagram-inspired UI makes the process of adding and managing items familiar and engaging.
*   **Efficiency**: AI-powered object detection automates the labeling process, significantly reducing manual data entry.
*   **Accessibility**: Full-text search allows users to quickly find items based on various labels.
*   **Data Richness**: Support for custom key-value labels enables detailed categorization of items.
*   **Resilience**: Offline capabilities and robust error handling ensure a smooth user experience even in challenging network conditions.

## 3. Alternatives Considered

The choice of technology stack and architectural patterns was made based on the project's requirements for performance, maintainability, scalability, and developer experience.

*   **Framework (Flutter vs. React Native/Native)**: Flutter was chosen for its excellent performance, single codebase for multiple platforms, rich widget set, and strong community support, aligning with the goal of a "modern cross-platform framework." React Native was considered but Flutter's native compilation and declarative UI were preferred for a smoother UI/UX. Native development (Kotlin/Swift) was ruled out due to the desire for a single codebase and faster development cycles.
*   **State Management (Riverpod vs. BLoC/Provider/GetX)**: Riverpod was selected for its compile-time safety, testability, and simplicity, especially its ability to manage complex dependencies and asynchronous states effectively. BLoC was considered for its strong separation of concerns but was deemed more verbose for this project's needs. Provider and GetX offer simpler solutions but lack some of Riverpod's advanced features and compile-time safety.
*   **Database (Drift vs. Hive/Sqflite)**: Drift (formerly Moor) was chosen for its type-safe SQLite ORM capabilities, FTS5 support, and integration with Flutter. This ensures data integrity and efficient querying. Hive offers a simpler key-value store but lacks the relational capabilities and FTS5 needed. Sqflite is a good low-level SQLite wrapper but requires more boilerplate compared to Drift's ORM.
*   **Data Models (Freezed vs. built_value/manual)**: Freezed was selected for its ability to generate immutable data classes with `copyWith`, `fromJson`/`toJson`, and union types, reducing boilerplate and ensuring state predictability. `built_value` is another strong contender but Freezed's simplicity and integration with Riverpod were preferred. Manual data class creation was rejected due to the increased boilerplate and potential for errors.
*   **Error Handling (fpdart vs. custom solutions)**: `fpdart` was chosen for its functional approach to error handling (`Either`, `TaskEither`), promoting explicit and consistent error management across the data and application layers. Custom error handling solutions can be prone to inconsistencies and boilerplate.

## 4. Detailed Design for the New Package

### 4.1. Architecture: Clean Architecture

The application adheres strictly to Clean Architecture principles, dividing the codebase into distinct, independent layers:

*   **Presentation Layer**:
    *   **Purpose**: Handles UI rendering and user interaction.
    *   **Components**: Screens, widgets, and navigation logic.
    *   **Dependencies**: Depends on the Application layer.
    *   **Technologies**: Flutter widgets, `ConsumerWidget`/`ConsumerStatefulWidget` from Riverpod.
*   **Application Layer**:
    *   **Purpose**: Contains the business logic, orchestrates interactions between presentation and domain/data layers, and manages application state.
    *   **Components**: Riverpod providers, notifiers, use cases (implicitly handled by providers interacting with repositories).
    *   **Dependencies**: Depends on the Domain layer.
    *   **Technologies**: Riverpod (`FutureProvider`, `StreamProvider`, `StateNotifierProvider`), `ref.invalidate`.
*   **Domain Layer**:
    *   **Purpose**: Defines core business entities, rules, and abstract service interfaces (repositories). It is the most central layer and has no dependencies on other layers.
    *   **Components**: Freezed data models (e.g., `InventoryItem`, `Label`, `Detection`), abstract repository interfaces (e.g., `InventoryRepository`).
    *   **Dependencies**: None (pure Dart).
    *   **Technologies**: Freezed, `fpdart` (for `Failure` types).
*   **Data Layer**:
    *   **Purpose**: Implements the abstract interfaces defined in the Domain layer, providing concrete data sources (local database, remote API).
    *   **Components**: Drift database implementation, API clients (Dio), concrete repository implementations.
    *   **Dependencies**: Depends on the Domain layer.
    *   **Technologies**: Drift, Dio, `fpdart` (`Either`, `TaskEither`).

### 4.2. Technology Stack Utilization

*   **Flutter**: Used for building the entire cross-platform UI. Widgets will be composed to create the Instagram-style grid, item details, search interfaces, and profile screens.
*   **Riverpod**: The primary state management solution.
    *   `FutureProvider` will be used for asynchronous data fetching (e.g., `inventoryItemsProvider`, `inventoryStatsProvider`).
    *   `StateNotifierProvider` (or similar) will manage more complex, mutable state that requires business logic (e.g., for camera operations, label editing).
    *   `ref.invalidate` will be crucial for automatically refreshing UI components when underlying data changes (e.g., after adding a new item).
*   **Drift**: Provides a type-safe and reactive SQLite database.
    *   Database schema defined using Drift's DSL.
    *   FTS5 will be leveraged for efficient full-text search across item labels.
    *   Stream-based queries will integrate seamlessly with Riverpod's `StreamProvider` for real-time UI updates.
*   **Freezed**: All data models (e.g., `InventoryItem`, `Label`, `Detection`, `BoundingBox`, `EnsembleDetails`) will be generated using Freezed. This ensures immutability, provides `copyWith` methods for state updates, and simplifies JSON serialization/deserialization.
*   **fpdart**: Used for robust error handling.
    *   `Either<Failure, Success>` will be the return type for all operations in the data and application layers that can fail.
    *   `TaskEither` will be used for asynchronous operations that return an `Either`.
    *   A hierarchy of `Failure` types (e.g., `StorageFailure`, `NetworkFailure`, `PermissionFailure`) will be defined in the Domain layer.
*   **Dio**: An HTTP client with retry logic for interacting with the backend AI service.

### 4.3. Key Features Design

*   **Instagram-Style Navigation**: Implemented using Flutter's `BottomNavigationBar` with four main tabs: Home, Search, Camera, and Profile.
*   **Smart Object Detection**:
    *   The Camera screen will capture images.
    *   Images will be sent to the backend API (Node.js + TypeScript) via Dio.
    *   The backend will use ensemble AI (Google Cloud Vision + AWS Rekognition) for object detection.
    *   Detection results (labels, confidence scores, provider agreement) will be returned and displayed on a dedicated Detection Results screen.
*   **Label Management**:
    *   Labels will be stored in the Drift database.
    *   UI for adding, editing, and deleting labels will be provided on the Item Details screen.
    *   Swipe gestures will be used for deleting labels.
*   **Home Feed**: A 3-column photo grid using Flutter's `GridView.builder` to display inventory items. `Pull-to-refresh` functionality will be implemented.
*   **Item Details**: A full-screen view showing the item's photo, all associated labels, and AI detection information. Quick actions for editing labels or deleting the item will be available.
*   **Search**: Real-time full-text search powered by Drift's FTS5. Results will be displayed in an Instagram-style grid.
*   **Profile & Stats**: Displays inventory statistics (total items, total labels, estimated categories, last captured time).

### 4.4. UI/UX Design Principles

*   **Minimalistic**: Black & white color scheme, clean typography, no clutter, icon-based actions.
*   **Single-Button Focused**: Each screen will have one clear primary action.
*   **Instagram-Inspired**: Photo grid layout, bottom tabs, minimal AppBar, full-screen views.
*   **Gesture Support**: Swipe to delete, pull to refresh.

## 5. Diagrams

### 5.1. High-Level Architecture Diagram

```mermaid
graph TD
    User --> Presentation
    Presentation --> Application
    Application --> Domain
    Application --> Data
    Data --> Domain
    Data -- "Local DB (Drift)" --> "SQLite"
    Data -- "Remote API (Dio)" --> "Backend API"
    "Backend API" -- "Google Cloud Vision"
    "Backend API" -- "AWS Rekognition"
```

### 5.2. Item Creation Data Flow Diagram

```mermaid
graph TD
    A[User taps Capture Button] --> B(Camera Screen)
    B --> C{Photo Captured}
    C --> D[Image Processing Service]
    D --> E[Backend API Call (Dio)]
    E --> F{Ensemble AI Detection}
    F --> G[Detection Results Screen]
    G --> H[User taps "Done"]
    H --> I[Inventory Repository.createItem()]
    I --> J[Drift Database.into().insert()]
    J --> K[Drift Database.into().insert() for Labels]
    K --> L[Home Feed (UI Update via Riverpod)]
```

## 6. Summary of the Design

The design leverages Clean Architecture to ensure a modular, testable, and maintainable application. Flutter provides the UI, while Riverpod manages state efficiently. Drift handles local data persistence with advanced search capabilities, and Freezed ensures robust data models. Functional error handling with `fpdart` enhances resilience. The UI/UX is inspired by Instagram, focusing on minimalism and intuitive interactions.

## 7. References

*   `GEMINI.md` (Project Context)
*   Web search results for "Flutter Riverpod Clean Architecture best practices" (Used to reinforce best practices for each technology within the architectural layers).
