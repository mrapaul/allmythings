# Database Migration Strategy - Visual Home Inventory Manager

## Overview

This document outlines the comprehensive migration strategy for evolving the database schema for both mobile (SQLite/Drift) and backend (PostgreSQL) databases. The strategy ensures zero-downtime deployments, data integrity, and rollback safety.

---

## Migration Principles

### Core Tenets

1. **Zero Downtime**: Backend migrations must not interrupt service
2. **Backward Compatibility**: New schema versions must work with old app versions during rollout
3. **Rollback Safety**: All migrations must be reversible
4. **Data Integrity**: Never lose user data during migration
5. **Incremental Changes**: Small, atomic migrations over large batches
6. **Version Control**: All schema changes tracked in git
7. **Testing Required**: Migrations tested on production-like data before deployment

### Migration Types

| Type | Description | Example | Risk Level |
|------|-------------|---------|------------|
| **Additive** | Add new tables/columns | Add `warranty_expiry` column | Low |
| **Expanding** | Make constraints less restrictive | Make column nullable | Low |
| **Contracting** | Make constraints more restrictive | Make column NOT NULL | Medium |
| **Destructive** | Remove or rename columns/tables | Drop `old_column` | High |
| **Transformative** | Change data types or move data | Convert TEXT to UUID | High |

---

## Mobile Database Migration (Drift/SQLite)

### Migration Framework: Drift Migrations

Drift provides a robust migration system with compile-time safety and test support.

### Migration Structure

```dart
// mobile-app/lib/data/database/migrations/
// └── schema_versions.dart

@DriftDatabase(
  tables: [
    Users,
    InventoryItems,
    Labels,
    Tags,
    // ... other tables
  ],
  include: {'schema/inventory_schema.drift'},
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(QueryExecutor e) : super(e);

  @override
  int get schemaVersion => 5;  // Increment on each migration

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) async {
      // Create all tables on fresh install
      await m.createAll();
    },
    onUpgrade: (Migrator m, int from, int to) async {
      // Run migrations sequentially
      if (from < 2) await _migrateV1ToV2(m);
      if (from < 3) await _migrateV2ToV3(m);
      if (from < 4) await _migrateV3ToV4(m);
      if (from < 5) await _migrateV4ToV5(m);
    },
    beforeOpen: (details) async {
      // Enable foreign keys
      await customStatement('PRAGMA foreign_keys = ON');

      // Run integrity checks
      if (details.wasCreated) {
        // Fresh database
      } else if (details.hadUpgrade) {
        // Validate migration succeeded
        await _validateSchema();
      }
    },
  );
}
```

### Example Migrations

#### Migration V1 → V2: Add Warranty Expiry (Additive)

```dart
Future<void> _migrateV1ToV2(Migrator m) async {
  // RISK: Low - Additive change

  // 1. Add new column (nullable initially)
  await m.addColumn(inventoryItems, inventoryItems.warrantyExpiryDate);

  // No data migration needed

  print('Migration V1→V2: Added warranty_expiry_date column');
}
```

**Rollback Strategy**:
- Column is nullable, old app versions ignore it
- No data loss on rollback

#### Migration V2 → V3: Make Serial Number Unique (Contracting)

```dart
Future<void> _migrateV2ToV3(Migrator m) async {
  // RISK: Medium - Contracting change, requires data cleanup

  // 1. Clean up duplicate serial numbers first
  await customStatement('''
    DELETE FROM inventory_items
    WHERE id NOT IN (
      SELECT MIN(id) FROM inventory_items
      GROUP BY user_id, serial_number
      HAVING serial_number IS NOT NULL
    )
  ''');

  // 2. Create new table with constraint
  await customStatement('''
    CREATE TABLE inventory_items_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      serial_number TEXT,
      -- ... other columns
      UNIQUE(user_id, serial_number)
    )
  ''');

  // 3. Copy data
  await customStatement('''
    INSERT INTO inventory_items_new
    SELECT * FROM inventory_items
  ''');

  // 4. Drop old table
  await m.drop(inventoryItems);

  // 5. Rename new table
  await customStatement('''
    ALTER TABLE inventory_items_new RENAME TO inventory_items
  ''');

  // 6. Recreate indexes
  await customStatement('''
    CREATE INDEX idx_inventory_items_user_id ON inventory_items(user_id)
  ''');

  print('Migration V2→V3: Added unique constraint on serial_number');
}
```

