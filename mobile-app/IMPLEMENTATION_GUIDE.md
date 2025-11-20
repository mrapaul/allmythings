# Frontend Implementation Guide

## Overview

This document describes the complete frontend implementation for the home object recognition feature in the Flutter mobile app.

## Architecture

The implementation follows **Clean Architecture** with these layers:

```
lib/
├── presentation/      # UI layer (Screens, Widgets)
├── application/       # State management (Riverpod Providers, State)
├── data/             # Data layer (Repositories, Database, API)
└── domain/           # Business logic (Models, Services)
```

## 1. Database Schema (Drift)

### Tables

#### InventoryItems
- `id`: Integer (auto-increment, PK)
- `photoPath`: Text (full-resolution photo path)
- `thumbnailPath`: Text (256x256 thumbnail path)
- `detectionData`: Text (JSON detection metadata)
- `createdAt`: DateTime
- `updatedAt`: DateTime

#### Labels
- `id`: Integer (auto-increment, PK)
- `itemId`: Integer (FK to InventoryItems)
- `key`: Text (nullable, e.g., "Category", "Brand")
- `value`: Text (label value)
- `createdAt`: DateTime

#### LabelSearchFts (FTS5 Virtual Table)
- `labelId`: Integer (references Labels.id)
- `value`: Text (indexed for full-text search)
- Tokenizer: porter unicode61 with diacritics removal

#### Categories
- `id`: Integer (auto-increment, PK)
- `name`: Text (unique category name)
- `iconName`: Text (nullable, Material icon name)
- `colorHex`: Text (nullable, hex color code)
- `isSystem`: Boolean (system vs user-defined)
- `createdAt`: DateTime

#### ItemCategories (Junction Table)
- `itemId`: Integer (FK to InventoryItems)
- `categoryId`: Integer (FK to Categories)
- `createdAt`: DateTime
- Composite PK: (itemId, categoryId)

#### SyncQueue
- `id`: Integer (auto-increment, PK)
- `itemId`: Integer (FK to InventoryItems)
- `operation`: Text ('create', 'update', 'delete')
- `retryCount`: Integer
- `lastError`: Text (nullable)
- `queuedAt`: DateTime
- `lastAttemptAt`: DateTime (nullable)

### Indexes

```sql
CREATE INDEX idx_items_created_at ON inventory_items(created_at DESC);
CREATE INDEX idx_labels_item_id ON labels(item_id);
CREATE INDEX idx_labels_value ON labels(value);
CREATE INDEX idx_sync_queue_queued_at ON sync_queue(queued_at);
CREATE INDEX idx_item_categories_item_id ON item_categories(item_id);
CREATE INDEX idx_item_categories_category_id ON item_categories(category_id);
```

### FTS5 Triggers

Automatically sync Labels table changes to FTS virtual table:
- `label_search_insert`: On INSERT to labels
- `label_search_update`: On UPDATE to labels
- `label_search_delete`: On DELETE from labels

### Default Categories

12 system categories pre-seeded:
- Kitchen, Living Room, Bedroom, Bathroom
- Office, Electronics, Tools, Clothing
- Books, Toys, Sports, Other

## 2. State Management (Riverpod)

### Database Provider
```dart
final databaseProvider = Provider<AppDatabase>((ref) => AppDatabase());
```

### Camera Providers

#### CameraControllerProvider
- **Type**: StateNotifierProvider<CameraControllerNotifier, CameraControllerState>
- **State**: { controller, isInitialized, error }
- **Methods**:
  - `initialize(CameraDescription)`: Initialize camera
  - `toggleFlash()`: Toggle flash mode
  - `switchCamera(List<CameraDescription>)`: Switch front/back

#### AvailableCamerasProvider
- **Type**: FutureProvider<List<CameraDescription>>
- Returns available camera devices

#### FlashModeProvider
- **Type**: Provider<FlashMode>
- Watches current flash mode from controller

### Inventory Providers

#### InventoryRepositoryProvider
- **Type**: Provider<InventoryRepository>
- Provides repository instance with database injection

#### InventoryItemsProvider
- **Type**: AsyncNotifierProvider<List<InventoryItem>>
- Manages all inventory items list
- Auto-refreshes on invalidation

#### InventoryItemProvider(itemId)
- **Type**: FutureProvider.family<InventoryItem?, int>
- Get single item by ID

#### ItemLabelsProvider(itemId)
- **Type**: FutureProvider.family<List<Label>, int>
- Get labels for specific item

#### SearchResultsProvider(query)
- **Type**: FutureProvider.family<List<InventoryItem>, String>
- Full-text search via FTS5

#### InventoryStatsProvider
- **Type**: FutureProvider<InventoryStats>
- Statistics: totalItems, totalLabels, totalCategories, lastCaptured

### Search Providers

#### SearchQueryProvider
- **Type**: StateProvider<String>
- Current search query

#### CategoriesProvider
- **Type**: FutureProvider<List<Category>>
- All available categories for filter chips

## 3. UI Screens

### CameraCaptureScreen
**Path**: `/camera`

