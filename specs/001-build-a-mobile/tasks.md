---
description: "Implementation tasks for Visual Home Inventory Manager"
---

# Tasks: Visual Home Inventory Manager

**Input**: Design documents from `/specs/001-build-a-mobile/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, ENSEMBLE_VISION_UPDATE.md

**Tests**: Tests are included as this project follows TDD approach with >80% code coverage requirement (see plan.md)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions
- Mobile app: `mobile-app/` (Flutter/Dart)
- API service: `api-service/` (Node.js/TypeScript)
- Self-hosted services: `api-service/ml-services/` (Meta Detectron2, TensorFlow Serving)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] **T001** [P] Create Flutter project structure at `mobile-app/` with `flutter create mobile-app --org com.homeinventory --project-name home_inventory`
- [X] **T002** [P] Create Node.js/TypeScript project structure at `api-service/` with npm init and TypeScript setup
- [X] **T003** [P] Initialize `mobile-app/pubspec.yaml` with dependencies: riverpod, drift, dio, go_router, freezed, json_serializable, fpdart, camera, image_picker, flutter_hooks, very_good_analysis
- [X] **T004** [P] Initialize `api-service/package.json` with dependencies: fastify, @fastify/multipart, zod, pino, axios, @google-cloud/vision, @aws-sdk/client-rekognition
- [X] **T005** [P] Configure Flutter analysis options at `mobile-app/analysis_options.yaml` using very_good_analysis
- [X] **T006** [P] Configure ESLint and Prettier at `api-service/.eslintrc.js` and `api-service/.prettierrc`
- [X] **T007** [P] Setup Git repository structure with `.gitignore` for Flutter and Node.js
- [X] **T008** [P] Create `mobile-app/README.md` with project overview and setup instructions
- [X] **T009** [P] Create `api-service/README.md` with API service overview and development setup

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database & ORM Setup

- [X] **T010** Setup Drift ORM in `mobile-app/lib/data/database/app_database.dart` with table definitions for InventoryItems, Labels, LabelSearchFts
- [X] **T011** Create Drift table definition for InventoryItems at `mobile-app/lib/data/database/tables/inventory_items.dart`
- [X] **T012** Create Drift table definition for Labels at `mobile-app/lib/data/database/tables/labels.dart`
- [X] **T013** Create Drift table definition for LabelSearchFts (FTS5 virtual table) at `mobile-app/lib/data/database/tables/label_search_fts.dart`
- [X] **T014** Configure Drift schema versioning and migrations at `mobile-app/lib/data/database/migrations/`
- [X] **T015** Run Drift code generation: `dart run build_runner build --delete-conflicting-outputs`

### Mobile Data Models (Freezed)

- [X] **T016** [P] Create VisionProvider enum at `mobile-app/lib/domain/models/vision_provider.dart` with values: meta, google, aws, tensorflow
- [X] **T017** [P] Create BoundingBox model at `mobile-app/lib/domain/models/bounding_box.dart` with freezed + json_serializable
- [X] **T018** [P] Create EnsembleDetails model at `mobile-app/lib/domain/models/ensemble_details.dart` with providerAgreement, confidenceByProvider, labelConsensus
- [X] **T019** [P] Create AlternativeLabel model at `mobile-app/lib/domain/models/alternative_label.dart` with label, confidence, provider
- [X] **T020** [P] Create Detection model at `mobile-app/lib/domain/models/detection.dart` with id, label, confidence, boundingBox, ensembleDetails, alternativeLabels
- [X] **T021** [P] Create ProviderResult model at `mobile-app/lib/domain/models/provider_result.dart` with provider, success, processingTimeMs, detections, error
- [X] **T022** [P] Create EnsembleMetrics model at `mobile-app/lib/domain/models/ensemble_metrics.dart` with providersUsed, averageConfidence, consensusRate
- [X] **T023** [P] Create DetectionResponse model at `mobile-app/lib/domain/models/detection_response.dart` with success, ensembleMode, processingTimeMs, detections, providerResults, ensembleMetrics
- [X] **T024** Run freezed code generation: `dart run build_runner build --delete-conflicting-outputs`

### API Foundation (Ensemble Vision Service)

- [X] **T025** Create Fastify application at `api-service/src/app.ts` with multipart support, CORS, error handling
- [X] **T026** [P] Implement Zod validation schemas at `api-service/src/schemas/detection.schema.ts` matching vision-api.yaml
- [X] **T027** [P] Create circuit breaker utility at `api-service/src/utils/circuit-breaker.ts` with configurable thresholds
- [X] **T028** [P] Create provider adapter interface at `api-service/src/adapters/provider-adapter.interface.ts`
- [X] **T029** [P] Implement Google Cloud Vision adapter at `api-service/src/adapters/google-vision.adapter.ts` with circuit breaker
- [X] **T030** [P] Implement AWS Rekognition adapter at `api-service/src/adapters/aws-rekognition.adapter.ts` with circuit breaker
- [X] **T031** [P] Create ensemble fusion engine at `api-service/src/services/ensemble-fusion.service.ts` with NMS, weighted voting, label consensus
- [X] **T032** Create vision orchestrator service at `api-service/src/services/vision-orchestrator.service.ts` that calls all providers in parallel
- [X] **T033** Implement POST /v1/detect endpoint at `api-service/src/routes/detect.route.ts` using vision orchestrator
- [X] **T034** [P] Implement GET /v1/health endpoint at `api-service/src/routes/health.route.ts` checking all 4 provider statuses
- [X] **T035** [P] Setup structured logging with Pino at `api-service/src/utils/logger.ts`
- [X] **T036** [P] Setup environment configuration at `api-service/src/config/env.config.ts` for API keys, timeouts, weights

### Mobile Infrastructure

- [X] **T037** Setup Riverpod providers structure at `mobile-app/lib/application/providers/` with database, API client, state providers
- [X] **T038** Create API client with Dio at `mobile-app/lib/data/remote/api_client.dart` with retry logic, timeouts
- [X] **T039** [P] Setup go_router configuration at `mobile-app/lib/presentation/routing/app_router.dart`
- [X] **T040** [P] Create base screen/widget structure at `mobile-app/lib/presentation/common/` for shared UI components
- [X] **T041** [P] Setup app theme at `mobile-app/lib/presentation/theme/app_theme.dart` with Instagram-style minimal design
- [X] **T042** [P] Create error handling utilities at `mobile-app/lib/core/errors/` using fpdart Either types

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Quick Item Capture with Camera (Priority: P1) 🎯 MVP

**Goal**: Users can take a photo, see detected objects listed within 5 seconds, with spatial boundaries highlighted

**Independent Test**: Take a photo of 3-5 household items, verify all items detected and displayed with bounding boxes within 5 seconds

### Tests for User Story 1 ⚠️

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] **T043** [P] [US1] Contract test for POST /v1/detect endpoint at `api-service/tests/contract/detect.contract.test.ts` validating DetectionResponse schema matches vision-api.yaml
- [ ] **T044** [P] [US1] Integration test for ensemble fusion at `api-service/tests/integration/ensemble-fusion.integration.test.ts` with mock provider responses
- [ ] **T045** [P] [US1] Unit test for NMS algorithm at `api-service/tests/unit/nms.unit.test.ts` with overlapping bounding boxes (IoU > 0.5)
- [ ] **T046** [P] [US1] Unit test for weighted confidence fusion at `api-service/tests/unit/confidence-fusion.unit.test.ts` with provider weights
- [ ] **T047** [P] [US1] Unit test for label consensus voting at `api-service/tests/unit/label-consensus.unit.test.ts` with multiple provider labels
- [ ] **T048** [P] [US1] Widget test for camera screen at `mobile-app/test/presentation/camera/camera_screen_test.dart` verifying camera button and capture flow
- [ ] **T049** [P] [US1] Widget test for detection results screen at `mobile-app/test/presentation/detection/detection_results_screen_test.dart` with mock detections
- [ ] **T050** [P] [US1] Integration test for photo capture → API call → save to DB at `mobile-app/integration_test/capture_flow_test.dart`
- [ ] **T051** [P] [US1] E2E test with Maestro at `mobile-app/.maestro/capture-and-detect.yaml` for complete user journey

### Implementation for User Story 1

#### Camera & Photo Capture (Mobile)

- [ ] **T052** [P] [US1] Create camera permission handler at `mobile-app/lib/core/permissions/camera_permission.dart` with permission request flow
- [ ] **T053** [P] [US1] Implement camera screen at `mobile-app/lib/presentation/camera/camera_screen.dart` with camera preview and capture button
- [ ] **T054** [P] [US1] Create photo capture service at `mobile-app/lib/domain/services/photo_capture_service.dart` handling camera plugin, saving to device storage
- [ ] **T055** [US1] Implement image compression/thumbnail generation at `mobile-app/lib/domain/services/image_processing_service.dart` (256x256 thumbnails)
- [ ] **T056** [US1] Wire camera screen to Riverpod state providers at `mobile-app/lib/application/providers/camera_providers.dart`

#### Vision Detection API Integration (Mobile → API)

- [ ] **T057** [US1] Create detection repository at `mobile-app/lib/data/repositories/detection_repository.dart` calling POST /v1/detect with multipart image upload
- [ ] **T058** [US1] Implement detection state management with Riverpod at `mobile-app/lib/application/state/detection_state.dart` tracking loading, success, error states
- [ ] **T059** [US1] Add progress indicator widget at `mobile-app/lib/presentation/detection/detection_progress_widget.dart` shown during API call (>2s requirement)
- [ ] **T060** [US1] Handle detection errors (no internet, API failure) at `mobile-app/lib/presentation/detection/detection_error_widget.dart`

#### Object Detection Results Display (Mobile)

- [ ] **T061** [P] [US1] Create detection results screen at `mobile-app/lib/presentation/detection/detection_results_screen.dart` showing list of detected objects
- [ ] **T062** [P] [US1] Implement object list item widget at `mobile-app/lib/presentation/detection/widgets/object_list_item.dart` with thumbnail, label, confidence
- [ ] **T063** [P] [US1] Create photo viewer with bounding boxes at `mobile-app/lib/presentation/detection/widgets/photo_with_bboxes_widget.dart` using CustomPainter
- [ ] **T064** [US1] Implement tap-to-select object interaction at `mobile-app/lib/presentation/detection/widgets/selectable_bbox_widget.dart` highlighting selected object
- [ ] **T065** [US1] Add spatial boundary visualization at `mobile-app/lib/presentation/detection/widgets/bbox_painter.dart` drawing rectangles on photo

#### Save to Database (Mobile)

- [ ] **T066** [US1] Create inventory repository at `mobile-app/lib/data/repositories/inventory_repository.dart` with Drift insert operations
- [ ] **T067** [US1] Implement save detection flow at `mobile-app/lib/domain/services/inventory_service.dart` converting DetectionResponse → InventoryItems + Labels
- [ ] **T068** [US1] Handle detection data JSON serialization at `mobile-app/lib/data/converters/detection_json_converter.dart` for detectionData column
- [ ] **T069** [US1] Add transaction support for atomic saves at `mobile-app/lib/data/repositories/inventory_repository.dart` (photo + items + labels in single transaction)

#### Ensemble Vision API Implementation (Backend)

- [ ] **T070** [US1] Implement parallel provider execution at `api-service/src/services/vision-orchestrator.service.ts` using Promise.all with 4s timeout per provider
- [ ] **T071** [US1] Implement Non-Maximum Suppression (NMS) at `api-service/src/algorithms/nms.algorithm.ts` merging overlapping detections (IoU > 0.5)
- [ ] **T072** [US1] Implement confidence fusion at `api-service/src/algorithms/confidence-fusion.algorithm.ts` with weights: Meta 30%, Google 30%, AWS 25%, TF 15%
- [ ] **T073** [US1] Implement label consensus voting at `api-service/src/algorithms/label-consensus.algorithm.ts` with majority voting
- [ ] **T074** [US1] Add quality threshold filtering at `api-service/src/services/ensemble-fusion.service.ts` (confidence > 0.7)
- [ ] **T075** [US1] Implement ensemble metrics calculation at `api-service/src/services/ensemble-fusion.service.ts` (averageConfidence, consensusRate)
- [ ] **T076** [US1] Add request/response logging at `api-service/src/middleware/logging.middleware.ts` for debugging ensemble behavior

#### Error Handling & Edge Cases

- [ ] **T077** [US1] Handle no objects detected (blank wall) at `mobile-app/lib/presentation/detection/no_objects_detected_widget.dart` with retake option
- [ ] **T078** [US1] Handle poor lighting/low quality at `api-service/src/services/vision-orchestrator.service.ts` with confidence thresholds
- [ ] **T079** [US1] Handle camera permission denied at `mobile-app/lib/presentation/camera/permission_denied_screen.dart` with settings guidance
- [ ] **T080** [US1] Handle no internet connection at `mobile-app/lib/presentation/detection/no_internet_widget.dart` with retry option

**Checkpoint**: At this point, User Story 1 should be fully functional - users can capture photos, detect objects, and see results

---

## Phase 4: User Story 2 - Label and Organize Inventory Items (Priority: P2)

**Goal**: Users can tap any detected item to add/edit/remove labels (type, color, brand, room, etc.)

**Independent Test**: Load a previously detected item, add 3 labels ("Type: Laptop", "Brand: Apple", "Color: Black"), edit one, delete one, verify all changes persist

### Tests for User Story 2 ⚠️

- [ ] **T081** [P] [US2] Widget test for label editor at `mobile-app/test/presentation/labels/label_editor_screen_test.dart` with add/edit/delete flows
- [ ] **T082** [P] [US2] Unit test for label validation at `mobile-app/test/domain/services/label_validation_test.dart` (max length, special chars)
- [ ] **T083** [P] [US2] Integration test for label CRUD at `mobile-app/integration_test/label_crud_test.dart` with database persistence
- [ ] **T084** [P] [US2] E2E test with Maestro at `mobile-app/.maestro/label-management.yaml` for complete label editing journey

### Implementation for User Story 2

#### Label UI Components

- [ ] **T085** [P] [US2] Create label editor screen at `mobile-app/lib/presentation/labels/label_editor_screen.dart` with add/edit/delete actions
- [ ] **T086** [P] [US2] Implement label input widget at `mobile-app/lib/presentation/labels/widgets/label_input_widget.dart` with TextField and save button
- [ ] **T087** [P] [US2] Create label chip widget at `mobile-app/lib/presentation/labels/widgets/label_chip.dart` displaying key: value with edit/delete icons
- [ ] **T088** [P] [US2] Implement label list view at `mobile-app/lib/presentation/labels/widgets/label_list_view.dart` showing all labels for an item

#### Label Business Logic

- [ ] **T089** [US2] Create label repository at `mobile-app/lib/data/repositories/label_repository.dart` with Drift CRUD operations
- [ ] **T090** [US2] Implement label service at `mobile-app/lib/domain/services/label_service.dart` with validation (max 100 chars, no special chars)
- [ ] **T091** [US2] Add label state management with Riverpod at `mobile-app/lib/application/state/label_state.dart` tracking labels per item
- [ ] **T092** [US2] Implement optimistic updates at `mobile-app/lib/application/state/label_state.dart` (update UI immediately, sync to DB)

#### Label Editing Flow

- [ ] **T093** [US2] Wire tap-on-item → open label editor at `mobile-app/lib/presentation/detection/detection_results_screen.dart` navigation
- [ ] **T094** [US2] Implement add new label flow at `mobile-app/lib/presentation/labels/label_editor_screen.dart` with validation
- [ ] **T095** [US2] Implement edit existing label at `mobile-app/lib/presentation/labels/widgets/label_chip.dart` making text editable on tap
- [ ] **T096** [US2] Implement delete label with confirmation at `mobile-app/lib/presentation/labels/widgets/label_chip.dart` swipe-to-delete gesture
- [ ] **T097** [US2] Add save confirmation feedback at `mobile-app/lib/presentation/labels/label_editor_screen.dart` with animation/snackbar

#### Label Persistence & Sync

- [ ] **T098** [US2] Implement cascade delete (item deleted → all labels deleted) at Drift schema `mobile-app/lib/data/database/tables/labels.dart`
- [ ] **T099** [US2] Add label creation timestamp at `mobile-app/lib/data/repositories/label_repository.dart`
- [ ] **T100** [US2] Update FTS5 index on label changes at `mobile-app/lib/data/repositories/label_repository.dart` with triggers

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - capture + label management complete

---

## Phase 5: User Story 3 - Search and Find Items by Labels (Priority: P3)

**Goal**: Users can search entire inventory using labels, see matching items with photos, and open item details

**Independent Test**: Create 20 items with various labels, search for "electronics", verify only matching items appear, search "black laptop" to test multi-term search

### Tests for User Story 3 ⚠️

- [ ] **T101** [P] [US3] Unit test for FTS5 search at `mobile-app/test/data/repositories/search_repository_test.dart` with partial matching
- [ ] **T102** [P] [US3] Integration test for multi-term search at `mobile-app/integration_test/search_flow_test.dart` with AND logic
- [ ] **T103** [P] [US3] Widget test for search screen at `mobile-app/test/presentation/search/search_screen_test.dart` with mock results
- [ ] **T104** [P] [US3] E2E test with Maestro at `mobile-app/.maestro/search-inventory.yaml` for complete search journey

### Implementation for User Story 3

#### Search UI Components

- [ ] **T105** [P] [US3] Create search screen at `mobile-app/lib/presentation/search/search_screen.dart` with search bar and results grid
- [ ] **T106** [P] [US3] Implement search bar widget at `mobile-app/lib/presentation/search/widgets/search_bar_widget.dart` with debounced input (300ms)
- [ ] **T107** [P] [US3] Create search result item widget at `mobile-app/lib/presentation/search/widgets/search_result_item.dart` showing thumbnail, labels, match highlights
- [ ] **T108** [P] [US3] Implement empty search results at `mobile-app/lib/presentation/search/widgets/empty_search_results.dart` with suggestions

#### Search Business Logic

- [ ] **T109** [US3] Create search repository at `mobile-app/lib/data/repositories/search_repository.dart` using Drift FTS5 queries
- [ ] **T110** [US3] Implement FTS5 full-text search at `mobile-app/lib/data/repositories/search_repository.dart` with MATCH operator
- [ ] **T111** [US3] Add partial matching support at `mobile-app/lib/data/repositories/search_repository.dart` (e.g., "lap" → "laptop")
- [ ] **T112** [US3] Implement multi-term search (AND logic) at `mobile-app/lib/data/repositories/search_repository.dart` for "black laptop"
- [ ] **T113** [US3] Add search ranking by relevance at `mobile-app/lib/data/repositories/search_repository.dart` using FTS5 rank

#### Search State Management

- [ ] **T114** [US3] Create search state with Riverpod at `mobile-app/lib/application/state/search_state.dart` tracking query, results, loading
- [ ] **T115** [US3] Implement search debouncing at `mobile-app/lib/application/state/search_state.dart` (wait 300ms after typing stops)
- [ ] **T116** [US3] Add search history at `mobile-app/lib/application/state/search_history_state.dart` storing recent queries (SharedPreferences)

#### Search Results & Navigation

- [ ] **T117** [US3] Implement tap-on-result → open item details at `mobile-app/lib/presentation/search/search_screen.dart` with navigation
- [ ] **T118** [US3] Add match highlighting at `mobile-app/lib/presentation/search/widgets/search_result_item.dart` (bold matching terms)
- [ ] **T119** [US3] Handle no results found at `mobile-app/lib/presentation/search/widgets/empty_search_results.dart` with helpful message
- [ ] **T120** [US3] Add search performance optimization at `mobile-app/lib/data/repositories/search_repository.dart` (limit results to 100)

**Checkpoint**: All core user stories (1, 2, 3) should now be independently functional - capture, label, search complete

---

## Phase 6: User Story 4 - Instagram-Style Minimal UI Experience (Priority: P2)

**Goal**: Clean, gesture-driven, photo-centric UI with minimal text, swipe navigation, and immediate visual feedback

**Independent Test**: Non-technical user completes capture → label → search flow without instructions, measuring intuitive usability

### Tests for User Story 4 ⚠️

- [ ] **T121** [P] [US4] Widget test for gesture navigation at `mobile-app/test/presentation/navigation/gesture_navigation_test.dart` with swipe gestures
- [ ] **T122** [P] [US4] Widget test for visual feedback animations at `mobile-app/test/presentation/common/visual_feedback_test.dart` for success/error states
- [ ] **T123** [P] [US4] Integration test for 60fps scrolling at `mobile-app/integration_test/performance_test.dart` measuring frame timing
- [ ] **T124** [P] [US4] E2E test with Maestro at `mobile-app/.maestro/ui-ux-flow.yaml` validating minimal UI and gestures

### Implementation for User Story 4

#### Main Navigation & Layout

- [ ] **T125** [P] [US4] Create home screen at `mobile-app/lib/presentation/home/home_screen.dart` with inventory grid and prominent camera button
- [ ] **T126** [P] [US4] Implement inventory grid view at `mobile-app/lib/presentation/home/widgets/inventory_grid.dart` with photo thumbnails (Instagram-style)
- [ ] **T127** [P] [US4] Add floating camera button at `mobile-app/lib/presentation/home/widgets/floating_camera_button.dart` (always accessible)
- [ ] **T128** [P] [US4] Implement bottom navigation at `mobile-app/lib/presentation/navigation/bottom_nav.dart` with home, search icons only

#### Gesture-Based Navigation

- [ ] **T129** [US4] Implement swipe-up scrolling at `mobile-app/lib/presentation/home/widgets/inventory_grid.dart` with smooth scrolling
- [ ] **T130** [US4] Add swipe-down to dismiss at `mobile-app/lib/presentation/detection/detection_results_screen.dart` returning to grid
- [ ] **T131** [US4] Implement pinch-to-zoom on photos at `mobile-app/lib/presentation/detection/widgets/photo_with_bboxes_widget.dart` with InteractiveViewer
- [ ] **T132** [US4] Add swipe-to-delete label at `mobile-app/lib/presentation/labels/widgets/label_chip.dart` with Dismissible widget

#### Visual Feedback & Animations

- [ ] **T133** [P] [US4] Create success animation at `mobile-app/lib/presentation/common/animations/success_animation.dart` (checkmark fade)
- [ ] **T134** [P] [US4] Create loading animation at `mobile-app/lib/presentation/common/animations/loading_animation.dart` (subtle spinner)
- [ ] **T135** [P] [US4] Implement photo capture flash animation at `mobile-app/lib/presentation/camera/widgets/capture_flash.dart`
- [ ] **T136** [P] [US4] Add item save animation at `mobile-app/lib/presentation/detection/detection_results_screen.dart` (fade + slide)

#### Minimal Design & Iconography

- [ ] **T137** [US4] Remove all unnecessary text at `mobile-app/lib/presentation/` screens, replace with icons + tooltips
- [ ] **T138** [US4] Implement photo-centric layout at `mobile-app/lib/presentation/home/widgets/inventory_grid.dart` (large thumbnails, minimal text)
- [ ] **T139** [US4] Add clear iconography at `mobile-app/lib/presentation/common/icons/app_icons.dart` (camera, search, edit, delete)
- [ ] **T140** [US4] Apply Instagram-style theme at `mobile-app/lib/presentation/theme/app_theme.dart` (white/black, minimal colors)

#### Performance Optimization

- [ ] **T141** [US4] Implement lazy loading for inventory grid at `mobile-app/lib/presentation/home/widgets/inventory_grid.dart` (load 20 items at a time)
- [ ] **T142** [US4] Add image caching at `mobile-app/lib/domain/services/image_cache_service.dart` using CachedNetworkImage
- [ ] **T143** [US4] Optimize thumbnail generation at `mobile-app/lib/domain/services/image_processing_service.dart` (async, background isolate)
- [ ] **T144** [US4] Ensure 60fps scrolling at `mobile-app/lib/presentation/home/widgets/inventory_grid.dart` with RepaintBoundary

**Checkpoint**: All user stories complete - app has full functionality with Instagram-style minimal UX

---

## Phase 7: Integration & Self-Hosted Services (Meta + TensorFlow)

**Purpose**: Add Meta Detectron2 and TensorFlow Serving for full 4-provider ensemble

**Note**: This phase implements the full ensemble. Phase 1-6 can use just Google + AWS (2-provider baseline)

### Meta Detectron2 Setup

- [ ] **T145** [P] Create Dockerfile for Meta Detectron2 at `api-service/ml-services/meta-detectron2/Dockerfile` with TorchServe
- [ ] **T146** [P] Download and configure Detectron2 model at `api-service/ml-services/meta-detectron2/models/`
- [ ] **T147** [P] Create TorchServe handler at `api-service/ml-services/meta-detectron2/handler.py` for object detection API
- [ ] **T148** [P] Deploy Meta service to Cloud Run at `api-service/ml-services/meta-detectron2/deploy.sh`
- [ ] **T149** Implement Meta adapter at `api-service/src/adapters/meta-detectron2.adapter.ts` with circuit breaker
- [ ] **T150** Update vision orchestrator to include Meta at `api-service/src/services/vision-orchestrator.service.ts`

### TensorFlow Serving Setup

- [ ] **T151** [P] Create Dockerfile for TensorFlow Serving at `api-service/ml-services/tensorflow/Dockerfile`
- [ ] **T152** [P] Fine-tune TensorFlow model on Open Images (Kitchen & Furniture) at `api-service/ml-services/tensorflow/train.py`
- [ ] **T153** [P] Export trained model for TensorFlow Serving at `api-service/ml-services/tensorflow/export_model.py`
- [ ] **T154** [P] Deploy TensorFlow service to Cloud Run at `api-service/ml-services/tensorflow/deploy.sh`
- [ ] **T155** Implement TensorFlow adapter at `api-service/src/adapters/tensorflow-serving.adapter.ts` with circuit breaker
- [ ] **T156** Update vision orchestrator to include TensorFlow at `api-service/src/services/vision-orchestrator.service.ts`

### Ensemble Weight Optimization

- [ ] **T157** Update ensemble fusion weights at `api-service/src/config/ensemble-weights.config.ts` to Meta:30%, Google:30%, AWS:25%, TF:15%
- [ ] **T158** Add provider performance metrics at `api-service/src/services/metrics.service.ts` tracking accuracy, latency per provider
- [ ] **T159** Implement dynamic weight adjustment at `api-service/src/services/ensemble-fusion.service.ts` based on production metrics

### Integration Tests for Full Ensemble

- [ ] **T160** [P] Integration test for 4-provider ensemble at `api-service/tests/integration/full-ensemble.integration.test.ts` with all providers
- [ ] **T161** [P] Load test at `api-service/tests/load/ensemble-load.test.ts` simulating 100 concurrent requests
- [ ] **T162** [P] Accuracy benchmark at `api-service/tests/benchmarks/accuracy.benchmark.ts` measuring mAP on test dataset

**Checkpoint**: Full 4-provider ensemble operational, achieving 92-95% accuracy target

---

## Phase 8: DevOps & Deployment

**Purpose**: CI/CD, monitoring, deployment infrastructure

### CI/CD Pipeline

- [ ] **T163** [P] Create GitHub Actions workflow at `.github/workflows/mobile-ci.yml` for Flutter (lint, test, build)
- [ ] **T164** [P] Create GitHub Actions workflow at `.github/workflows/api-ci.yml` for Node.js (lint, test, build, deploy)
- [ ] **T165** [P] Setup Codemagic for iOS/Android builds at `codemagic.yaml`
- [ ] **T166** [P] Configure test coverage reporting at `.github/workflows/coverage.yml` with 80% threshold

### Deployment

- [ ] **T167** Create Cloud Run deployment at `api-service/deploy/cloud-run.yaml` for API service
- [ ] **T168** [P] Setup environment variables at `api-service/deploy/env.yaml` for API keys, timeouts
- [ ] **T169** [P] Create Firebase App Distribution setup at `mobile-app/fastlane/Fastfile` for beta testing
- [ ] **T170** [P] Setup TestFlight deployment at `mobile-app/fastlane/Fastfile` for iOS beta

### Monitoring & Observability

- [ ] **T171** [P] Setup Sentry error tracking at `mobile-app/lib/core/monitoring/sentry_setup.dart` and `api-service/src/monitoring/sentry.ts`
- [ ] **T172** [P] Implement provider health monitoring at `api-service/src/services/health-monitor.service.ts` pinging providers every 60s
- [ ] **T173** [P] Add performance metrics at `mobile-app/lib/core/monitoring/performance_metrics.dart` tracking app launch, detection time
- [ ] **T174** [P] Create Cloud Monitoring dashboard at `api-service/deploy/monitoring-dashboard.json` for ensemble metrics

### Cost Monitoring

- [ ] **T175** Implement usage analytics at `api-service/src/services/analytics.service.ts` tracking API calls per provider
- [ ] **T176** Create cost alert at `api-service/deploy/cost-alerts.yaml` notifying if spending exceeds $100/month
- [ ] **T177** Add cost optimization recommendations at `api-service/src/services/cost-optimizer.service.ts` based on usage patterns

**Checkpoint**: Production-ready deployment with monitoring and cost controls

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] **T178** [P] Add comprehensive error messages at `mobile-app/lib/core/errors/error_messages.dart` for all error types
- [ ] **T179** [P] Implement analytics tracking at `mobile-app/lib/core/analytics/analytics_service.dart` for user behavior (privacy-compliant)
- [ ] **T180** [P] Add accessibility labels at `mobile-app/lib/presentation/` screens with Semantics widgets
- [ ] **T181** [P] Optimize app size at `mobile-app/pubspec.yaml` removing unused dependencies
- [ ] **T182** [P] Add app launch performance optimization at `mobile-app/lib/main.dart` with deferred loading
- [ ] **T183** Code cleanup and refactoring across all modules
- [ ] **T184** [P] Update documentation at `mobile-app/README.md` and `api-service/README.md`
- [ ] **T185** [P] Create user guide at `docs/USER_GUIDE.md` with screenshots
- [ ] **T186** [P] Validate against quickstart.md at `specs/001-build-a-mobile/quickstart.md`
- [ ] **T187** Security hardening: API rate limiting at `api-service/src/middleware/rate-limit.middleware.ts`
- [ ] **T188** [P] Add unit tests for remaining edge cases at `mobile-app/test/` and `api-service/tests/`
- [ ] **T189** Performance profiling with Flutter DevTools and fix bottlenecks
- [ ] **T190** Final E2E testing with Maestro covering all user stories at `mobile-app/.maestro/full-app-flow.yaml`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories CAN proceed in parallel if team capacity allows
  - Recommended sequential: US1 (P1) → US2 (P2) → US3 (P3) → US4 (P2)
- **Integration (Phase 7)**: Optional - can start with 2-provider baseline (Google + AWS only)
- **DevOps (Phase 8)**: Can start after Phase 2, runs parallel with user stories
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories ✅
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Requires US1 data but independently testable ✅
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Requires US1+US2 data but independently testable ✅
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Affects all stories but can be developed independently ✅

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Services before UI/endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T001-T009)
- All Foundational tasks marked [P] can run in parallel within Phase 2
- **Once Foundational phase completes, all user stories CAN start in parallel** (US1, US2, US3, US4)
- Tests within a story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Phase 8 (DevOps) can run parallel with user story implementation

---

## Parallel Example: User Story 1

```bash
# Phase 2 Foundation must complete first
# Then launch all User Story 1 tests together:
Task: "T043 Contract test for POST /v1/detect endpoint"
Task: "T044 Integration test for ensemble fusion"
Task: "T045 Unit test for NMS algorithm"
Task: "T046 Unit test for weighted confidence fusion"
Task: "T047 Unit test for label consensus voting"
Task: "T048 Widget test for camera screen"
Task: "T049 Widget test for detection results screen"
Task: "T050 Integration test for photo capture flow"
Task: "T051 E2E test with Maestro"

