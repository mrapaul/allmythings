# Data Model: Visual Home Inventory Manager

**Feature**: Visual Home Inventory Manager
**Date**: 2025-10-18
**Database**: SQLite with Drift ORM

## Overview

This document defines the data model for the Visual Home Inventory Manager mobile application. The model supports:
- Storage of inventory items with photos and detection metadata
- Multiple labels per item with flexible key-value structure
- Full-text search across labels
- Efficient querying and relationships

## Entity Relationship Diagram

```
┌─────────────────────┐
│  InventoryItems     │
├─────────────────────┤
│ id (PK)             │
│ photoPath           │
│ thumbnailPath       │
│ detectionData (JSON)│
│ createdAt           │
│ updatedAt           │
└──────────┬──────────┘
           │
           │ 1:N
           │
┌──────────▼──────────┐
│  Labels             │
├─────────────────────┤
│ id (PK)             │
│ itemId (FK)         │
│ key                 │
│ value               │
│ createdAt           │
└──────────┬──────────┘
           │
           │ 1:1
           │
┌──────────▼──────────┐
│ LabelSearchFts      │ (Virtual Table)
├─────────────────────┤
│ value (FTS5)        │
│ labelId             │
└─────────────────────┘
```

## Entities

### InventoryItem

Represents a single physical object detected in a photo.

**Table**: `inventory_items`

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique identifier |
| photoPath | TEXT | NOT NULL | Absolute path to full-resolution photo |
| thumbnailPath | TEXT | NOT NULL | Absolute path to thumbnail (256x256) |
| detectionData | TEXT | NOT NULL | JSON: detection metadata (see schema below) |
| createdAt | DATETIME | NOT NULL | Timestamp when item was created |
| updatedAt | DATETIME | NOT NULL | Timestamp when item was last modified |

**Detection Data Schema** (JSON):

```json
{
  "boundingBox": {
    "x": 0.1,
    "y": 0.2,
    "width": 0.3,
    "height": 0.4
  },
  "confidence": 0.95,
  "detectedLabel": "Laptop",
  "imageWidth": 1920,
  "imageHeight": 1080
}
```

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `createdAt DESC` (for chronological listing)
- INDEX on `updatedAt DESC` (for recent edits)

**Validation Rules**:
- `photoPath` must exist on filesystem (checked at runtime)
- `detectionData` must be valid JSON
- `boundingBox` coordinates must be normalized (0-1 range)
- `confidence` must be between 0 and 1
- `createdAt` <= `updatedAt`

**State Transitions**:
1. **Created**: Item created after photo detection
2. **Updated**: Labels added/edited, triggers `updatedAt` change
3. **Deleted**: Soft delete not implemented; hard delete removes item and cascades to labels

**Relationships**:
- Has many `Labels` (1:N)
- Cascade delete: When item deleted, all associated labels deleted

---

### Label

Represents a single label (tag/metadata) attached to an inventory item.

**Table**: `labels`

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique identifier |
| itemId | INTEGER | NOT NULL, FOREIGN KEY → inventory_items(id) | Reference to parent item |
| key | TEXT | NULLABLE | Optional category (type, color, brand, room) |
| value | TEXT | NOT NULL | Label value (laptop, black, Apple, bedroom) |
| createdAt | DATETIME | NOT NULL | Timestamp when label was added |

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `itemId` (fast lookup of all labels for an item)
- INDEX on `value` (fast search by label value)
- UNIQUE INDEX on `(itemId, key, value)` (prevent duplicate labels)

**Validation Rules**:
- `value` must not be empty or whitespace-only
- `value` max length: 100 characters
- `key` max length: 50 characters
- Case-insensitive uniqueness: "Laptop" and "laptop" are duplicates
- `itemId` must reference existing inventory item

**Relationships**:
- Belongs to one `InventoryItem` (N:1)
- Has one `LabelSearchFts` entry (1:1 for FTS)

**Examples**:

| itemId | key | value |
|--------|-----|-------|
| 1 | type | Electronics |
| 1 | brand | Apple |
| 1 | color | Silver |
| 1 | room | Bedroom |
| 2 | null | Coffee Mug |
| 2 | color | Blue |

---

### LabelSearchFts

Virtual table for full-text search on label values using SQLite FTS5.

**Table**: `label_search_fts` (VIRTUAL TABLE)

**Fields**:

| Field | Type | Description |
|-------|------|-------------|
| value | TEXT | Label value indexed for full-text search |
| labelId | INTEGER | Reference to labels(id) for result joining |

**FTS5 Configuration**:
```sql
CREATE VIRTUAL TABLE label_search_fts USING fts5(
  value,
  labelId UNINDEXED,
  tokenize = 'porter unicode61 remove_diacritics 1'
);
```

**Features**:
- Porter stemming: "laptop" matches "laptops"
- Unicode support: Handles international characters
- Diacritics removal: "café" matches "cafe"
- Partial matching: Prefix search with `*` (e.g., "lap*")

**Usage**:
- Populated via triggers when labels are inserted/updated
- Queried for search functionality
- Joined back to labels → items for results

**Triggers**:

```sql
-- Insert trigger
CREATE TRIGGER label_search_insert AFTER INSERT ON labels
BEGIN
  INSERT INTO label_search_fts(value, labelId)
  VALUES (NEW.value, NEW.id);
END;

-- Update trigger
CREATE TRIGGER label_search_update AFTER UPDATE ON labels
BEGIN
  UPDATE label_search_fts
  SET value = NEW.value
  WHERE labelId = NEW.id;
END;

-- Delete trigger
CREATE TRIGGER label_search_delete AFTER DELETE ON labels
BEGIN
  DELETE FROM label_search_fts WHERE labelId = OLD.id;
END;
```

---

## Data Access Patterns

### 1. List All Inventory Items (Chronological)

```sql
SELECT * FROM inventory_items
ORDER BY createdAt DESC
LIMIT 50 OFFSET 0;
```

**Performance**: Index on `createdAt DESC`, <10ms for 500 items

---

### 2. Get Item with All Labels

```sql
SELECT
  i.*,
  l.id as label_id,
  l.key as label_key,
  l.value as label_value
FROM inventory_items i
LEFT JOIN labels l ON i.id = l.itemId
WHERE i.id = ?
ORDER BY l.createdAt ASC;
```

**Performance**: Index on `labels(itemId)`, <5ms per item

---

### 3. Search Items by Label (Full-Text)

```sql
SELECT DISTINCT i.*
FROM label_search_fts fts
JOIN labels l ON fts.labelId = l.id
JOIN inventory_items i ON l.itemId = i.id
WHERE fts.value MATCH ?
ORDER BY i.updatedAt DESC;
```

**Performance**: FTS5 index, <50ms for 10,000 labels

**Example Queries**:
- Exact match: `"electronics"`
- Prefix match: `"lap*"` (matches laptop, laptop computer)
- Multi-term: `"black AND laptop"` (items with both labels)
- Phrase: `"\"Apple MacBook\""` (exact phrase)

---

### 4. Add Item with Auto-Generated Labels

```sql
-- Insert item
INSERT INTO inventory_items (photoPath, thumbnailPath, detectionData, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?);

-- Get last inserted ID
SELECT last_insert_rowid();

-- Insert auto-generated label from detection
INSERT INTO labels (itemId, key, value, createdAt)
VALUES (?, null, ?, ?);
```

**Transaction**: Wrapped in transaction for atomicity

---

### 5. Update Label

```sql
UPDATE labels
SET value = ?, key = ?
WHERE id = ?;
```

**Trigger**: Automatically updates FTS table via trigger

---

### 6. Delete Item (Cascade)

```sql
-- Drift handles cascade automatically
DELETE FROM inventory_items WHERE id = ?;
```

**Cascade**: Foreign key constraint deletes associated labels
**Cleanup**: Photo files deleted separately in application layer

---

## Drift Schema Definition

