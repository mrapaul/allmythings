# Database Architecture Summary - Visual Home Inventory Manager

## Executive Overview

This document provides a high-level summary of the complete database architecture for the Visual Home Inventory Manager application, designed to support offline-first mobile operation with cloud synchronization.

---

## Architecture Highlights

### Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Mobile Database** | SQLite with Drift ORM | Offline-first, zero external dependencies, type-safe queries |
| **Backend Database** | PostgreSQL 15+ | ACID compliance, advanced indexing, JSON support, scalability |
| **Sync Strategy** | Event-sourced queue with conflict resolution | Handles offline edits, ensures data consistency |
| **Search** | FTS5 (mobile) + tsvector + trigrams (backend) | Fast full-text search with fuzzy matching |
| **Hierarchical Data** | Materialized paths | Simple, efficient queries without recursive CTEs |
| **Data Model** | Normalized with selective denormalization | Balance between consistency and performance |

### Database Technology Stack

**Mobile (Drift/SQLite)**:
- **ORM**: Drift 2.x (type-safe, compile-time validation)
- **Database**: SQLite 3.40+ with FTS5
- **Features**: Full-text search, JSON support, triggers, CTEs

**Backend (PostgreSQL)**:
- **Version**: PostgreSQL 15+
- **Extensions**: pg_trgm (fuzzy search), uuid-ossp (UUIDs)
- **Optional**: ltree (hierarchical queries), PostGIS (geolocation)

---

## Entity Relationship Model

### Core Entities

```
┌─────────────┐
│   USERS     │ (1)
└──────┬──────┘
       │ has many
       ▼
┌──────────────────┐
│ INVENTORY_ITEMS  │ (Core entity)
└────────┬─────────┘
         │
         ├─── (M) ITEM_LABELS ───► (M) LABELS (shared taxonomy)
         │
         ├─── (M) ITEM_TAGS ─────► (M) TAGS (user-defined)
         │
         ├─── (1) LOCATION ──────► Hierarchical tree
         │
         ├─── (M) ITEM_IMAGES ───► (1) IMAGE_METADATA
         │
         └─── (1) DETECTION_SESSION
                  │
                  └─── (M) DETECTION_RESULTS
                           │
                           └─── (1) BOUNDING_BOX
```

### Relationship Summary

- **Users → Inventory Items**: One-to-Many (1:M)
- **Items → Labels**: Many-to-Many (M:M) via `item_labels`
- **Items → Tags**: Many-to-Many (M:M) via `item_tags`
- **Items → Location**: Many-to-One (M:1)
- **Items → Images**: One-to-Many (1:M)
- **Items → Detection Session**: Many-to-One (M:1)
- **Detection Session → Results**: One-to-Many (1:M)
- **Detection Result → Bounding Box**: One-to-One (1:1)

---

## Logical Data Model

### 1. User & Authentication
- **users**: User accounts with authentication metadata
- **user_preferences**: User settings and app configuration

### 2. Core Inventory
- **inventory_items**: Physical objects being tracked
- **item_images**: Photos of inventory items
- **image_metadata**: EXIF data and technical image details

### 3. Classification & Organization
- **labels**: Hierarchical object taxonomy (AI-detected + user-created)
- **tags**: User-defined flexible categorization
- **locations**: Hierarchical location structure (Home → Room → Area)
- **item_labels**: M:M mapping of items to labels
- **item_tags**: M:M mapping of items to tags

### 4. AI Detection
- **detection_sessions**: Metadata about each vision API call
- **detection_results**: Individual provider responses
- **bounding_boxes**: Spatial coordinates of detected objects

### 5. Synchronization
- **sync_queue**: Pending changes for offline-first sync
- **sync_conflicts**: Detected conflicts during sync

### 6. Analytics & Search
- **search_history**: User search queries for autocomplete
- **item_search_fts**: Full-text search virtual table (SQLite)

---

## Physical Schema Design

### Table Statistics (Estimated for 10,000 items/user)

| Table | Row Count | Avg Row Size | Total Size | Growth Rate |
|-------|-----------|--------------|------------|-------------|
| inventory_items | 10,000 | 500 bytes | ~5 MB | High |
| labels | 500 | 200 bytes | ~100 KB | Low |
| tags | 100 | 150 bytes | ~15 KB | Medium |
| item_labels | 30,000 | 50 bytes | ~1.5 MB | High |
| item_tags | 15,000 | 50 bytes | ~750 KB | Medium |
| locations | 50 | 250 bytes | ~12 KB | Low |
| item_images | 20,000 | 300 bytes | ~6 MB | High |
| detection_results | 50,000 | 200 bytes | ~10 MB | Medium |
| sync_queue | 500 | 300 bytes | ~150 KB | Transient |
| **Total** | | | **~25-30 MB** | |

**Note**: Image files stored separately in cloud storage (S3/GCS), not in database.

### Index Coverage

**Mobile (SQLite)**:
- 25+ indexes covering all common query patterns
- 2 FTS5 virtual tables (items, labels)
- Partial indexes for soft deletes and sync status