# After tests fail, launch parallelizable implementation tasks:
Task: "T052 Create camera permission handler"
Task: "T053 Implement camera screen"
Task: "T054 Create photo capture service"
Task: "T061 Create detection results screen"
Task: "T062 Implement object list item widget"
Task: "T063 Create photo viewer with bounding boxes"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

**Goal**: Ship working object detection in 2 weeks

1. Complete Phase 1: Setup (T001-T009)
2. Complete Phase 2: Foundational (T010-T042) - CRITICAL BLOCKING PHASE
3. Complete Phase 3: User Story 1 (T043-T080) - Core detection flow
4. **STOP and VALIDATE**: Test US1 independently with 10 real photos
5. Use 2-provider baseline (Google + AWS only) - skip Phase 7 for MVP
6. Deploy API to Cloud Run, distribute mobile app via TestFlight/Firebase
7. Get user feedback before proceeding

**MVP Scope**: ~80 tasks (T001-T080)
**Timeline**: 2 weeks with 2 developers
**Cost**: ~$25/month (Google + AWS only)

### Incremental Delivery

**Week 1-2**: Setup + Foundation + US1 (Object Detection MVP) → Deploy
**Week 3**: US2 (Label Management) → Test independently → Deploy
**Week 4**: US3 (Search) + US4 (UI Polish) → Test independently → Deploy
**Week 5**: Phase 7 (Full 4-provider ensemble) → Accuracy validation → Deploy
**Week 6**: Phase 8 (DevOps) + Phase 9 (Polish) → Production ready