**Rollback Strategy**:
- Keep backup table for 7 days: `inventory_items_backup_v2`
- Restore from backup if migration fails

#### Migration V3 → V4: Split Location Into Hierarchical Structure (Transformative)

```dart
Future<void> _migrateV3ToV4(Migrator m) async {
  // RISK: High - Data transformation required

  print('Migration V3→V4: Converting flat locations to hierarchical');

  // 1. Create new locations table
  await m.createTable(locations);

  // 2. Parse existing location strings and create hierarchy
  final existingItems = await select(inventoryItems).get();

  final locationMap = <String, String>{};  // old_location → location_id

  for (final item in existingItems) {
    if (item.locationOld == null) continue;

    if (!locationMap.containsKey(item.locationOld)) {
      // Parse "Home > Bedroom > Closet" into hierarchy
      final parts = item.locationOld!.split(' > ');
      String? parentId;
      String path = '';

      for (int i = 0; i < parts.length; i++) {
        final locationName = parts[i].trim();
        path += '/${locationName.toLowerCase().replaceAll(' ', '-')}';

        // Check if location already exists
        final existing = await (select(locations)
          ..where((l) => l.path.equals(path))
        ).getSingleOrNull();

        String locationId;
        if (existing != null) {
          locationId = existing.id;
        } else {
          // Create new location
          locationId = _generateUuid();
          await into(locations).insert(LocationsCompanion.insert(
            id: Value(locationId),
            userId: item.userId,
            name: locationName,
            parentLocationId: Value(parentId),
            level: i,
            path: path,
          ));
        }

        parentId = locationId;
      }

      locationMap[item.locationOld!] = parentId!;
    }
  }

  // 3. Update inventory_items with new location_id references
  for (final item in existingItems) {
    if (item.locationOld != null && locationMap.containsKey(item.locationOld)) {
      await (update(inventoryItems)
        ..where((i) => i.id.equals(item.id))
      ).write(InventoryItemsCompanion(
        locationId: Value(locationMap[item.locationOld]),
      ));
    }
  }

  // 4. Drop old location_old column
  await customStatement('''
    -- SQLite doesn't support DROP COLUMN directly
    -- Create temp table without location_old
    CREATE TABLE inventory_items_temp AS
    SELECT id, user_id, title, location_id, /* ... other columns except location_old */
    FROM inventory_items
  ''');

  await m.drop(inventoryItems);

  await customStatement('''
    ALTER TABLE inventory_items_temp RENAME TO inventory_items
  ''');

  // 5. Recreate indexes
  await _recreateIndexes(m);

  print('Migration V3→V4: Successfully migrated ${existingItems.length} items');
}
```

**Rollback Strategy**:
- Keep `location_old` column for 1 version (mark as deprecated)
- Full backup before migration
- Migration runs in transaction (all-or-nothing)

#### Migration V4 → V5: Add Full-Text Search (Additive)