**Backend (PostgreSQL)**:
- 40+ B-tree indexes for efficient lookups
- 3 GIN indexes for full-text search (tsvector)
- 3 GIN indexes for fuzzy search (trigrams)
- 2+ GIN indexes for JSON columns (JSONB)

---

## Data Flow Architecture

### Write Path (Mobile → Backend)

```
┌──────────────┐
│ Mobile App   │
│ (User Edit)  │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Local SQLite DB  │ ← Immediate write (offline-first)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Sync Queue       │ ← Record change for sync
└──────┬───────────┘
       │ (when online)
       ▼
┌──────────────────┐
│ API /sync        │ ← Batch sync endpoint
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ PostgreSQL DB    │ ← Persist to backend
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Conflict Check   │ ← Detect version conflicts
└──────────────────┘
```

### Read Path (Backend → Mobile)

```
┌──────────────┐
│ Mobile App   │
│ (App Launch) │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Check Local DB   │ ← Serve from cache if available
└──────┬───────────┘
       │ (if stale or missing)
       ▼
┌──────────────────┐
│ API /items       │ ← Fetch from backend
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ PostgreSQL DB    │ ← Query with filters
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Sync to Local DB │ ← Update local cache
└──────────────────┘
```

### Detection Flow

```
┌──────────────┐
│ User Captures│
│ Photo        │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Save Locally     │ ← Store image + metadata
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Upload to API    │ ← POST /detect
└──────┬───────────┘
       │
       ├──────────────────┐
       ▼                  ▼
┌─────────────┐  ┌─────────────┐
│Google Vision│  │AWS Rekogn.  │ ← Parallel API calls
└──────┬──────┘  └──────┬──────┘
       │                │
       └────────┬───────┘
                ▼
       ┌─────────────────┐
       │ Ensemble Fusion │ ← Merge results
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │ Store Results   │ ← Save to DB
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │ Return to App   │ ← Display to user
       └─────────────────┘
```

---

## Indexing Strategy

### Primary Indexes (Must Have)

1. **User Isolation**: All multi-tenant tables indexed on `user_id`
2. **Temporal Sorting**: `created_at DESC`, `updated_at DESC` for pagination
3. **Relationships**: Foreign key columns indexed
4. **Search**: Full-text indexes on text columns
5. **Sync Status**: Partial indexes for `sync_status != 'synced'`

### Composite Indexes

1. `(user_id, created_at DESC)` - User's items sorted by date
2. `(user_id, location_id)` - Items by location
3. `(user_id, normalized_name)` - Unique tags/labels per user
4. `(status, priority DESC, sequence_number)` - Sync queue processing

### Full-Text Search Indexes

**SQLite**:
```sql
-- FTS5 virtual table
CREATE VIRTUAL TABLE item_search_fts USING fts5(
  item_id UNINDEXED,
  title, description, notes, labels, tags, location_path,
  tokenize='porter unicode61'
);
```

**PostgreSQL**:
```sql
-- tsvector column with GIN index
ALTER TABLE inventory_items ADD COLUMN search_vector tsvector;
CREATE INDEX idx_inventory_items_search_vector
  ON inventory_items USING GIN(search_vector);

-- Trigram indexes for fuzzy matching
CREATE INDEX idx_inventory_items_title_trgm
  ON inventory_items USING GIN(title gin_trgm_ops);
```

---

## Migration Strategy

### Versioned Migrations

**Mobile (Drift)**:
```dart
@override
int get schemaVersion => 5;

@override
MigrationStrategy get migration => MigrationStrategy(
  onCreate: (m) => m.createAll(),
  onUpgrade: (m, from, to) async {
    if (from < 2) await _migrateV1ToV2(m);
    if (from < 3) await _migrateV2ToV3(m);
    // ...
  },
);
```

**Backend (Flyway)**:
```
database/migrations/
├── V1__initial_schema.sql
├── V2__add_warranty_expiry.sql
├── V3__hierarchical_locations.sql
└── V4__full_text_search.sql
```

### Zero-Downtime Pattern

**Expand-Contract Approach**:
1. **Expand**: Add new column/table (nullable, backward compatible)
2. **Migrate**: Backfill data, update application to use new schema
3. **Contract**: Remove old column/table after all clients updated

---

## Query Performance Targets

| Query Type | Mobile Target | Backend Target | Index Support |
|------------|---------------|----------------|---------------|
| Single item by ID | <10ms | <20ms | Primary key |
| User's items (paginated) | <50ms | <100ms | Composite index |
| Full-text search | <100ms | <200ms | FTS index |
| Filter by label | <50ms | <100ms | Relationship index |
| Hierarchical location | <50ms | <100ms | Path index |
| Complex aggregation | <200ms | <500ms | Multiple indexes |
| Sync batch (100 items) | <500ms | <1s | Batch insert |

---

## Scalability Considerations

### Horizontal Scaling (Backend)

1. **Read Replicas**: Distribute read queries across replicas
   - Primary: Writes + critical reads
   - Replicas: Search, analytics, reporting