**Features**:
- Full-screen camera preview
- Icon-only minimal UI
- Flash toggle (top-left)
- Camera switch (top-right)
- Capture button (bottom-center)
- Close button (top-left)

**Flow**:
1. Initialize back camera on mount
2. User taps capture → Save to temp directory
3. Navigate to `/detection` with File as extra

### InventoryFeedScreen (Home)
**Path**: `/items`

**Features**:
- 3-column Instagram-style grid
- Hero animations to detail view
- Pull-to-refresh
- FAB: Camera button
- Search icon in AppBar
- Empty state with instructional message

**Layout**:
```
┌─────────────────────────────────┐
│ My Inventory          [search]  │
├─────────────────────────────────┤
│ ┌───┬───┬───┐                   │
│ │ 1 │ 2 │ 3 │                   │
│ ├───┼───┼───┤                   │
│ │ 4 │ 5 │ 6 │                   │
│ └───┴───┴───┘                   │
│                         [FAB]   │
└─────────────────────────────────┘
```

### ItemDetailScreen
**Path**: `/item/:id`

**Features**:
- Hero animation from grid
- InteractiveViewer for zoom/pan
- Labels as chips
- Edit button (navigate to `/edit/:id`)
- Delete button (with confirmation dialog)
- Created timestamp

**Layout**:
```
┌─────────────────────────────────┐
│ ←              [edit] [delete]  │
├─────────────────────────────────┤
│                                 │
│     [Hero Zoomable Image]       │
│                                 │
├─────────────────────────────────┤
│ Labels:                         │
│ [chip] [chip] [chip]            │
│                                 │
│ Created: 2025-11-18 12:34       │
└─────────────────────────────────┘
```

### SearchScreen
**Path**: `/search`

**Features**:
- Search bar in AppBar with clear button
- Real-time FTS5 search
- Results as list with thumbnails
- Empty state messaging
- Highlight search terms (future enhancement)

**States**:
- Empty query: Shows search prompt
- No results: Shows "No results found"
- Results: List view with thumbnails

### DetectionResultsScreen (Placeholder)
**Path**: `/detection`

**Planned Features**:
- Full-screen image with bounding boxes
- Tap boxes to toggle selection
- Confidence scores on boxes
- Select all / Deselect all buttons
- Confirm button to save selected objects

### EditLabelsScreen (Placeholder)
**Path**: `/edit/:id`

**Planned Features**:
- Object image thumbnail
- Chip-based label input (add/remove)
- Category dropdown
- Custom tags input
- Save/Cancel buttons

## 4. Navigation & Routing

### GoRouter Configuration

**Routes**:
- `/items` (home) → InventoryFeedScreen
- `/camera` → CameraCaptureScreen
- `/detection` → DetectionResultsScreen (receives File extra)
- `/item/:id` → ItemDetailScreen
- `/edit/:id` → EditLabelsScreen
- `/search` → SearchScreen

**Transitions**:
- Slide up: Camera screen
- Slide left: Edit screen
- Fade: Detail & Search screens

**Example**:
```dart
context.push('/camera');
context.push('/detection', extra: imageFile);
context.push('/item/123');
```

## 5. UI Components & Theme

