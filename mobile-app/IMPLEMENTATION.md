# Implementation Plan: Instagram-Style Home Inventory App

This document outlines the phased implementation plan for the "Instagram-Style Home Inventory App." Each phase will involve specific tasks, followed by verification steps and a journal entry.

## Phase 1: Project Setup and Initial Commit

- [ ] Verify the current working directory is the package directory (`mobile-app`).
- [ ] Create a Flutter application project in the current directory using the `create_project` tool with the `empty` flag.
- [ ] Remove any boilerplate code or files that will be replaced by the application's custom implementation.
- [ ] Update the `pubspec.yaml` file:
    - Set the `name` to `all_my_things`.
    - Update the `description` to a short placeholder.
    - Set the `version` to `0.1.0`.
- [ ] Update the `README.md` file with a short placeholder description.
- [ ] Create a `CHANGELOG.md` file with an initial version entry for `0.1.0`.
- [ ] Commit the initial project setup to the `feature/all-my-things` branch.
- [ ] After committing, start running the app with the `launch_app` tool on the user's preferred device.

## Phase 2: Core Data Models (Freezed)

- [ ] Define Freezed data models for `InventoryItem`, `Label`, `Detection`, `BoundingBox`, and `EnsembleDetails` in the `domain/models` directory.
- [ ] Run `build_runner` to generate the Freezed part files.
- [ ] Create unit tests for each data model to ensure correct serialization/deserialization and immutability.

## Phase 3: Database Setup (Drift)

- [ ] Define the Drift database schema (`app_database.dart`) including `InventoryItems` and `Labels` tables, and the `LabelSearchFts` virtual table.
- [ ] Implement the `AppDatabase` class extending `_$AppDatabase`.
- [ ] Run `build_runner` to generate the Drift part files.
- [ ] Create unit tests for database operations (insert, query, update, delete) for `InventoryItem` and `Label`.

## Phase 4: Repository Implementation

- [ ] Define the abstract `InventoryRepository` interface in the `domain/services` directory.
- [ ] Implement the concrete `InventoryRepositoryImpl` in the `data/repositories` directory, using `AppDatabase`.
- [ ] Implement methods for `createItem`, `addItems`, `getAllItems`, `getItemById`, `deleteItem`, `getLabelsForItem`, `addLabel`, `updateLabel`, `deleteLabel`, `searchItems`, and `getStats`.
- [ ] Create unit tests for the `InventoryRepositoryImpl`.

## Phase 5: Riverpod Providers

- [ ] Create Riverpod providers in the `application/providers` directory:
    - `inventoryItemsProvider` (FutureProvider for all items).
    - `searchResultsProvider` (FutureProvider.family for search results).
    - `inventoryStatsProvider` (FutureProvider for inventory statistics).
    - `cameraServiceProvider` (Provider for camera service).
    - `imageProcessingServiceProvider` (Provider for image processing service).
- [ ] Implement the logic within the providers to interact with the `InventoryRepository`.
- [ ] Create unit tests for the Riverpod providers.

## Phase 6: Camera and Object Detection Integration

- [ ] Implement the `CameraService` in `domain/services` and `CameraServiceImpl` in `data/services`.
- [ ] Implement the `ImageProcessingService` in `domain/services` and `ImageProcessingServiceImpl` in `data/services`.
- [ ] Design and implement the Camera Screen (`presentation/camera/camera_screen.dart`) for capturing images.
- [ ] Integrate with the backend AI service via `Dio` for object detection.
- [ ] Design and implement the Detection Results Screen (`presentation/detection/detection_results_screen.dart`) to display AI results.
- [ ] Create unit/widget tests for camera and detection screens.

## Phase 7: Home Feed and Item Details UI

- [ ] Design and implement the Home Feed Screen (`presentation/home/inventory_feed_screen.dart`) with the 3-column photo grid and pull-to-refresh.
- [ ] Design and implement the Item Details Screen (`presentation/items/item_detail_screen.dart`) to display item information and labels.
- [ ] Implement UI for adding, editing, and deleting labels on the Item Details Screen.
- [ ] Create widget tests for Home Feed and Item Details screens.

## Phase 8: Search and Profile UI

- [ ] Design and implement the Search Screen (`presentation/search/search_screen.dart`) with real-time FTS5 search.
- [ ] Design and implement the Profile Screen (`presentation/profile/profile_screen.dart`) to display inventory statistics.
- [ ] Create widget tests for Search and Profile screens.

## Phase 9: Final Touches and Documentation

- [ ] Review and refine UI/UX for consistency and adherence to design principles.
- [ ] Ensure all error handling and empty states are properly implemented.
- [ ] Create a comprehensive `README.md` file for the package.
- [ ] Create a `GEMINI.md` file in the project directory that describes the app, its purpose, and implementation details of the application and the layout of the files.
- [ ] Ask the user to inspect the app and the code and say if they are satisfied with it, or if any modifications are needed.

## Verification Steps (After each phase)

- [ ] Create/modify unit tests for testing the code added or modified in this phase, if relevant.
- [ ] Run the `dart_fix` tool to clean up the code.
- [ ] Run the `analyze_files` tool one more time and fix any issues.
- [ ] Run any tests to make sure they all pass.
- [ ] Run `dart_format` to make sure that the formatting is correct.
- [ ] Re-read the `IMPLEMENTATION.md` file to see what, if anything, has changed in the implementation plan, and if it has changed, take care of anything the changes imply.
- [ ] Update the `IMPLEMENTATION.md` file with the current state, including any learnings, surprises, or deviations in the Journal section. Check off any checkboxes of items that have been completed.
- [ ] Use `git diff` to verify the changes that have been made, and create a suitable commit message for any changes, following any guidelines you have about commit messages. Be sure to properly escape dollar signs and backticks, and present the change message to the user for approval.
- [ ] Wait for approval. Don't commit the changes or move on to the next phase of implementation until the user approves the commit.
- [ ] After committing the change, if the app is running, use the `hot_reload` tool to reload it.

## Journal

### Phase 1: Project Setup and Initial Commit

*   **Actions Taken**:
    *   User approved `DESIGN.md`.
    *   Created `IMPLEMENTATION.md`.
    *   Confirmed package name `all_my_things`.
    *   Created new git branch `feature/all-my-things`.
    *   Confirmed package directory `/Users/mrarindampaul/Develop/allmythings/mobile-app`.

*   **Learnings/Surprises/Deviations**:
    *   The project already exists as a Flutter app, so the initial step of creating a new project will involve verifying its structure and adapting it if necessary, rather than creating a brand new empty project. The `create_project` tool will be used with `.` as the target to ensure the existing project is recognized and potentially updated if needed, or to confirm its validity.