```dart
Future<void> _migrateV4ToV5(Migrator m) async {
  // RISK: Low-Medium - Creates FTS table and populates it

  print('Migration V4→V5: Setting up full-text search');

  // 1. Create FTS5 virtual table
  await customStatement('''
    CREATE VIRTUAL TABLE item_search_fts USING fts5(
      item_id UNINDEXED,
      title,
      description,
      notes,
      labels,
      tags,
      location_path,
      tokenize='porter unicode61'
    )
  ''');

  // 2. Populate FTS table from existing data
  final items = await select(inventoryItems).get();

  for (final item in items) {
    // Gather labels
    final itemLabels = await (select(itemLabels)
      ..where((il) => il.itemId.equals(item.id))
    ).join([
      innerJoin(labels, labels.id.equalsExp(itemLabels.labelId))
    ]).get();

    final labelNames = itemLabels
      .map((row) => row.readTable(labels).name)
      .join(' ');

    // Gather tags
    final itemTags = await (select(itemTags)
      ..where((it) => it.itemId.equals(item.id))
    ).join([
      innerJoin(tags, tags.id.equalsExp(itemTags.tagId))
    ]).get();

    final tagNames = itemTags
      .map((row) => row.readTable(tags).name)
      .join(' ');

    // Get location path
    final location = item.locationId != null
      ? await (select(locations)..where((l) => l.id.equals(item.locationId!))).getSingleOrNull()
      : null;

    // Insert into FTS
    await customStatement('''
      INSERT INTO item_search_fts(item_id, title, description, notes, labels, tags, location_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', [
      item.id,
      item.title,
      item.description ?? '',
      item.notes ?? '',
      labelNames,
      tagNames,
      location?.path ?? '',
    ]);
  }

  // 3. Create triggers to keep FTS in sync
  await customStatement('''
    CREATE TRIGGER item_search_fts_insert AFTER INSERT ON inventory_items
    BEGIN
      INSERT INTO item_search_fts(rowid, item_id, title, description, notes)
      VALUES (NEW.rowid, NEW.id, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.notes, ''));
    END
  ''');

  await customStatement('''
    CREATE TRIGGER item_search_fts_delete AFTER DELETE ON inventory_items
    BEGIN
      DELETE FROM item_search_fts WHERE rowid = OLD.rowid;
    END
  ''');

  await customStatement('''
    CREATE TRIGGER item_search_fts_update AFTER UPDATE ON inventory_items
    BEGIN
      UPDATE item_search_fts
      SET title = NEW.title,
          description = COALESCE(NEW.description, ''),
          notes = COALESCE(NEW.notes, '')
      WHERE rowid = NEW.rowid;
    END
  ''');

  print('Migration V4→V5: Indexed ${items.length} items for search');
}
```

### Migration Testing Strategy

#### 1. Unit Tests for Migrations

```dart
// mobile-app/test/data/database/migrations/migration_test.dart

void main() {
  group('Database Migrations', () {
    test('migrates from V1 to V2', () async {
      // 1. Create V1 database
      final schema1 = await _createSchemaV1();
      final db1 = AppDatabase.forTesting(schema1);

      // 2. Insert test data
      await db1.into(db1.inventoryItems).insert(
        InventoryItemsCompanion.insert(
          userId: 'user1',
          title: 'Test Item',
        ),
      );

      // 3. Close and reopen with V2 schema
      await db1.close();

      final schema2 = await _migrateToV2(schema1);
      final db2 = AppDatabase.forTesting(schema2);

      // 4. Verify migration
      final items = await db2.select(db2.inventoryItems).get();
      expect(items.length, 1);
      expect(items[0].warrantyExpiryDate, isNull);  // New column exists

      await db2.close();
    });

    test('handles migration rollback', () async {
      // Test that failed migrations don't corrupt data
      // ...
    });

    test('migrates large dataset efficiently', () async {
      // Performance test with 10,000 items
      // ...
    });
  });
}
```

#### 2. Integration Tests

```dart
testWidgets('app works after migration', (tester) async {
  // 1. Install old version
  // 2. Create test data
  // 3. Upgrade to new version
  // 4. Verify all features work
  // 5. Verify data integrity
});
```

#### 3. Manual Testing Checklist

- [ ] Test on fresh install (onCreate)
- [ ] Test on each upgrade path (1→2, 1→3, 2→3, etc.)
- [ ] Test with large dataset (10K+ items)
- [ ] Test with corrupted data scenarios
- [ ] Test migration interruption (kill app mid-migration)
- [ ] Verify indexes are created correctly
- [ ] Verify foreign keys work
- [ ] Verify triggers fire correctly

---

## Backend Database Migration (PostgreSQL)

### Migration Framework Options

#### Option 1: Flyway (Recommended)

**Pros**:
- Industry standard, battle-tested
- Java-based, cross-platform
- Supports repeatable migrations
- Built-in validation and repair
- Good CI/CD integration

**Cons**:
- Requires Java runtime
- Limited to SQL (no programmatic migrations)

#### Option 2: Liquibase

**Pros**:
- XML/YAML/JSON/SQL formats
- Database-agnostic
- Rollback support
- Good enterprise features

