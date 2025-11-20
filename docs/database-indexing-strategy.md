# Database Indexing Strategy - Visual Home Inventory Manager

## Overview

This document outlines the comprehensive indexing strategy for both mobile (SQLite/Drift) and backend (PostgreSQL) databases, optimized for the primary access patterns of the Visual Home Inventory Manager application.

## Primary Access Patterns

### 1. User Item Browsing & Filtering
- **Pattern**: Fetch user's inventory items with pagination, sorted by various fields
- **Frequency**: Very High (every app launch, navigation)
- **Query Example**:
  ```sql
  SELECT * FROM inventory_items
  WHERE user_id = ? AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 20 OFFSET 0;
  ```

### 2. Full-Text Search
- **Pattern**: Search items by title, description, labels, tags
- **Frequency**: High (primary user interaction)
- **Query Example**:
  ```sql
  -- PostgreSQL
  SELECT * FROM inventory_items
  WHERE user_id = ? AND search_vector @@ to_tsquery('furniture & chair');

  -- SQLite
  SELECT * FROM item_search_fts
  WHERE item_search_fts MATCH 'furniture chair';
  ```

### 3. Location-Based Filtering
- **Pattern**: Browse items by hierarchical location
- **Frequency**: High
- **Query Example**:
  ```sql
  SELECT i.* FROM inventory_items i
  JOIN locations l ON i.location_id = l.id
  WHERE i.user_id = ? AND l.path LIKE '/home/bedroom%';
  ```

### 4. Label/Tag Filtering
- **Pattern**: Filter items by labels or tags
- **Frequency**: High
- **Query Example**:
  ```sql
  SELECT i.* FROM inventory_items i
  JOIN item_labels il ON i.id = il.item_id
  WHERE il.label_id = ? AND i.deleted_at IS NULL;
  ```

### 5. Detection Result Retrieval
- **Pattern**: Fetch detection results for an image
- **Frequency**: Medium (on-demand during detection)
- **Query Example**:
  ```sql
  SELECT dr.* FROM detection_results dr
  JOIN detection_sessions ds ON dr.detection_session_id = ds.id
  WHERE ds.image_id = ?
  ORDER BY dr.confidence_score DESC;
  ```

### 6. Sync Operations
- **Pattern**: Fetch pending sync items by status
- **Frequency**: High (offline-first architecture)
- **Query Example**:
  ```sql
  SELECT * FROM sync_queue
  WHERE status = 'pending'
  ORDER BY priority DESC, sequence_number ASC
  LIMIT 100;
  ```

---

## Mobile Database (SQLite) Indexing

### Core Entity Indexes

#### Inventory Items
```sql
-- Primary access: user's items sorted by date
CREATE INDEX idx_inventory_items_user_id ON inventory_items(user_id);
CREATE INDEX idx_inventory_items_created_at ON inventory_items(created_at DESC);

-- Composite for common pattern: user + not deleted + sorted
CREATE INDEX idx_inventory_items_user_active
  ON inventory_items(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Location filtering
CREATE INDEX idx_inventory_items_location_id ON inventory_items(location_id);

-- Label filtering
CREATE INDEX idx_inventory_items_primary_label_id ON inventory_items(primary_label_id);

-- Sync status (partial index for efficiency)
CREATE INDEX idx_inventory_items_sync_status
  ON inventory_items(sync_status)
  WHERE sync_status != 'synced';

-- Soft deletes (partial index)
CREATE INDEX idx_inventory_items_deleted_at
  ON inventory_items(deleted_at)
  WHERE deleted_at IS NOT NULL;
```

**Rationale**:
- `user_id` index supports primary data isolation
- `created_at DESC` index enables efficient sorting
- Composite index eliminates need for separate lookups
- Partial indexes reduce storage and improve write performance
- `sync_status` partial index optimizes sync queue processing

#### Labels
```sql
-- Hierarchy navigation
CREATE INDEX idx_labels_parent_id ON labels(parent_label_id);

-- Name lookups for autocomplete
CREATE INDEX idx_labels_normalized_name ON labels(normalized_name);

-- Path-based searching (hierarchical queries)
CREATE INDEX idx_labels_path ON labels(path);

-- Popularity-based sorting
CREATE INDEX idx_labels_usage_count ON labels(usage_count DESC);

-- Type and category filtering
CREATE INDEX idx_labels_type_category ON labels(label_type, category);
```

**Rationale**:
- `parent_label_id` enables efficient tree traversal
- `normalized_name` supports case-insensitive search
- `path` enables "starts with" queries for hierarchy
- `usage_count DESC` for popular labels first
- Composite `type_category` for filtered label lists

