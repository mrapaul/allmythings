# 🎉 Complete Instagram-Style Home Inventory App

## Overview

A **minimalistic, resilient, fully functional** home inventory app with Instagram-style UI and AI-powered object detection.

## 📜 Development Constitution

This project follows strict development principles defined in `.specify/memory/constitution.md`:

**Core Principles**:
- ✅ **Test-First Development (TDD)**: All code written test-first (Red-Green-Refactor)
- ✅ **Code Coverage >80%**: Enforced in CI pipeline with multi-layer testing
- ✅ **Clean Architecture**: Feature-first organization, SOLID principles, repository pattern
- ✅ **Technology Excellence**: Best-of-breed tools with documented evaluations
- ✅ **CI/CD Pipeline**: Fully automated testing, builds, and deployment

**Quality Gates**:
- All tests must pass before merge
- >80% code coverage required
- Zero linting errors/warnings
- Type safety enforced (TypeScript strict, Dart sound null safety)
- Security scanning (no high/critical vulnerabilities)

See `.specify/memory/constitution.md` for complete details.

---

## ✨ Features

### Instagram-Style Navigation
- **Bottom Navigation Bar** with 4 tabs:
  - 🏠 **Home**: Instagram photo grid of your inventory
  - 🔍 **Search**: Full-text search across all labels
  - ➕ **Camera**: Capture and detect objects
  - 👤 **Profile**: Stats and settings

### Smart Object Detection
- **Ensemble AI**: Multi-provider vision detection (Google Cloud Vision + AWS Rekognition)
- **Auto-labeling**: Objects automatically labeled with detected names
- **Confidence Scores**: See how confident the AI is about each detection
- **Provider Agreement**: Know how many AI providers agreed on the label

### Label Management
- **Add Labels**: Tap "Edit" to add custom key-value labels
  - Examples: `Color: Red`, `Brand: Nike`, `Room: Kitchen`
- **Edit Labels**: Tap edit icon to modify existing labels
- **Delete Labels**: Swipe left to delete labels
- **Search by Labels**: Full-text search finds items instantly

### Home Feed
- **Instagram Grid**: 3-column photo grid showing all items
- **Pull to Refresh**: Swipe down to refresh your inventory
- **Tap to View**: Tap any item to see full details
- **Empty State**: Helpful prompt when no items exist

### Item Details
- **Full-Screen Photo**: View photos in high quality
- **All Labels**: See all labels for the item
- **Detection Info**: View AI confidence, provider agreement, consensus
- **Quick Actions**: Edit labels or delete items

### Search
- **Real-time Search**: Type to search instantly
- **FTS5 Powered**: Fast full-text search using SQLite FTS
- **Grid Results**: Results displayed in Instagram-style grid
- **No Results State**: Helpful message when nothing found

### Profile & Stats
- **Inventory Stats**:
  - Total items count
  - Total labels count
  - Estimated categories
  - Last captured time
- **Quick Actions**:
  - Refresh data
  - View help
  - About app

---

## 🎨 Design Philosophy

### Minimalistic
- **Black & White**: Instagram-inspired color scheme
- **Clean Typography**: Clear hierarchy, readable fonts
- **No Clutter**: Every element serves a purpose
- **Icon-Based**: Actions represented by intuitive icons

### Single-Button Focused
- **One Primary Action**: Each screen has one clear primary action
- **Bottom Navigation**: Always accessible, no hidden menus
- **Gesture Support**: Swipe to delete, pull to refresh

### Instagram-Inspired
- **Photo Grid**: 3×3 grid layout like Instagram
- **Bottom Tabs**: Classic Instagram navigation
- **Minimal AppBar**: Clean, elevated design
- **Full-Screen Views**: Immersive item viewing

---

## 🏗️ Architecture

### Clean Architecture
```
presentation/     → UI (screens, widgets)
  ├── navigation/   → Bottom navigation
  ├── home/         → Feed screen
  ├── search/       → Search screen
  ├── camera/       → Camera screen
  ├── items/        → Item detail & label editing
  ├── profile/      → Profile & stats
  └── common/       → Shared widgets

application/      → Business Logic
  ├── providers/    → Riverpod providers
  └── state/        → State management

domain/           → Business Entities
  ├── models/       → Data models (Freezed)
  └── services/     → Domain services

data/             → Data Layer
  ├── database/     → Drift SQLite ORM
  ├── repositories/ → Data access
  └── remote/       → API client
```

### Key Technologies
- **Flutter 3.16+**: Modern cross-platform framework
- **Riverpod**: State management
- **Drift**: Type-safe SQLite ORM with FTS5
- **Freezed**: Immutable data models
- **fpdart**: Functional error handling
- **Dio**: HTTP client with retry logic