**Cons**:
- XML can be verbose
- Steeper learning curve

#### Option 3: Node.js Migration Tools (node-pg-migrate, Knex)

**Pros**:
- Aligns with Node.js backend
- Programmatic migrations (JavaScript)
- No additional runtime

**Cons**:
- Less mature than Flyway
- Limited enterprise features

**Recommendation**: Use **Flyway** for production, **node-pg-migrate** for development.

### Migration File Structure

```
api-service/database/migrations/
├── V1__initial_schema.sql
├── V2__add_warranty_expiry.sql
├── V3__add_serial_number_unique.sql
├── V4__hierarchical_locations.sql
├── V5__full_text_search.sql
├── V6__add_image_metadata.sql
└── R__refresh_materialized_views.sql  # Repeatable migration
```

### Migration Naming Convention

```
V{version}__{description}.sql     # Versioned migration
U{version}__{description}.sql     # Undo migration (optional)
R__{description}.sql              # Repeatable migration
```

### Example Migrations

#### V1: Initial Schema

```sql
-- V1__initial_schema.sql

-- This is the baseline, created from schema dump
\i 001_inventory_schema.sql

-- Mark as baseline for existing deployments
-- flyway baseline -baselineVersion=1 -baselineDescription="Initial schema"
```

#### V2: Add Warranty Expiry (Additive, Zero-Downtime)

```sql
-- V2__add_warranty_expiry.sql

-- Step 1: Add column (nullable, backward compatible)
ALTER TABLE inventory_items
ADD COLUMN warranty_expiry_date DATE;

-- Step 2: Add index for efficient querying
CREATE INDEX idx_inventory_items_warranty_expiry
  ON inventory_items(warranty_expiry_date)
  WHERE warranty_expiry_date IS NOT NULL;

-- Step 3: Backfill data (if needed)
-- UPDATE inventory_items
-- SET warranty_expiry_date = purchase_date + INTERVAL '1 year'
-- WHERE warranty_expiry_date IS NULL AND purchase_date IS NOT NULL;

COMMENT ON COLUMN inventory_items.warranty_expiry_date
  IS 'Date when warranty expires, used for maintenance reminders';
```

**Deployment Strategy**:
1. Deploy migration (adds nullable column)
2. Deploy new API version (supports warranty_expiry)
3. Old API versions continue to work (ignore new column)
4. No downtime required

**Rollback**:
```sql
-- U2__remove_warranty_expiry.sql (if needed)
DROP INDEX IF EXISTS idx_inventory_items_warranty_expiry;
ALTER TABLE inventory_items DROP COLUMN warranty_expiry_date;
```

#### V3: Make Serial Number Unique (Contracting, Requires Coordination)

```sql
-- V3__add_serial_number_unique.sql

-- RISK: Medium - Requires data cleanup

-- Step 1: Clean up duplicate serial numbers
-- (Run as separate script first, then migration)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- Find and log duplicates
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_id, serial_number, COUNT(*)
    FROM inventory_items
    WHERE serial_number IS NOT NULL
    GROUP BY user_id, serial_number
    HAVING COUNT(*) > 1
  ) AS duplicates;

  RAISE NOTICE 'Found % items with duplicate serial numbers', duplicate_count;

  -- Option 1: Append suffix to duplicates
  WITH duplicates AS (
    SELECT id, serial_number,
           ROW_NUMBER() OVER (PARTITION BY user_id, serial_number ORDER BY created_at) AS rn
    FROM inventory_items
    WHERE serial_number IS NOT NULL
  )
  UPDATE inventory_items i
  SET serial_number = d.serial_number || '-' || d.rn
  FROM duplicates d
  WHERE i.id = d.id AND d.rn > 1;

  -- Option 2: Clear duplicates (more aggressive)
  -- DELETE FROM inventory_items
  -- WHERE id NOT IN (
  --   SELECT MIN(id) FROM inventory_items
  --   GROUP BY user_id, serial_number
  --   HAVING serial_number IS NOT NULL
  -- );
END $$;

-- Step 2: Add unique constraint
ALTER TABLE inventory_items
ADD CONSTRAINT uq_inventory_items_user_serial
  UNIQUE (user_id, serial_number);

-- Step 3: Add index to support the constraint
CREATE INDEX idx_inventory_items_serial_number
  ON inventory_items(user_id, serial_number)
  WHERE serial_number IS NOT NULL;
```