2. **Sharding by User ID**: Partition data by user for >1M users
   - Shard key: `user_id` (natural partition boundary)
   - Co-locate user data on same shard

3. **Caching Layer**: Redis for hot data
   - User labels/tags (1 hour TTL)
   - Search results (5 min TTL)
   - Dashboard stats (15 min TTL)

### Vertical Scaling (Mobile)

1. **Lazy Loading**: Load items on-demand, not all at once
2. **Pagination**: 20-50 items per page
3. **Virtual Scrolling**: Render only visible items
4. **Background Sync**: Sync during idle time

---

## Data Retention & Archival

### Active Data

- **Inventory Items**: Retained while user account active
- **Images**: Retained while item exists
- **Detection Results**: Retained for 90 days

### Archival Strategy

```sql
-- Archive old detection sessions (PostgreSQL)
CREATE TABLE detection_sessions_archive (LIKE detection_sessions);

-- Move sessions older than 90 days
INSERT INTO detection_sessions_archive
SELECT * FROM detection_sessions
WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM detection_sessions
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Soft Deletes

- **Items**: Soft delete with `deleted_at` timestamp
- **Retention**: 30 days before permanent deletion
- **Recovery**: User can restore within retention period

---

## Security Considerations

### Row-Level Security (PostgreSQL)

```sql
-- Enable RLS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own items
CREATE POLICY inventory_items_user_isolation ON inventory_items
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

### Data Encryption

1. **At Rest**: Database encryption (managed by cloud provider)
2. **In Transit**: TLS 1.3 for all API communication
3. **Sensitive Fields**: Consider column-level encryption for PII

### Access Control

- **Mobile**: App-level authentication (Firebase, Auth0)
- **Backend**: JWT tokens with user_id claim
- **Database**: Least-privilege roles, no direct access

---

## Monitoring & Observability

### Key Metrics

**Mobile**:
- Database size growth rate
- Query execution time (P50, P95, P99)
- Sync queue depth
- Conflict rate

**Backend**:
- Query latency by endpoint
- Connection pool utilization
- Index hit ratio
- Replication lag (if using replicas)

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Query latency (P95) | >500ms | >2s |
| Database size | >80% quota | >95% quota |
| Sync queue depth | >1000 | >5000 |
| Conflict rate | >5% | >20% |
| Connection pool | >70% | >90% |

---

## Future Enhancements

### Phase 1 (Current)
- ✅ Basic inventory tracking
- ✅ AI object detection
- ✅ Offline-first sync
- ✅ Full-text search

### Phase 2 (Q2 2025)
- 🔄 Advanced analytics dashboard
- 🔄 Multi-user sharing (family accounts)
- 🔄 Barcode/QR code scanning
- 🔄 Export to CSV/PDF

### Phase 3 (Q3 2025)
- 📋 Insurance claim generation
- 📋 AI-powered categorization
- 📋 Voice search
- 📋 Augmented reality item placement

### Database Implications

**Phase 2**:
- Add `shared_items` table for multi-user access
- Add `barcode_scans` table for product lookup

**Phase 3**:
- Add `insurance_policies` and `claims` tables
- Add `ar_placements` table for spatial data
- Consider PostGIS extension for geolocation features

---

## Quick Reference

### File Locations

```
mobile-app/lib/data/database/
├── schema/
│   └── inventory_schema.drift        # Mobile schema definition
├── app_database.dart                  # Drift database class
└── migrations/                        # Drift migration logic

api-service/database/
├── schema/
│   └── 001_inventory_schema.sql      # PostgreSQL schema
└── migrations/
    ├── V1__initial_schema.sql        # Flyway migrations
    ├── V2__add_warranty.sql
    └── ...

docs/
├── database-indexing-strategy.md     # Index design & optimization
├── database-migration-strategy.md    # Migration procedures
└── data-access-patterns-optimization.md # Query patterns
```

### Common Commands

**Mobile (Drift)**:
```bash
# Generate Drift code
dart run build_runner build

# Watch for changes
dart run build_runner watch
```

**Backend (Flyway)**:
```bash
# Run migrations
flyway migrate

# Validate schema
flyway validate

# Get migration info
flyway info

# Repair failed migration
flyway repair
```

**PostgreSQL Admin**:
```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size('inventory_db'));

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT * FROM pg_stat_user_indexes ORDER BY idx_scan DESC;
```

---

## Support & Resources

### Documentation
- [Drift Documentation](https://drift.simonbinder.eu/)
- [PostgreSQL Manual](https://www.postgresql.org/docs/)
- [Flyway Documentation](https://flywaydb.org/documentation/)

### Internal Docs
- Database Schema: `/docs/database-architecture-summary.md`
- Indexing Strategy: `/docs/database-indexing-strategy.md`
- Migration Guide: `/docs/database-migration-strategy.md`
- Query Patterns: `/docs/data-access-patterns-optimization.md`

---

**Last Updated**: 2025-01-18
**Schema Version**: Mobile v1, Backend v1
**Status**: Production Ready
