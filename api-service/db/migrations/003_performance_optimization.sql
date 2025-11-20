-- ============================================================================
-- Performance Optimization Migration
-- Visual Home Inventory Manager - Database Performance Enhancements
-- ============================================================================

-- This migration adds performance-critical indexes, materialized views,
-- and database optimizations for high-throughput operations.

BEGIN;

-- ============================================================================
-- SECTION 1: Additional Indexes for Query Optimization
-- ============================================================================

-- Composite index for label searches with item lookup
-- Eliminates need for separate index scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_labels_item_value
ON labels(item_id, value);

-- Partial index for active sync queue items (reduces index size)
-- Only indexes items that haven't exceeded retry limit
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_queue_pending
ON sync_queue(queued_at, operation)
WHERE retry_count < 3;

-- Covering index for item list queries (index-only scans)
-- Contains all columns needed for list view without table lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_list_covering
ON inventory_items(created_at DESC, id, photo_path, thumbnail_path)
INCLUDE (detection_data);

-- GIN index for full-text search on labels
-- Dramatically improves search performance for text queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_labels_value_gin
ON labels USING GIN(to_tsvector('english', value));

-- Index for category joins (improves category-based filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_categories_composite
ON item_categories(category_id, item_id);

-- ============================================================================
-- SECTION 2: Materialized Views for Dashboard Statistics
-- ============================================================================

-- Drop existing materialized view if exists
DROP MATERIALIZED VIEW IF EXISTS inventory_stats_daily CASCADE;

-- Create materialized view for daily statistics
-- Pre-computes expensive aggregations for dashboard
CREATE MATERIALIZED VIEW inventory_stats_daily AS
SELECT
  DATE_TRUNC('day', i.created_at) as stat_date,
  COUNT(DISTINCT i.id) as total_items,
  COUNT(DISTINCT l.id) as total_labels,
  COUNT(DISTINCT l.value) as unique_labels,
  COUNT(DISTINCT CASE WHEN i.created_at::date = CURRENT_DATE THEN i.id END) as items_added_today,
  AVG(CHAR_LENGTH(i.detection_data)) as avg_detection_size,
  MAX(i.created_at) as last_item_created
FROM inventory_items i
LEFT JOIN labels l ON i.id = l.item_id
GROUP BY DATE_TRUNC('day', i.created_at);

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX ON inventory_stats_daily(stat_date);

-- ============================================================================
-- Drop view if exists and create materialized view for search statistics
DROP MATERIALIZED VIEW IF EXISTS search_popularity_stats CASCADE;

CREATE MATERIALIZED VIEW search_popularity_stats AS
SELECT
  l.value as label_text,
  COUNT(DISTINCT l.item_id) as item_count,
  COUNT(*) as label_count,
  MAX(l.created_at) as last_used
FROM labels l
GROUP BY l.value
HAVING COUNT(DISTINCT l.item_id) > 0
ORDER BY item_count DESC
LIMIT 1000;

CREATE UNIQUE INDEX ON search_popularity_stats(label_text);

-- ============================================================================
-- SECTION 3: Query Performance Functions
-- ============================================================================

-- Function to get items with labels in a single query (eliminates N+1)
CREATE OR REPLACE FUNCTION get_items_with_labels(
  limit_count INTEGER DEFAULT 50,
  offset_count INTEGER DEFAULT 0
)
RETURNS TABLE(
  item_id INTEGER,
  photo_path TEXT,
  thumbnail_path TEXT,
  detection_data TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  labels JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.photo_path,
    i.thumbnail_path,
    i.detection_data,
    i.created_at,
    i.updated_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'key', l.key,
          'value', l.value,
          'created_at', l.created_at
        )
        ORDER BY l.created_at DESC
      ) FILTER (WHERE l.id IS NOT NULL),
      '[]'::jsonb
    ) as labels
  FROM inventory_items i
  LEFT JOIN labels l ON i.id = l.item_id
  GROUP BY i.id, i.photo_path, i.thumbnail_path, i.detection_data, i.created_at, i.updated_at
  ORDER BY i.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function for optimized search with full-text search