**Deployment Strategy**:
1. Pre-migration: Run duplicate cleanup script
2. Deploy migration during low-traffic window
3. Monitor for constraint violations
4. Deploy API version that validates serial uniqueness

**Rollback**:
```sql
ALTER TABLE inventory_items DROP CONSTRAINT uq_inventory_items_user_serial;
DROP INDEX idx_inventory_items_serial_number;
```

#### V4: Hierarchical Locations (Transformative, High Risk)

This migration is complex and requires careful planning.

**Approach: Expand-Contract Pattern (3-phase migration)**

**Phase 1: Expand** (Version 4.1)
```sql
-- V4_1__add_hierarchical_locations.sql

-- Step 1: Create new locations table
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  level INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL,
  -- ... other columns
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Add foreign key to inventory_items (nullable)
ALTER TABLE inventory_items
ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

-- Step 3: Keep old location_string column (for backward compatibility)
-- Don't drop it yet!

-- Step 4: Create migration function to parse location strings
CREATE OR REPLACE FUNCTION migrate_location_string_to_hierarchy()
RETURNS INTEGER AS $$
DECLARE
  item RECORD;
  location_parts TEXT[];
  current_path TEXT := '';
  current_parent UUID := NULL;
  location_id UUID;
  migrated_count INTEGER := 0;
BEGIN
  FOR item IN
    SELECT DISTINCT user_id, location_string
    FROM inventory_items
    WHERE location_string IS NOT NULL
      AND location_id IS NULL
  LOOP
    -- Parse "Home > Bedroom > Closet"
    location_parts := string_to_array(item.location_string, ' > ');
    current_path := '';
    current_parent := NULL;

    FOR i IN 1..array_length(location_parts, 1) LOOP
      current_path := current_path || '/' ||
        lower(regexp_replace(location_parts[i], '[^a-zA-Z0-9]+', '-', 'g'));

      -- Find or create location
      SELECT id INTO location_id
      FROM locations
      WHERE user_id = item.user_id AND path = current_path;

      IF location_id IS NULL THEN
        INSERT INTO locations (user_id, name, parent_location_id, level, path)
        VALUES (item.user_id, location_parts[i], current_parent, i - 1, current_path)
        RETURNING id INTO location_id;
      END IF;

      current_parent := location_id;
    END LOOP;

    -- Update inventory items with new location_id
    UPDATE inventory_items
    SET location_id = current_parent
    WHERE user_id = item.user_id
      AND location_string = item.location_string;

    migrated_count := migrated_count + 1;
  END LOOP;

  RETURN migrated_count;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Run migration (can be run multiple times safely)
SELECT migrate_location_string_to_hierarchy();

-- Step 6: Create indexes
CREATE INDEX idx_locations_user_id ON locations(user_id);
CREATE INDEX idx_locations_parent_id ON locations(parent_location_id);
CREATE INDEX idx_locations_path ON locations(path);
CREATE INDEX idx_inventory_items_location_id ON inventory_items(location_id);
```

**Phase 2: Transition** (Version 4.2)
```sql
-- V4_2__enforce_location_hierarchy.sql

-- Step 1: Migrate any remaining items
SELECT migrate_location_string_to_hierarchy();

-- Step 2: Verify all items migrated
DO $$
DECLARE
  unmigrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
  FROM inventory_items
  WHERE location_string IS NOT NULL AND location_id IS NULL;

  IF unmigrated_count > 0 THEN
    RAISE EXCEPTION 'Still have % unmigrated items', unmigrated_count;
  END IF;
END $$;

-- Step 3: Make location_id NOT NULL (if required)
-- ALTER TABLE inventory_items ALTER COLUMN location_id SET NOT NULL;

-- Step 4: Keep location_string for one more version (safety)
```