### Backend API
- **Node.js + TypeScript**: Type-safe backend
- **Fastify**: High-performance HTTP server
- **Ensemble Vision AI**:
  - Google Cloud Vision
  - AWS Rekognition
  - NMS algorithm for merging detections
  - Confidence-weighted voting
  - Label consensus detection

---

## 📱 User Flow

### 1. Launch App
```
App Opens → Home Feed (empty state if new)
  → "No Items Yet" message
  → Tap Camera icon in bottom nav
```

### 2. Capture Item
```
Camera Screen
  → Grant permission (first time)
  → Point at object
  → Tap white capture button
  → API detects object (ensemble AI)
  → Show Detection Results
```

### 3. View Results
```
Detection Results Screen
  → See detected objects
  → Confidence scores
  → Provider agreement
  → Tap "Done"
  → Navigate back to Home Feed
```

### 4. View Item
```
Home Feed (Grid)
  → Tap item thumbnail
  → Full-screen item view
  → See all labels
  → Edit labels
  → Delete item
```

### 5. Add Custom Labels
```
Item Detail → Tap "Edit Labels"
  → Add Label dialog
  → Enter key (optional): "Color"
  → Enter value: "Red"
  → Save
  → Label appears as chip
```

### 6. Search
```
Search Tab
  → Type "red"
  → Instant FTS5 search
  → Grid of matching items
  → Tap to view details
```

---

## 🗄️ Database Schema

### Tables

#### `inventory_items`
```sql
id               INTEGER PRIMARY KEY AUTOINCREMENT
photo_path       TEXT NOT NULL
thumbnail_path   TEXT NOT NULL
detection_data   TEXT NOT NULL  -- JSON serialized Detection
created_at       DATETIME NOT NULL
updated_at       DATETIME NOT NULL
```

#### `labels`
```sql
id         INTEGER PRIMARY KEY AUTOINCREMENT
item_id    INTEGER NOT NULL → inventory_items.id (CASCADE DELETE)
key        TEXT NULL          -- Optional (e.g., "Color", "Brand")
value      TEXT NOT NULL      -- Required (e.g., "Red", "Nike")
created_at DATETIME NOT NULL
```

#### `label_search_fts`
```sql
-- FTS5 virtual table for full-text search
value     TEXT
label_id  INTEGER (UNINDEXED)

-- Automatically synced via triggers:
-- INSERT, UPDATE, DELETE on labels
```

---

## 🎯 Key Features Implementation

### Ensemble Vision AI
```typescript
// Multiple providers run in parallel
const results = await Promise.allSettled([
  googleVision.detect(image),
  awsRekognition.detect(image),
]);

// Merge overlapping detections (NMS)
const merged = NMSAlgorithm.apply(allDetections, iouThreshold);

// Confidence-weighted voting
const fused = EnsembleFusion.fuseDetections(merged, weights);

// Return with ensemble metrics
return {
  detections: fused,
  ensembleMode: "baseline_2provider",
  processingTimeMs: duration,
  ensembleMetrics: { providersUsed, averageConfidence }
};
```

### Full-Text Search
```dart
// Search using FTS5
final searchResults = await (database.select(labelSearchFts)
  ..where((t) => t.value.match(query)))
  .get();

// Get matching items
final items = await (database.select(inventoryItems)
  ..where((t) => t.id.isIn(itemIds))
  ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
  .get();
```

### State Management
```dart
// Riverpod providers
final inventoryItemsProvider = FutureProvider<List<InventoryItem>>();
final searchResultsProvider = FutureProvider.family<List<InventoryItem>, String>();
final inventoryStatsProvider = FutureProvider<InventoryStats>();

// Auto-refresh on changes
ref.invalidate(inventoryItemsProvider);
```

---

## 🚀 Getting Started

### 1. Install Dependencies

**Mobile App**:
```bash
cd mobile-app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

**API Service**:
```bash
cd api-service
npm install
```

### 2. Configure Google Cloud Vision

```bash
# 1. Create project at console.cloud.google.com
# 2. Enable Cloud Vision API
# 3. Create service account → download JSON key
# 4. Save as api-service/service-account-key.json