### Parallel Team Strategy

With 3 developers after Foundation phase completes:

1. **All devs together**: Phase 1 (Setup) + Phase 2 (Foundation) - Week 1
2. **Split after Foundation**:
   - Developer A: User Story 1 (Camera + Detection)
   - Developer B: User Story 2 (Labels) + User Story 3 (Search)
   - Developer C: User Story 4 (UI/UX) + Phase 8 (DevOps)
3. **Week 2**: Integration + testing
4. **Week 3**: Phase 7 (Full ensemble) + Phase 9 (Polish)

---

## Summary

- **Total Tasks**: 190
- **Setup**: 9 tasks (T001-T009)
- **Foundational**: 33 tasks (T010-T042) ⚠️ BLOCKS all user stories
- **User Story 1 (P1)**: 38 tasks (T043-T080) 🎯 MVP
- **User Story 2 (P2)**: 20 tasks (T081-T100)
- **User Story 3 (P3)**: 20 tasks (T101-T120)
- **User Story 4 (P2)**: 24 tasks (T121-T144)
- **Integration (Phase 7)**: 18 tasks (T145-T162) - Optional for MVP
- **DevOps (Phase 8)**: 15 tasks (T163-T177)
- **Polish (Phase 9)**: 13 tasks (T178-T190)

**Parallel Opportunities**: 89 tasks marked [P] can run in parallel
**MVP Scope**: Phase 1 + 2 + 3 = 80 tasks for working object detection
**Full App**: All 190 tasks for complete feature set with 4-provider ensemble

**Independent Test Criteria**:
- **US1**: Take photo of 3-5 items → verify detection within 5s
- **US2**: Add/edit/delete labels → verify persistence
- **US3**: Search "electronics" → verify correct results
- **US4**: Non-technical user completes flow without instructions

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD approach)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Phase 2 is CRITICAL**: No user story work can begin until Foundation completes
- Start with 2-provider baseline (Google + AWS), add Meta + TF in Phase 7
- Target >80% code coverage across all tests