**Phase 3: Contract** (Version 4.3)
```sql
-- V4_3__remove_old_location_column.sql

-- Step 1: Final safety check
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM inventory_items
    WHERE location_string IS NOT NULL AND location_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot drop location_string: unmigrated data exists';
  END IF;
END $$;

-- Step 2: Drop old column
ALTER TABLE inventory_items DROP COLUMN location_string;

-- Step 3: Clean up migration function
DROP FUNCTION IF EXISTS migrate_location_string_to_hierarchy();
```

**Deployment Strategy**:
- **Week 1**: Deploy V4.1, new API supports both formats
- **Week 2**: Monitor migration function, run backfill if needed
- **Week 3**: Deploy V4.2, old API versions phased out
- **Week 4**: Deploy V4.3, remove old column

**Rollback**: Keep snapshot before each phase, can restore from backup.

#### V5: Full-Text Search (Additive)

```sql
-- V5__full_text_search.sql

-- Step 1: Add tsvector column
ALTER TABLE inventory_items
ADD COLUMN search_vector tsvector;

-- Step 2: Populate existing data
UPDATE inventory_items
SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(notes, '')), 'C');

-- Step 3: Create GIN index
CREATE INDEX idx_inventory_items_search_vector
  ON inventory_items USING GIN(search_vector);

-- Step 4: Create trigger to auto-update
CREATE OR REPLACE FUNCTION update_inventory_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.notes, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_inventory_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, description, notes ON inventory_items
FOR EACH ROW EXECUTE FUNCTION update_inventory_search_vector();

-- Step 5: Add trigram indexes for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_inventory_items_title_trgm
  ON inventory_items USING GIN(title gin_trgm_ops);

CREATE INDEX idx_labels_name_trgm
  ON labels USING GIN(name gin_trgm_ops);
```

### Zero-Downtime Migration Patterns

#### Pattern 1: Additive Changes (Safest)

```sql
-- Add new column (nullable)
ALTER TABLE inventory_items ADD COLUMN new_field TEXT;

-- Backfill asynchronously (outside transaction)
-- Can be done gradually without blocking
```

**Deployment**: No coordination needed, deploy anytime.

#### Pattern 2: Expand-Contract (2-Phase)

**Phase 1: Expand**
```sql
-- Add new column
ALTER TABLE inventory_items ADD COLUMN new_field TEXT;

-- Update application to write to both old and new columns
```

**Phase 2: Contract** (after all clients updated)
```sql
-- Drop old column
ALTER TABLE inventory_items DROP COLUMN old_field;
```

#### Pattern 3: Shadow Table (For Complex Transformations)

```sql
-- Step 1: Create new table with desired schema
CREATE TABLE inventory_items_v2 (
  -- new schema
);

-- Step 2: Create trigger to sync changes
CREATE TRIGGER sync_to_v2
AFTER INSERT OR UPDATE OR DELETE ON inventory_items
FOR EACH ROW EXECUTE FUNCTION sync_to_items_v2();

-- Step 3: Backfill data
INSERT INTO inventory_items_v2 SELECT * FROM inventory_items;

-- Step 4: Switch application to use new table
-- (requires application deployment)

-- Step 5: Drop old table
DROP TABLE inventory_items;
ALTER TABLE inventory_items_v2 RENAME TO inventory_items;
```

### Migration Testing

#### 1. Pre-Production Testing

```bash
# Create test database from production snapshot
pg_dump production_db > snapshot.sql
createdb test_migration_db
psql test_migration_db < snapshot.sql

# Run migrations
flyway -url=jdbc:postgresql://localhost/test_migration_db \
       -locations=filesystem:./migrations \
       migrate

# Validate
psql test_migration_db -c "SELECT COUNT(*) FROM inventory_items"
```

#### 2. Automated Tests