CREATE OR REPLACE FUNCTION search_items_fts(
  search_query TEXT,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE(
  item_id INTEGER,
  photo_path TEXT,
  thumbnail_path TEXT,
  detection_data TEXT,
  created_at TIMESTAMP,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    i.id,
    i.photo_path,
    i.thumbnail_path,
    i.detection_data,
    i.created_at,
    ts_rank(to_tsvector('english', l.value), plainto_tsquery('english', search_query)) as relevance
  FROM inventory_items i
  INNER JOIN labels l ON i.id = l.item_id
  WHERE to_tsvector('english', l.value) @@ plainto_tsquery('english', search_query)
  ORDER BY relevance DESC, i.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- SECTION 4: Database Configuration Optimizations
-- ============================================================================

-- Increase shared buffers for better caching (adjust based on available RAM)
-- Recommendation: 25% of total RAM
-- ALTER SYSTEM SET shared_buffers = '2GB';

-- Increase effective cache size (OS + PostgreSQL cache)
-- Recommendation: 50-75% of total RAM
-- ALTER SYSTEM SET effective_cache_size = '6GB';

-- Optimize work memory for complex queries
-- ALTER SYSTEM SET work_mem = '64MB';

-- Increase maintenance work memory for VACUUM, CREATE INDEX
-- ALTER SYSTEM SET maintenance_work_mem = '512MB';

-- Enable parallel query execution
-- ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
-- ALTER SYSTEM SET max_parallel_workers = 8;

-- Optimize checkpoint settings for write performance
-- ALTER SYSTEM SET checkpoint_completion_target = 0.9;
-- ALTER SYSTEM SET wal_buffers = '16MB';

-- Enable query plan caching
-- ALTER SYSTEM SET plan_cache_mode = 'auto';

-- Note: Uncomment ALTER SYSTEM commands and run manually
-- Requires PostgreSQL restart: sudo systemctl restart postgresql

-- ============================================================================
-- SECTION 5: Performance Monitoring Views
-- ============================================================================

-- View to monitor slow queries
CREATE OR REPLACE VIEW slow_queries AS
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time,
  rows
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Queries taking > 100ms on average
ORDER BY total_exec_time DESC
LIMIT 50;

-- View to monitor table sizes and bloat
CREATE OR REPLACE VIEW table_sizes AS
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size,
  pg_stat_get_live_tuples(schemaname||'.'||tablename) AS live_tuples,
  pg_stat_get_dead_tuples(schemaname||'.'||tablename) AS dead_tuples
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- View to monitor index usage
CREATE OR REPLACE VIEW index_usage AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- View to monitor cache hit ratio
CREATE OR REPLACE VIEW cache_hit_ratio AS
SELECT
  'index hit rate' AS name,
  (sum(idx_blks_hit)) / NULLIF(sum(idx_blks_hit + idx_blks_read), 0) AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table hit rate' AS name,
  sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) AS ratio
FROM pg_statio_user_tables;

-- ============================================================================
-- SECTION 6: Automated Maintenance Functions
-- ============================================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  -- Refresh daily stats (concurrent to avoid locking)
  REFRESH MATERIALIZED VIEW CONCURRENTLY inventory_stats_daily;

  -- Refresh search popularity stats
  REFRESH MATERIALIZED VIEW CONCURRENTLY search_popularity_stats;

  -- Log refresh
  RAISE NOTICE 'Materialized views refreshed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to run database maintenance
CREATE OR REPLACE FUNCTION run_database_maintenance()
RETURNS void AS $$
BEGIN
  -- Analyze all tables to update statistics
  ANALYZE inventory_items;
  ANALYZE labels;
  ANALYZE label_search_fts;
  ANALYZE categories;
  ANALYZE item_categories;
  ANALYZE sync_queue;

  -- Vacuum to reclaim space (analyze included)
  VACUUM ANALYZE inventory_items;
  VACUUM ANALYZE labels;

  -- Log maintenance
  RAISE NOTICE 'Database maintenance completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: Prepared Statements for Common Queries
-- ============================================================================

-- Prepared statement for getting recent items
PREPARE get_recent_items(INTEGER) AS
  SELECT * FROM get_items_with_labels($1, 0);

-- Prepared statement for item search
PREPARE search_items(TEXT, INTEGER) AS
  SELECT * FROM search_items_fts($1, $2);

-- Prepared statement for getting item by ID with labels
PREPARE get_item_details(INTEGER) AS
  SELECT * FROM get_items_with_labels(1, 0) WHERE item_id = $1;

-- ============================================================================
-- SECTION 8: Performance Indexes for Specific Query Patterns
-- ============================================================================

-- Index for recent items query (most common query)
-- This is a partial index for items created in last 30 days
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_recent
ON inventory_items(created_at DESC)
WHERE created_at > NOW() - INTERVAL '30 days';

-- Index for label popularity analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_labels_value_created
ON labels(value, created_at DESC);

-- Bitmap index for category filtering (if using PostgreSQL with bitmap support)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categories_bitmap
-- ON item_categories USING BRIN(category_id);

-- ============================================================================
-- SECTION 9: Query Plan Analysis Helpers
-- ============================================================================

-- Function to analyze query performance
CREATE OR REPLACE FUNCTION analyze_query(query_text TEXT)
RETURNS TABLE(plan TEXT) AS $$
BEGIN
  RETURN QUERY EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, VERBOSE) ' || query_text;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 10: Cleanup and Optimization