#### Tags
```sql
-- User's tags
CREATE INDEX idx_tags_user_id ON tags(user_id);

-- Unique constraint + fast lookup
CREATE INDEX idx_tags_normalized_name ON tags(user_id, normalized_name);

-- Popular tags
CREATE INDEX idx_tags_usage_count ON tags(usage_count DESC);
```

#### Locations
```sql
-- User's locations
CREATE INDEX idx_locations_user_id ON locations(user_id);

-- Hierarchy navigation
CREATE INDEX idx_locations_parent_id ON locations(parent_location_id);

-- Path-based queries
CREATE INDEX idx_locations_path ON locations(path);
```

### Relationship Table Indexes

#### Item Labels
```sql
-- Forward lookup: all labels for an item
CREATE INDEX idx_item_labels_item_id ON item_labels(item_id);

-- Reverse lookup: all items with a label
CREATE INDEX idx_item_labels_label_id ON item_labels(label_id);

-- Primary label lookup (partial index)
CREATE INDEX idx_item_labels_primary
  ON item_labels(item_id, is_primary)
  WHERE is_primary = 1;
```

#### Item Tags
```sql
-- Forward lookup: all tags for an item
CREATE INDEX idx_item_tags_item_id ON item_tags(item_id);

-- Reverse lookup: all items with a tag
CREATE INDEX idx_item_tags_tag_id ON item_tags(tag_id);
```

### Detection Indexes

#### Detection Sessions
```sql
CREATE INDEX idx_detection_sessions_user_id ON detection_sessions(user_id);
CREATE INDEX idx_detection_sessions_image_id ON detection_sessions(image_id);
CREATE INDEX idx_detection_sessions_status ON detection_sessions(status);
CREATE INDEX idx_detection_sessions_created_at ON detection_sessions(created_at DESC);
```

#### Detection Results
```sql
CREATE INDEX idx_detection_results_session_id ON detection_results(detection_session_id);
CREATE INDEX idx_detection_results_provider ON detection_results(provider);
CREATE INDEX idx_detection_results_confidence ON detection_results(confidence_score DESC);
CREATE INDEX idx_detection_results_selected
  ON detection_results(is_selected)
  WHERE is_selected = 1;
```

### Full-Text Search Indexes

#### Item Search FTS
```sql
CREATE VIRTUAL TABLE item_search_fts USING fts5(
  item_id UNINDEXED,
  title,
  description,
  notes,
  labels,      -- Concatenated label names
  tags,        -- Concatenated tag names
  location_path,
  content=inventory_items,
  tokenize='porter unicode61'  -- Porter stemming + Unicode support
);
```

**Configuration**:
- **Tokenizer**: `porter unicode61` for stemming and international characters
- **Unindexed columns**: `item_id` (used only for joining back)
- **Weighted fields**: Can implement custom ranking using BM25

#### Label Search FTS
```sql
CREATE VIRTUAL TABLE label_search_fts USING fts5(
  label_id UNINDEXED,
  name,
  normalized_name,
  path,
  category,
  content=labels
);
```

### Sync Queue Indexes

```sql
-- Primary sync processing query
CREATE INDEX idx_sync_queue_status
  ON sync_queue(status, priority DESC, sequence_number);

-- Entity lookup for deduplication
CREATE INDEX idx_sync_queue_entity
  ON sync_queue(entity_type, entity_id);

-- Scheduled sync (partial index)
CREATE INDEX idx_sync_queue_scheduled
  ON sync_queue(scheduled_at)
  WHERE status = 'pending';
```

**Query Optimization**:
```sql
-- This query uses idx_sync_queue_status efficiently
SELECT * FROM sync_queue
WHERE status = 'pending'
ORDER BY priority DESC, sequence_number
LIMIT 100;
```

---

## Backend Database (PostgreSQL) Indexing

### Core Entity Indexes

#### Users
```sql
-- Authentication lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_provider_id ON users(auth_provider_id);

-- Subscription filtering
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);

-- Soft delete
CREATE INDEX idx_users_deleted_at ON users(deleted_at)
  WHERE deleted_at IS NOT NULL;
```