# Edit api-service/.env:
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
```

### 3. Start API Service

```bash
cd api-service
npm run dev
# → Server listening at http://localhost:3000
```

### 4. Launch Mobile App

```bash
cd mobile-app
flutter run
```

### 5. Test the Flow

1. ✅ Tap Camera icon (bottom center)
2. ✅ Grant camera permission
3. ✅ Capture photo of object
4. ✅ View detection results
5. ✅ Tap "Done" → See item in Home grid
6. ✅ Tap item → View details
7. ✅ Edit labels → Add custom labels
8. ✅ Search → Find items instantly

---

## 📊 What Makes It Instagram-Style?

### Visual Design
- ✅ Black & white color scheme
- ✅ Minimal borders and shadows
- ✅ 3-column photo grid
- ✅ Full-screen photo views
- ✅ Icon-only bottom navigation

### Navigation
- ✅ Bottom tabs (Home, Search, +, Profile)
- ✅ Always accessible camera
- ✅ Swipe gestures (pull to refresh, swipe to delete)
- ✅ Modal sheets for actions

### Interactions
- ✅ Tap to view details
- ✅ Swipe to delete
- ✅ Pull to refresh
- ✅ Icon-based actions
- ✅ Single primary action per screen

### Typography
- ✅ Clean sans-serif
- ✅ Bold headers
- ✅ Subtle body text
- ✅ Clear hierarchy

---

## 🛡️ Resilience Features

### Error Handling
- ✅ Graceful API failures
- ✅ Retry logic on network errors
- ✅ Empty states for no data
- ✅ Error views with retry actions

### Offline Support
- ✅ Local SQLite database
- ✅ Photos stored locally
- ✅ Labels managed offline
- ✅ Search works offline

### Data Integrity
- ✅ Cascade deletes (labels with items)
- ✅ FTS sync with triggers
- ✅ Transaction safety
- ✅ Type-safe database operations

### Circuit Breakers
- ✅ Provider failover
- ✅ Timeout handling
- ✅ Graceful degradation
- ✅ Health checks

---

## 📈 Statistics & Metrics

The Profile screen shows:
- **Total Items**: Count of captured items
- **Total Labels**: Count of all labels (auto + custom)
- **Categories**: Estimated unique categories
- **Last Captured**: Time since last capture

---

## 🎨 Customization

### Adding New Label Types
```dart
// In edit_labels_screen.dart
await repository.addLabel(
  itemId: itemId,
  key: "Room",      // New label type
  value: "Kitchen",
);
```

### Custom Search Filters
```dart
// Add filters to search
final colorFilter = "Color:Red";
final results = await repository.searchItems(colorFilter);
```

---

## 🔮 Future Enhancements

While the app is fully functional, potential additions:

1. **Export/Import**: Backup inventory to CSV/JSON
2. **Sharing**: Share items via link or image
3. **Categories**: Auto-group items by detected categories
4. **QR Codes**: Generate QR codes for items
5. **Multi-photo**: Multiple photos per item
6. **Dark Mode**: Instagram-style dark theme
7. **Filters**: Photo filters before capture
8. **Cloud Sync**: Sync across devices

---

## 📱 Screenshots Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Home      │    │   Search    │    │   Camera    │    │   Profile   │
│   Feed      │    │   Screen    │    │   Screen    │    │   Screen    │
│             │    │             │    │             │    │             │
│ ┌─┬─┬─┐    │    │ [search]    │    │             │    │  ○ Icon     │
│ ├─┼─┼─┤    │    │             │    │   Live      │    │  My Inv.    │
│ ├─┼─┼─┤    │    │ ┌─┬─┬─┐    │    │   Preview   │    │             │
│ └─┴─┴─┘    │    │ └─┴─┴─┘    │    │      ○      │    │ Items: 42   │
│             │    │             │    │             │    │ Labels: 89  │
│  Grid of    │    │ Search      │    │  Capture    │    │             │
│  Items      │    │ Results     │    │  Button     │    │  Settings   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      ⬆                 ⬆                 ⬆                 ⬆
[Home] [Search]    [  + ]         [Profile]
```

---

## ✅ Complete Features Checklist

### Core Functionality
- ✅ Camera capture with permissions
- ✅ AI object detection (ensemble)
- ✅ Auto-save to local database
- ✅ Photo + thumbnail storage

### Instagram UI
- ✅ Bottom navigation (4 tabs)
- ✅ Photo grid (3×3 layout)
- ✅ Full-screen item view
- ✅ Minimal black & white theme
- ✅ Icon-based navigation

### Label Management
- ✅ Auto-labels from AI
- ✅ Add custom labels (key-value)
- ✅ Edit existing labels
- ✅ Delete labels (swipe)
- ✅ Label chips display

### Search
- ✅ Real-time FTS5 search
- ✅ Search by any label
- ✅ Grid results display
- ✅ Empty/no results states

### Profile
- ✅ Inventory statistics
- ✅ Item/label counts
- ✅ Last captured time
- ✅ Help & about dialogs
- ✅ Refresh data action

### Resilience
- ✅ Offline database
- ✅ Error handling
- ✅ Retry logic
- ✅ Empty states
- ✅ Loading states
- ✅ Pull to refresh

---

## 🎉 Result

A **complete, production-ready, Instagram-style home inventory app** with:
- ✅ Minimalistic design
- ✅ Single-button focused
- ✅ Icon-based navigation
- ✅ Resilient architecture
- ✅ Fully functional features
- ✅ AI-powered detection
- ✅ Fast full-text search
- ✅ Offline-first database

**Ready to launch!** 🚀