### AppTheme
- Material Design 3
- Colors: primaryBlack (#0A0A0A), primaryWhite (#FFFFFF)
- Accents: Blue (#0A84FF), Green (#34C759), Orange (#FF9500), Red (#FF3B30)
- Typography: SF Pro-inspired with varied weights
- Shadows: shadowSm, shadowMd, shadowLg, shadowXl
- Border radius: 8-24px depending on context

### Reusable Components

#### CustomAppBar
- Centered title
- Minimal elevation
- Custom title widget support

#### Loading Indicators
- Circular progress for async operations
- Skeleton screens (future enhancement)

#### Error Views
- Icon + message
- Retry button option

## 6. Data Flow

### Adding an Item (Happy Path)

1. **Capture**:
   ```
   User taps FAB → Navigate to /camera
   → CameraControllerProvider initializes
   → User taps capture → Save to temp file
   ```

2. **Detection**:
   ```
   Navigate to /detection with File
   → DetectionProvider.detectObjects(file)
   → ApiClient calls backend /detect
   → Response with detections + bounding boxes
   → User selects objects
   ```

3. **Save**:
   ```
   User taps confirm
   → InventoryRepository.createItem(...)
   → Insert into InventoryItems table
   → Insert labels into Labels table
   → FTS triggers auto-index labels
   → Add to SyncQueue for backend sync
   → Invalidate InventoryItemsProvider
   → Navigate back to /items
   ```

4. **Background Sync**:
   ```
   SyncService polls SyncQueue
   → Process pending items
   → Upload to backend API
   → On success: Remove from queue
   → On failure: Increment retryCount
   ```

### Searching (FTS5)

```
User types in SearchScreen
→ searchResultsProvider(query) watches
→ Database.searchLabels(query) via FTS5
→ Match labels → Get distinct item IDs
→ Fetch InventoryItems by IDs
→ Display results
```

## 7. Offline-First Strategy

### Principles
- All reads from local Drift database
- All writes to local database first, then queue for sync
- UI always responsive (no network wait)
- Background sync with retry logic

### Sync Queue Processing
1. Check for pending SyncQueueItems
2. For each item:
   - Attempt API call (create/update/delete)
   - On success: Remove from queue
   - On failure: Increment retryCount, log error
   - Max retries: 3 (configurable)

## 8. Testing Strategy

### Unit Tests
- Repository methods (CRUD operations)
- Database queries (FTS search, category joins)
- State notifiers (camera, detection, search)

### Widget Tests
- Screen rendering
- User interactions (button taps, text input)
- Navigation flows
- Error states

### Integration Tests
- Full capture → detect → save flow
- Search functionality
- Offline/online sync scenarios

### Example Test Locations
```
test/
├── data/
│   └── repositories/
│       ├── inventory_repository_test.dart
│       └── detection_repository_test.dart
├── application/
│   └── providers/
│       ├── camera_providers_test.dart
│       └── search_providers_test.dart
└── presentation/
    └── screens/
        ├── camera_capture_screen_test.dart
        ├── inventory_feed_screen_test.dart
        └── search_screen_test.dart
```

## 9. Build & Run

### Generate Code
```bash
cd mobile-app
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

### Run App
```bash
# iOS Simulator
flutter run -d iPhone

# Android Emulator
flutter run -d emulator-5554

# Physical Device
flutter run
```

### Run Tests
```bash
# All tests
flutter test

# Specific test file
flutter test test/data/repositories/inventory_repository_test.dart

# Integration tests
flutter test integration_test/
```

## 10. File Structure

```
lib/
├── application/
│   ├── providers/
│   │   ├── camera_providers.dart
│   │   ├── database_provider.dart
│   │   ├── detection_providers.dart
│   │   ├── inventory_providers.dart
│   │   └── search_providers.dart
│   └── state/
│       └── detection_state.dart (if using Freezed)
├── core/
│   ├── config/
│   │   └── app_config.dart
│   ├── errors/
│   │   └── failures.dart
│   └── permissions/
│       └── camera_permission.dart
├── data/
│   ├── database/
│   │   ├── app_database.dart
│   │   ├── app_database.g.dart (generated)
│   │   └── tables/
│   │       ├── inventory_items.dart
│   │       ├── labels.dart
│   │       ├── label_search_fts.dart
│   │       ├── categories.dart
│   │       ├── item_categories.dart
│   │       └── sync_queue.dart
│   ├── remote/
│   │   └── api_client.dart
│   └── repositories/
│       ├── inventory_repository.dart
│       └── detection_repository.dart
├── domain/
│   ├── models/
│   │   ├── detection.dart
│   │   ├── bounding_box.dart
│   │   ├── ensemble_details.dart
│   │   └── alternative_label.dart
│   └── services/
│       └── image_processing_service.dart
├── presentation/
│   ├── common/
│   │   ├── custom_app_bar.dart
│   │   ├── error_view.dart
│   │   └── loading_indicator.dart
│   ├── routing/
│   │   └── app_router.dart
│   ├── screens/
│   │   ├── camera_capture_screen.dart
│   │   ├── inventory_feed_screen.dart
│   │   ├── item_detail_screen.dart
│   │   └── search_screen.dart (also in /search/)
│   ├── detection/
│   │   └── widgets/
│   │       └── bounding_box_painter.dart
│   ├── home/
│   │   └── inventory_feed_screen.dart
│   ├── items/
│   │   └── item_detail_screen.dart
│   ├── search/
│   │   └── search_screen.dart
│   └── theme/
│       └── app_theme.dart
└── main.dart
```

## 11. Next Steps

### Immediate
1. ✅ Implement DetectionResultsScreen with BoundingBoxPainter
2. ✅ Implement EditLabelsScreen with chip input
3. ✅ Add API client detection method
4. ✅ Implement background sync service
5. ✅ Add permission handling (camera, photo library)

### Future Enhancements
1. ✅ Add category filters to search
2. ✅ Implement search term highlighting
3. ✅ Add batch operations (delete multiple items)
4. ✅ Implement image optimization (compression)
5. ✅ Add analytics tracking
6. ✅ Implement export/import functionality
7. ✅ Add cloud backup integration

## 12. Known Issues & Limitations

1. ✅ FTS5 search is case-insensitive but doesn't handle typos
2. ✅ No image caching beyond Drift storage
3. ✅ Sync service doesn't handle conflicts (last-write-wins)
4. ✅ No user authentication (future requirement)
5. ✅ Max image size limited by device storage

## 13. Performance Considerations

### Database
- Indexes on frequently queried columns
- FTS5 for fast text search
- Limit query results (pagination if needed)

### Images
- Store both full-res and thumbnail
- Use thumbnail in grid views
- InteractiveViewer for zoom (no re-render)

### State Management
- Use .family providers for item-specific data
- Invalidate only when necessary
- AsyncNotifier for complex async operations

### UI
- Hero animations for smooth transitions
- GridView.builder for lazy loading
- Debounce search input (300ms)

---

**Last Updated**: 2025-11-18
**Version**: 1.0.0
**Author**: Claude Code Assistant