```javascript
// api-service/tests/migrations/migration.test.ts

describe('Database Migrations', () => {
  it('migrates from V1 to V5 without data loss', async () => {
    // 1. Create V1 database
    await createSchemaV1();

    // 2. Insert test data
    await insertTestData();

    // 3. Run migrations
    await runMigrations();

    // 4. Verify data integrity
    const itemCount = await db.query('SELECT COUNT(*) FROM inventory_items');
    expect(itemCount.rows[0].count).toBe(100);

    // 5. Verify indexes created
    const indexes = await db.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'inventory_items'
    `);
    expect(indexes.rows).toContainEqual({ indexname: 'idx_inventory_items_user_id' });
  });

  it('handles concurrent migrations safely', async () => {
    // Test that migrations are idempotent and safe to run concurrently
  });
});
```

#### 3. Performance Testing

```sql
-- Test migration performance on large dataset
EXPLAIN ANALYZE
ALTER TABLE inventory_items ADD COLUMN new_field TEXT;

-- Expected: <1 second (metadata only, no table rewrite)
```

### Migration Checklist

Before deploying any migration:

- [ ] Migration tested on production-like dataset
- [ ] Rollback plan documented
- [ ] Estimated downtime calculated (goal: 0)
- [ ] Backup verified and restorable
- [ ] Team notified of deployment window
- [ ] Monitoring alerts configured
- [ ] Post-migration validation queries prepared
- [ ] Database locks analyzed (use `pg_locks`)
- [ ] Long-running queries identified (use `pg_stat_activity`)
- [ ] Migration script peer-reviewed

---

## Synchronization of Mobile & Backend Schemas

### Challenge

Mobile and backend databases must stay in sync despite different migration timelines.

### Strategy: API Versioning + Schema Compatibility Matrix

#### API Versioning

```
Mobile App v1.0 → API v1 → Backend Schema v1
Mobile App v1.1 → API v1 + v2 → Backend Schema v2
Mobile App v1.2 → API v2 → Backend Schema v3
```

#### Compatibility Matrix

| Mobile App | API Version | Backend Schema | Notes |
|------------|-------------|----------------|-------|
| 1.0 | v1 | v1, v2 | Old app must work with new backend |
| 1.1 | v1, v2 | v2, v3 | Transition period, dual API support |
| 1.2 | v2 | v3 | Old API deprecated |

### Sync-Aware Migration Example

**Backend Migration V2**: Adds `warranty_expiry_date`

**API v1 Response** (for old mobile app):
```json
{
  "id": "123",
  "title": "Chair",
  "description": "Office chair"
  // No warranty_expiry_date
}
```

**API v2 Response** (for new mobile app):
```json
{
  "id": "123",
  "title": "Chair",
  "description": "Office chair",
  "warranty_expiry_date": "2025-12-31"
}
```

**Implementation**:
```typescript
// API endpoint with version negotiation
router.get('/items/:id', async (req, res) => {
  const apiVersion = req.headers['x-api-version'] || 'v1';

  const item = await db.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);

  if (apiVersion === 'v1') {
    // Strip new fields for backward compatibility
    const { warranty_expiry_date, ...v1Item } = item.rows[0];
    res.json(v1Item);
  } else {
    // Return full item with new fields
    res.json(item.rows[0]);
  }
});
```

---

## Tools & Automation

### Flyway Configuration

```properties
# api-service/flyway.conf

flyway.url=jdbc:postgresql://localhost:5432/inventory_db
flyway.user=inventory_user
flyway.password=${FLYWAY_PASSWORD}
flyway.locations=filesystem:./database/migrations
flyway.schemas=public
flyway.baselineOnMigrate=true
flyway.baselineVersion=1
flyway.validateOnMigrate=true
flyway.cleanDisabled=true  # Safety: prevent accidental data loss
flyway.outOfOrder=false
flyway.group=true  # Run all pending migrations in single transaction
```

### CI/CD Integration

```yaml
# .github/workflows/database-migration.yml

name: Database Migration
on:
  push:
    branches: [main]
    paths:
      - 'api-service/database/migrations/**'