#### Inventory Items
```sql
-- Basic access patterns
CREATE INDEX idx_inventory_items_user_id ON inventory_items(user_id);
CREATE INDEX idx_inventory_items_location_id ON inventory_items(location_id);
CREATE INDEX idx_inventory_items_primary_label_id ON inventory_items(primary_label_id);
CREATE INDEX idx_inventory_items_created_at ON inventory_items(created_at DESC);
CREATE INDEX idx_inventory_items_updated_at ON inventory_items(updated_at DESC);

-- Sync operations (partial)
CREATE INDEX idx_inventory_items_sync_status
  ON inventory_items(sync_status)
  WHERE sync_status != 'synced';

-- Soft delete (partial)
CREATE INDEX idx_inventory_items_deleted_at
  ON inventory_items(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX idx_inventory_items_user_location
  ON inventory_items(user_id, location_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_items_user_created
  ON inventory_items(user_id, created_at DESC)
  WHERE deleted_at IS NULL;
```

**PostgreSQL-Specific Optimizations**:
- **Partial indexes** for soft deletes reduce index size by ~90%
- **Composite indexes** eliminate index lookups
- **DESC ordering** in index matches query pattern

### Full-Text Search (PostgreSQL)

#### TSVector for Inventory Items
```sql
-- Add tsvector column
ALTER TABLE inventory_items ADD COLUMN search_vector tsvector;

-- GIN index for fast full-text search
CREATE INDEX idx_inventory_items_search_vector
  ON inventory_items USING GIN(search_vector);

-- Auto-update search vector on changes
CREATE TRIGGER update_inventory_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, description, notes ON inventory_items
FOR EACH ROW EXECUTE FUNCTION update_inventory_search_vector();
```

**Search Function**:
```sql
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
```

**Weighted Search**:
- Title: Weight 'A' (highest relevance)
- Description: Weight 'B' (medium relevance)
- Notes: Weight 'C' (lower relevance)

#### Trigram Indexes for Fuzzy Search
```sql
-- Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for fuzzy matching
CREATE INDEX idx_inventory_items_title_trgm
  ON inventory_items USING GIN(title gin_trgm_ops);

CREATE INDEX idx_labels_name_trgm
  ON labels USING GIN(name gin_trgm_ops);

CREATE INDEX idx_tags_name_trgm
  ON tags USING GIN(name gin_trgm_ops);
```

**Use Cases**:
- Typo-tolerant search: `SELECT * WHERE title % 'furnture'` (matches 'furniture')
- Autocomplete: `SELECT * WHERE name ILIKE '%chai%'` (uses trigram index)
- Similarity ranking: `SELECT *, similarity(title, 'chair') AS sim ORDER BY sim DESC`

### JSONB Indexes

```sql
-- Detection result metadata
CREATE INDEX idx_detection_results_metadata
  ON detection_results USING GIN(provider_metadata);

-- Image EXIF data
CREATE INDEX idx_image_metadata_exif
  ON image_metadata USING GIN(exif_data);

-- User preferences
CREATE INDEX idx_user_preferences_prefs
  ON user_preferences USING GIN(preferences);
```

**Query Examples**:
```sql
-- Find detections with specific metadata
SELECT * FROM detection_results
WHERE provider_metadata @> '{"vendor": "google"}';

-- Find images with specific camera
SELECT * FROM image_metadata
WHERE exif_data->>'Make' = 'Canon';

-- Find users with dark theme
SELECT * FROM user_preferences
WHERE preferences->>'theme' = 'dark';
```

### Hierarchical Path Indexes

```sql
-- Labels path (consider ltree extension for better performance)
CREATE INDEX idx_labels_path_gin
  ON labels USING GIN (path gin_trgm_ops);

-- Or with ltree (recommended for PostgreSQL):
-- ALTER TABLE labels ALTER COLUMN path TYPE ltree USING path::ltree;
-- CREATE INDEX idx_labels_path_gist ON labels USING GIST (path);
```

**Query Optimization**:
```sql
-- Find all labels under "furniture"
SELECT * FROM labels
WHERE path LIKE '/furniture/%';  -- Uses GIN trigram index

-- With ltree:
-- SELECT * FROM labels WHERE path <@ 'furniture';  -- Uses GIST index
```

---

## Index Maintenance Strategy

### SQLite (Mobile)

#### Automatic Maintenance
SQLite automatically maintains indexes, but consider:

1. **VACUUM** on schema changes:
   ```sql
   VACUUM;  -- Reclaims space and optimizes indexes
   ```

2. **ANALYZE** after bulk operations:
   ```sql
   ANALYZE;  -- Updates query planner statistics
   ```

3. **Automatic ANALYZE** (enabled in Drift):
   ```dart
   LazyDatabase(() async {
     final db = await openDatabase(path);
     await db.execute('PRAGMA auto_vacuum = INCREMENTAL');
     await db.execute('PRAGMA optimize');
     return db;
   });
   ```