-- ============================================================================

-- Remove duplicate indexes if any exist
-- Check for duplicate indexes
CREATE OR REPLACE VIEW duplicate_indexes AS
SELECT
  pg_size_pretty(SUM(pg_relation_size(idx))::BIGINT) AS size,
  (array_agg(idx))[1] AS idx1,
  (array_agg(idx))[2] AS idx2,
  (array_agg(idx))[3] AS idx3,
  (array_agg(idx))[4] AS idx4
FROM (
  SELECT
    indexrelid::regclass AS idx,
    (indrelid::text ||E'\n'|| indclass::text ||E'\n'|| indkey::text ||E'\n'||
     COALESCE(indexprs::text,'')||E'\n' || COALESCE(indpred::text,'')) AS key
  FROM pg_index
) sub
GROUP BY key
HAVING COUNT(*) > 1
ORDER BY SUM(pg_relation_size(idx)) DESC;

-- ============================================================================
-- SECTION 11: Performance Testing Helpers
-- ============================================================================

-- Function to generate test data for performance testing
CREATE OR REPLACE FUNCTION generate_test_data(num_items INTEGER)
RETURNS void AS $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..num_items LOOP
    INSERT INTO inventory_items(photo_path, thumbnail_path, detection_data, created_at, updated_at)
    VALUES (
      '/test/path/photo_' || i || '.jpg',
      '/test/path/thumb_' || i || '.jpg',
      '{"label": "test_item_' || i || '", "confidence": 0.95}',
      NOW() - (i || ' days')::INTERVAL,
      NOW() - (i || ' days')::INTERVAL
    );

    -- Add labels
    INSERT INTO labels(item_id, value, created_at)
    VALUES (
      i,
      'test_label_' || (i % 10),
      NOW() - (i || ' days')::INTERVAL
    );
  END LOOP;

  RAISE NOTICE 'Generated % test items', num_items;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Update schema version
-- INSERT INTO schema_migrations(version, applied_at)
-- VALUES ('003_performance_optimization', NOW());

COMMIT;

-- ============================================================================
-- Post-Migration Instructions
-- ============================================================================

-- 1. Run ANALYZE to update statistics:
--    ANALYZE;

-- 2. Check index usage after a few days:
--    SELECT * FROM index_usage WHERE index_scans < 100;

-- 3. Monitor cache hit ratio (should be > 95%):
--    SELECT * FROM cache_hit_ratio;

-- 4. Schedule materialized view refresh (every 5 minutes):
--    SELECT cron.schedule('refresh-stats', '*/5 * * * *',
--           'SELECT refresh_materialized_views()');

-- 5. Schedule maintenance (daily at 2 AM):
--    SELECT cron.schedule('maintenance', '0 2 * * *',
--           'SELECT run_database_maintenance()');

-- 6. Monitor slow queries:
--    SELECT * FROM slow_queries;

-- 7. Check for table bloat:
--    SELECT * FROM table_sizes WHERE dead_tuples > 1000;

-- Performance Optimization Results Expected:
-- - Query time reduction: 60-80%
-- - Index scan efficiency: 90-95%
-- - Cache hit ratio: >95%
-- - Reduced N+1 query patterns
-- - Optimized full-text search
-- - Pre-computed statistics