jobs:
  test-migration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Run Flyway migrations (test)
        run: |
          docker run --rm \
            --network=${{ job.services.postgres.network }} \
            -v ${{ github.workspace }}/api-service/database/migrations:/flyway/sql \
            flyway/flyway:latest \
            -url=jdbc:postgresql://postgres:5432/test_db \
            -user=postgres \
            -password=postgres \
            migrate

      - name: Validate schema
        run: |
          docker run --rm \
            --network=${{ job.services.postgres.network }} \
            postgres:15 \
            psql -h postgres -U postgres -d test_db \
            -c "SELECT COUNT(*) FROM inventory_items"

      - name: Run migration tests
        run: npm test -- tests/migrations/

  deploy-migration:
    needs: test-migration
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          flyway \
            -url=jdbc:postgresql://${{ secrets.DB_HOST }}:5432/production_db \
            -user=${{ secrets.DB_USER }} \
            -password=${{ secrets.DB_PASSWORD }} \
            migrate
```

---

## Monitoring & Rollback

### Migration Monitoring

```sql
-- Check migration status
SELECT * FROM flyway_schema_history ORDER BY installed_rank DESC;

-- Check long-running migrations
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
  AND query LIKE '%ALTER TABLE%'
ORDER BY duration DESC;

-- Check table locks
SELECT
  l.locktype,
  l.mode,
  c.relname,
  a.query
FROM pg_locks l
JOIN pg_class c ON l.relation = c.oid
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE c.relname = 'inventory_items';
```

### Rollback Procedures

#### Automated Rollback (Flyway Undo)

```sql
-- U5__remove_full_text_search.sql (undo migration)

DROP TRIGGER IF EXISTS update_inventory_search_vector_trigger ON inventory_items;
DROP FUNCTION IF EXISTS update_inventory_search_vector();
DROP INDEX IF EXISTS idx_inventory_items_search_vector;
DROP INDEX IF EXISTS idx_inventory_items_title_trgm;
DROP INDEX IF EXISTS idx_labels_name_trgm;
ALTER TABLE inventory_items DROP COLUMN search_vector;
```

```bash
# Rollback to specific version
flyway undo -target=4
```

#### Manual Rollback (Point-in-Time Recovery)

```bash
# Restore from backup
pg_restore -d inventory_db -C backup_before_migration_v5.dump

# Or use PITR if available
pg_basebackup -D /backup/base -F tar -z -P
```

---

## Best Practices Summary

### DO

✅ Test migrations on production-like data
✅ Use transactions for safety (SQLite auto-wraps, PostgreSQL use `BEGIN/COMMIT`)
✅ Make migrations idempotent (safe to run multiple times)
✅ Add indexes CONCURRENTLY in PostgreSQL (no table lock)
✅ Backfill data in batches to avoid long locks
✅ Keep old columns/tables for 1-2 versions before dropping
✅ Use expand-contract pattern for breaking changes
✅ Monitor migration duration and table locks
✅ Document rollback procedures
✅ Version migrations in git

### DON'T

❌ Run migrations directly on production without testing
❌ Drop columns immediately (use expand-contract)
❌ Make multiple unrelated changes in one migration
❌ Forget to create indexes after data transformations
❌ Use `ALTER TABLE ... TYPE` on large tables (requires full table rewrite)
❌ Ignore migration failures (investigate and fix)
❌ Skip rollback testing
❌ Assume migrations are instant
❌ Modify old migrations (always create new ones)
❌ Forget to communicate breaking changes to team

---

## Emergency Procedures

### Migration Failed Mid-Execution

1. **Don't panic** - PostgreSQL transactions prevent partial failures
2. **Check error logs**: `SELECT * FROM flyway_schema_history WHERE success = false`
3. **Identify failed SQL**: Check migration file and error message
4. **Fix and retry**: Correct SQL, mark migration as fixed, retry
5. **If corrupted**: Restore from backup, investigate root cause

### Production Database Locked

```sql
-- Find blocking query
SELECT pid, query, state
FROM pg_stat_activity
WHERE state = 'active' AND query LIKE '%ALTER%';

-- Terminate blocking query (use with caution)
SELECT pg_terminate_backend(pid);
```

### Need to Rollback Migration

```bash
# Option 1: Use Flyway undo (if undo migration exists)
flyway undo -target=4

# Option 2: Restore from backup
pg_restore -d inventory_db backup.dump

# Option 3: Manual rollback SQL script
psql inventory_db < rollback_v5.sql
```

---

This migration strategy ensures safe, reliable schema evolution for both mobile and backend databases while maintaining zero-downtime operations and data integrity.