#### Monitoring Index Usage
```sql
-- Check index usage (requires EXPLAIN QUERY PLAN)
EXPLAIN QUERY PLAN
SELECT * FROM inventory_items WHERE user_id = ?;

-- Look for "USING INDEX idx_inventory_items_user_id"
```

### PostgreSQL (Backend)

#### Regular Maintenance

1. **Auto-vacuum** (already enabled by default):
   ```sql
   -- Check auto-vacuum settings
   SHOW autovacuum;

   -- Tune for high-write tables
   ALTER TABLE sync_queue SET (
     autovacuum_vacuum_scale_factor = 0.05,
     autovacuum_analyze_scale_factor = 0.02
   );
   ```

2. **Manual VACUUM ANALYZE** (weekly):
   ```sql
   VACUUM ANALYZE inventory_items;
   VACUUM ANALYZE detection_results;
   ```

3. **REINDEX** for bloated indexes (monthly):
   ```sql
   REINDEX INDEX CONCURRENTLY idx_inventory_items_user_id;
   ```

#### Index Monitoring

1. **Check index usage**:
   ```sql
   SELECT
     schemaname,
     tablename,
     indexname,
     idx_scan,
     idx_tup_read,
     idx_tup_fetch
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public'
   ORDER BY idx_scan ASC;
   ```

2. **Identify unused indexes**:
   ```sql
   SELECT
     schemaname,
     tablename,
     indexname,
     pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
   FROM pg_stat_user_indexes
   WHERE idx_scan = 0
     AND indexrelname NOT LIKE '%pkey%'
   ORDER BY pg_relation_size(indexrelid) DESC;
   ```

3. **Check index bloat**:
   ```sql
   SELECT
     schemaname,
     tablename,
     indexname,
     pg_size_pretty(pg_relation_size(indexrelid)) AS size,
     100 * (pg_relation_size(indexrelid) -
            pg_relation_size(indexrelid, 'main')) /
            NULLIF(pg_relation_size(indexrelid), 0) AS bloat_pct
   FROM pg_stat_user_indexes;
   ```

4. **Query performance analysis**:
   ```sql
   -- Enable query logging
   ALTER DATABASE inventory_db SET log_min_duration_statement = 1000;  -- Log queries >1s

   -- Use EXPLAIN ANALYZE
   EXPLAIN ANALYZE
   SELECT * FROM inventory_items
   WHERE user_id = 'xxx' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 20;
   ```

---

## Index Size Estimations

### SQLite (per 10,000 items)

| Index | Estimated Size | Rationale |
|-------|---------------|-----------|
| `idx_inventory_items_user_id` | ~150 KB | Single UUID column |
| `idx_inventory_items_created_at` | ~200 KB | TIMESTAMP column |
| `idx_labels_normalized_name` | ~80 KB | String (avg 20 chars) |
| `item_search_fts` | ~2-3 MB | Full-text index (all text fields) |
| **Total** | ~**4-5 MB** | For 10K items + labels/tags |

### PostgreSQL (per 100,000 items)

| Index | Estimated Size | Rationale |
|-------|---------------|-----------|
| `idx_inventory_items_user_id` | ~2 MB | UUID + BTREE overhead |
| `idx_inventory_items_search_vector` | ~15-20 MB | GIN index for tsvector |
| `idx_inventory_items_title_trgm` | ~5-8 MB | Trigram GIN index |
| `idx_detection_results_metadata` | ~10-15 MB | JSONB GIN index |
| **Total** | ~**50-70 MB** | For 100K items + related data |

---

## Query Optimization Tips

### 1. Use EXPLAIN to Verify Index Usage

**SQLite**:
```sql
EXPLAIN QUERY PLAN
SELECT i.*, l.name AS label_name
FROM inventory_items i
LEFT JOIN labels l ON i.primary_label_id = l.id
WHERE i.user_id = ? AND i.deleted_at IS NULL
ORDER BY i.created_at DESC LIMIT 20;

-- Look for: "USING INDEX idx_inventory_items_user_id"
```

**PostgreSQL**:
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT i.*, l.name AS label_name
FROM inventory_items i
LEFT JOIN labels l ON i.primary_label_id = l.id
WHERE i.user_id = ? AND i.deleted_at IS NULL
ORDER BY i.created_at DESC LIMIT 20;

-- Look for: "Index Scan using idx_inventory_items_user_id"
```

### 2. Leverage Covering Indexes

Instead of:
```sql
-- Requires table lookup for title
SELECT title FROM inventory_items WHERE user_id = ?;
```

Create covering index:
```sql
CREATE INDEX idx_inventory_items_user_title
  ON inventory_items(user_id) INCLUDE (title);  -- PostgreSQL 11+