```dart
// inventory_items.dart
@DataClassName('InventoryItem')
class InventoryItems extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get photoPath => text()();
  TextColumn get thumbnailPath => text()();
  TextColumn get detectionData => text()(); // JSON
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}

// labels.dart
@DataClassName('Label')
class Labels extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get itemId => integer().references(InventoryItems, #id, onDelete: KeyAction.cascade)();
  TextColumn get key => text().nullable()();
  TextColumn get value => text()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  List<Set<Column>> get uniqueKeys => [
    {itemId, key, value}, // Prevent duplicate labels
  ];

  @override
  List<String> get customConstraints => [
    'CHECK(length(trim(value)) > 0)', // No empty values
    'CHECK(length(value) <= 100)',    // Max length
  ];
}

// label_search_fts.dart
@DataClassName('LabelSearchEntry')
class LabelSearchFts extends VirtualTable {
  TextColumn get value => text()();
  IntColumn get labelId => integer()();

  @override
  String get moduleAndArgs => 'fts5(value, labelId UNINDEXED, tokenize="porter unicode61 remove_diacritics 1")';
}
```

---

## Migration Strategy

**Schema Versioning**: Using Drift migrations

**Initial Schema** (Version 1):
```dart
@DriftDatabase(
  tables: [InventoryItems, Labels, LabelSearchFts],
  daos: [InventoryDao, LabelDao, SearchDao],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(QueryExecutor e) : super(e);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) async {
      await m.createAll();
      await _createFtsTriggers(m);
    },
  );
}
```

**Future Migrations** (Example v2):
```dart
@override
int get schemaVersion => 2;

@override
MigrationStrategy get migration => MigrationStrategy(
  onCreate: (Migrator m) async {
    await m.createAll();
  },
  onUpgrade: (Migrator m, int from, int to) async {
    if (from == 1) {
      // Add new column for item notes
      await m.addColumn(inventoryItems, inventoryItems.notes);
    }
  },
);
```

---

## Data Integrity Constraints

**Enforced at Database Level**:
1. Foreign key constraints (itemId → inventory_items.id)
2. Unique constraints (prevent duplicate labels)
3. NOT NULL constraints (required fields)
4. CHECK constraints (value length, non-empty)
5. Cascade deletes (item deletion removes labels)

**Enforced at Application Level**:
1. File existence validation (photo paths)
2. JSON schema validation (detectionData)
3. Normalized coordinates (0-1 range)
4. Case-insensitive duplicate checking
5. Photo file cleanup on item deletion

---

## Performance Characteristics

**Expected Performance** (500 items, 2000 labels):

| Operation | Expected Time | Bottleneck |
|-----------|---------------|------------|
| Insert item + labels | <10ms | Disk I/O |
| Query single item | <5ms | Index lookup |
| List 50 items | <20ms | Index scan |
| Search labels (FTS) | <50ms | FTS5 search |
| Update label | <5ms | Index update |
| Delete item (cascade) | <15ms | Cascade delete |
| Full inventory load | <100ms | Join + sort |

**Scalability**:
- SQLite handles 10,000+ items efficiently on mobile
- FTS5 searches 100,000+ rows in <100ms
- Database size: ~1KB per item + ~100 bytes per label + photo storage

**Optimization Strategies**:
- Lazy loading: Load items in batches (pagination)
- Thumbnail generation: Avoid loading full-res photos in list view
- Index maintenance: Rebuild FTS occasionally for optimal performance
- Vacuum: Reclaim space after bulk deletes

---

## Data Model Validation Checklist

- [x] All entities from spec.md defined (InventoryItem, Label, Photo → DetectionData)
- [x] Relationships documented (1:N InventoryItem → Labels)
- [x] Indexes defined for performance
- [x] Validation rules specified
- [x] Search strategy implemented (FTS5)
- [x] Migration strategy defined
- [x] Data access patterns documented
- [x] Performance characteristics estimated
- [x] Drift schema provided
- [x] Cascade delete behavior specified
- [x] Data integrity constraints listed
- [x] JSON schemas documented (detectionData)

**Status**: ✅ Data model complete and ready for implementation