-- Or composite for older versions:
CREATE INDEX idx_inventory_items_user_title
  ON inventory_items(user_id, title);
```

### 3. Optimize JOIN Queries

**Bad** (sequential scan on both tables):
```sql
SELECT i.*, COUNT(il.id)
FROM inventory_items i
LEFT JOIN item_labels il ON i.id = il.item_id
GROUP BY i.id;
```

**Good** (use indexes + push down WHERE):
```sql
SELECT i.*,
       (SELECT COUNT(*) FROM item_labels WHERE item_id = i.id) AS label_count
FROM inventory_items i
WHERE i.user_id = ? AND i.deleted_at IS NULL;
```

### 4. Use Partial Indexes for Filtered Queries

Instead of:
```sql
CREATE INDEX idx_inventory_items_deleted ON inventory_items(deleted_at);
```

Use partial index (saves 90% space):
```sql
CREATE INDEX idx_inventory_items_deleted
  ON inventory_items(deleted_at)
  WHERE deleted_at IS NOT NULL;
```

### 5. Optimize Full-Text Search

**PostgreSQL** - use ts_rank for relevance:
```sql
SELECT
  *,
  ts_rank(search_vector, query) AS rank
FROM inventory_items,
     to_tsquery('english', 'furniture & chair') AS query
WHERE user_id = ? AND search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

**SQLite** - use BM25 ranking:
```sql
SELECT item_id, rank
FROM item_search_fts
WHERE item_search_fts MATCH 'furniture chair'
ORDER BY rank
LIMIT 20;
```

### 6. Batch Operations for Sync

Instead of:
```sql
-- N+1 query problem
FOR EACH item IN pending_items:
  UPDATE inventory_items SET sync_status = 'synced' WHERE id = item.id;
```

Use batching:
```sql
-- Single query with array (PostgreSQL)
UPDATE inventory_items
SET sync_status = 'synced', synced_at = NOW()
WHERE id = ANY($1::uuid[]);

-- Or use temp table + JOIN (SQLite)
CREATE TEMP TABLE pending_sync(item_id TEXT);
INSERT INTO pending_sync VALUES (?), (?), ...;
UPDATE inventory_items SET sync_status = 'synced'
WHERE id IN (SELECT item_id FROM pending_sync);
```

---

## Performance Benchmarks

### Expected Query Performance (with proper indexes)

| Query Type | SQLite (10K items) | PostgreSQL (100K items) |
|------------|-------------------|------------------------|
| Fetch user items (paginated) | <10ms | <20ms |
| Full-text search | <50ms | <100ms |
| Filter by label/tag | <20ms | <50ms |
| Hierarchical location query | <30ms | <80ms |
| Sync queue processing | <5ms | <10ms |
| Complex aggregation | <100ms | <200ms |

### Warning Signs

Monitor these indicators for index problems:

1. **Query time > 100ms** for simple SELECT
2. **Full table scans** in EXPLAIN output
3. **Index bloat > 30%** (PostgreSQL)
4. **Missing index warnings** in logs
5. **High I/O wait times** during queries

---

## Recommendations

### Immediate Actions

1. **Implement all core indexes** (user_id, created_at, composite)
2. **Set up full-text search** (FTS5 for SQLite, tsvector for PostgreSQL)
3. **Add partial indexes** for soft deletes and sync status
4. **Enable query logging** for slow queries (>100ms)

### Short-term (1-3 months)

1. **Monitor index usage** and remove unused indexes
2. **Implement trigram indexes** for fuzzy search (PostgreSQL)
3. **Optimize bulk sync operations** with batching
4. **Add covering indexes** for common projections

### Long-term (6+ months)

1. **Consider partitioning** for audit_log and search_history (PostgreSQL)
2. **Implement materialized views** for analytics dashboards
3. **Evaluate ltree extension** for hierarchical data (PostgreSQL)
4. **Set up read replicas** for reporting queries (PostgreSQL)

---

## Tools & Monitoring

### SQLite Tools

- **Drift DevTools**: Monitor query performance in development
- **sqlite3 CLI**: EXPLAIN QUERY PLAN analysis
- **SQLite Analyzer**: Disk usage and index statistics

### PostgreSQL Tools

- **pg_stat_statements**: Track query performance
  ```sql
  CREATE EXTENSION pg_stat_statements;
  ```
- **pgAdmin**: Visual EXPLAIN and index management
- **pgBadger**: Log analysis and slow query reports
- **pg_stat_user_indexes**: Index usage statistics
