-- ============================================================================
-- Visual Home Inventory Manager - PostgreSQL Database Schema
-- ============================================================================
-- This schema supports:
-- - User-based data isolation (multi-tenant)
-- - Full-text search using tsvector
-- - Soft deletes for offline sync
-- - JSONB for flexible detection metadata
-- - Indexes for performance
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- User authentication and profile data
-- NOTE: This might be managed by a separate auth service (e.g., Supabase Auth)
-- If using external auth, this table can be simplified or removed.
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),  -- NULL if using OAuth/external auth
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,  -- Soft delete

    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Index for login lookups
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ============================================================================
-- INVENTORY ITEMS TABLE
-- ============================================================================
-- Core table for storing inventory items with detection metadata
-- ============================================================================

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,

    -- Photo storage (S3 keys or presigned URLs)
    photo_s3_key VARCHAR(500) NOT NULL,
    thumbnail_s3_key VARCHAR(500) NOT NULL,

    -- Detection metadata stored as JSONB for flexibility
    -- Matches DetectionResponse schema from OpenAPI
    detection_data JSONB NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,  -- Soft delete for sync

    -- Foreign keys
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT valid_photo_s3_key CHECK (length(trim(photo_s3_key)) > 0),
    CONSTRAINT valid_thumbnail_s3_key CHECK (length(trim(thumbnail_s3_key)) > 0),
    CONSTRAINT valid_detection_data CHECK (detection_data IS NOT NULL)
);

-- Indexes for common queries
CREATE INDEX idx_inventory_items_user_id ON inventory_items(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_items_created_at ON inventory_items(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_items_updated_at ON inventory_items(updated_at DESC);
CREATE INDEX idx_inventory_items_deleted_at ON inventory_items(deleted_at) WHERE deleted_at IS NOT NULL;

-- JSONB indexes for querying detection data
CREATE INDEX idx_inventory_items_detection_confidence
    ON inventory_items USING btree (
        (detection_data -> 'ensembleMetrics' ->> 'averageConfidence')::numeric
    ) WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_items_detection_data_gin
    ON inventory_items USING gin (detection_data jsonb_path_ops);

-- ============================================================================
-- LABELS TABLE
-- ============================================================================
-- Custom labels/tags for inventory items
-- Supports hierarchical labeling with optional 'key' field
-- ============================================================================

CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL,

    -- Optional category/key (e.g., 'type', 'color', 'brand', 'room')
    key VARCHAR(50),

    -- Label value (e.g., 'laptop', 'black', 'Apple', 'bedroom')
    value VARCHAR(100) NOT NULL,

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT valid_value CHECK (length(trim(value)) > 0 AND length(value) <= 100),
    CONSTRAINT valid_key CHECK (key IS NULL OR (length(trim(key)) > 0 AND length(key) <= 50)),

    -- Prevent duplicate labels on same item
    UNIQUE (item_id, key, value)
);

-- Indexes for common queries
CREATE INDEX idx_labels_item_id ON labels(item_id);
CREATE INDEX idx_labels_value ON labels(value);
CREATE INDEX idx_labels_key ON labels(key) WHERE key IS NOT NULL;

-- Composite index for searching by key-value pairs
CREATE INDEX idx_labels_key_value ON labels(key, value);

-- ============================================================================
-- FULL-TEXT SEARCH TABLE
-- ============================================================================
-- Dedicated FTS table for fast searching across labels
-- Uses PostgreSQL's built-in full-text search capabilities
-- ============================================================================

CREATE TABLE label_search_fts (
    label_id UUID PRIMARY KEY,
    item_id UUID NOT NULL,
    search_vector tsvector NOT NULL,

    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

-- GIN index for fast full-text search
CREATE INDEX idx_label_search_fts_vector ON label_search_fts USING gin(search_vector);

-- Index for joining with items
CREATE INDEX idx_label_search_fts_item_id ON label_search_fts(item_id);

-- ============================================================================
-- TRIGGERS FOR FTS TABLE
-- ============================================================================
-- Automatically maintain FTS table when labels are created/updated/deleted
-- ============================================================================

-- Function to update FTS table
CREATE OR REPLACE FUNCTION update_label_search_fts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO label_search_fts (label_id, item_id, search_vector)
        VALUES (
            NEW.id,
            NEW.item_id,
            to_tsvector('english', COALESCE(NEW.key, '') || ' ' || NEW.value)
        );
        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE label_search_fts
        SET search_vector = to_tsvector('english', COALESCE(NEW.key, '') || ' ' || NEW.value)
        WHERE label_id = NEW.id;
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        DELETE FROM label_search_fts WHERE label_id = OLD.id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER label_search_fts_insert
    AFTER INSERT ON labels
    FOR EACH ROW
    EXECUTE FUNCTION update_label_search_fts();

CREATE TRIGGER label_search_fts_update
    AFTER UPDATE ON labels
    FOR EACH ROW
    EXECUTE FUNCTION update_label_search_fts();

CREATE TRIGGER label_search_fts_delete
    AFTER DELETE ON labels
    FOR EACH ROW
    EXECUTE FUNCTION update_label_search_fts();

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
-- Automatically update updated_at timestamp on row changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at column
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_items_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SYNC METADATA TABLE (OPTIONAL)
-- ============================================================================
-- Track sync state per user for more efficient incremental syncs
-- ============================================================================

CREATE TABLE sync_metadata (
    user_id UUID PRIMARY KEY,
    last_sync_timestamp TIMESTAMP WITH TIME ZONE,
    sync_token VARCHAR(255),  -- Optional: for cursor-based pagination
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- HELPFUL VIEWS
-- ============================================================================

-- View: Items with label count
CREATE VIEW items_with_label_count AS
SELECT
    i.id,
    i.user_id,
    i.photo_s3_key,
    i.thumbnail_s3_key,
    i.detection_data,
    i.created_at,
    i.updated_at,
    COUNT(l.id) as label_count,
    ARRAY_AGG(l.value ORDER BY l.created_at) FILTER (WHERE l.value IS NOT NULL) as label_values
FROM inventory_items i
LEFT JOIN labels l ON i.id = l.item_id
WHERE i.deleted_at IS NULL
GROUP BY i.id;

-- View: Recent items per user (last 30 days)
CREATE VIEW recent_items AS
SELECT
    i.*,
    ARRAY_AGG(
        jsonb_build_object(
            'id', l.id,
            'key', l.key,
            'value', l.value,
            'createdAt', l.created_at
        ) ORDER BY l.created_at
    ) FILTER (WHERE l.id IS NOT NULL) as labels
FROM inventory_items i
LEFT JOIN labels l ON i.id = l.item_id
WHERE
    i.deleted_at IS NULL
    AND i.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY i.id
ORDER BY i.created_at DESC;

-- ============================================================================
-- COMMON QUERY EXAMPLES
-- ============================================================================

-- Search inventory items by label text
-- Example usage:
-- SELECT * FROM search_inventory('user-uuid', 'laptop black', 0.8, 20, 0);
CREATE OR REPLACE FUNCTION search_inventory(
    p_user_id UUID,
    p_query TEXT,
    p_min_confidence NUMERIC DEFAULT 0.7,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    item_id UUID,
    photo_s3_key VARCHAR,
    thumbnail_s3_key VARCHAR,
    detection_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    labels JSONB,
    search_rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        i.id,
        i.photo_s3_key,
        i.thumbnail_s3_key,
        i.detection_data,
        i.created_at,
        i.updated_at,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', l.id,
                    'key', l.key,
                    'value', l.value,
                    'createdAt', l.created_at
                )
            ) FILTER (WHERE l.id IS NOT NULL),
            '[]'::jsonb
        ) as labels,
        ts_rank(fts.search_vector, plainto_tsquery('english', p_query)) as search_rank
    FROM inventory_items i
    LEFT JOIN labels l ON i.id = l.item_id
    LEFT JOIN label_search_fts fts ON l.id = fts.label_id
    WHERE
        i.user_id = p_user_id
        AND i.deleted_at IS NULL
        AND (
            fts.search_vector @@ plainto_tsquery('english', p_query)
            OR l.value ILIKE '%' || p_query || '%'  -- Fallback fuzzy search
        )
        AND (i.detection_data -> 'ensembleMetrics' ->> 'averageConfidence')::numeric >= p_min_confidence
    GROUP BY i.id, fts.search_vector
    ORDER BY search_rank DESC, i.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Get all changes since timestamp (for sync)
CREATE OR REPLACE FUNCTION get_changes_since(
    p_user_id UUID,
    p_since TIMESTAMP WITH TIME ZONE,
    p_limit INT DEFAULT 100,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    items JSONB,
    labels JSONB,
    deleted_item_ids UUID[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Updated/created items
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', i.id,
                    'photoS3Key', i.photo_s3_key,
                    'thumbnailS3Key', i.thumbnail_s3_key,
                    'detectionData', i.detection_data,
                    'createdAt', i.created_at,
                    'updatedAt', i.updated_at
                )
            )
            FROM (
                SELECT * FROM inventory_items
                WHERE user_id = p_user_id
                AND updated_at > p_since
                AND deleted_at IS NULL
                ORDER BY updated_at DESC
                LIMIT p_limit OFFSET p_offset
            ) i
        ) as items,

        -- Updated/created labels
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', l.id,
                    'itemId', l.item_id,
                    'key', l.key,
                    'value', l.value,
                    'createdAt', l.created_at
                )
            )
            FROM labels l
            INNER JOIN inventory_items i ON l.item_id = i.id
            WHERE i.user_id = p_user_id
            AND l.created_at > p_since
        ) as labels,

        -- Deleted item IDs
        (
            SELECT ARRAY_AGG(id)
            FROM inventory_items
            WHERE user_id = p_user_id
            AND deleted_at > p_since
            AND deleted_at IS NOT NULL
        ) as deleted_item_ids;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA (for development/testing)
-- ============================================================================

-- Uncomment to insert sample data
/*
-- Sample user
INSERT INTO users (id, email, password_hash)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'test@example.com',
    '$2b$10$abcdefghijklmnopqrstuvwxyz123456789'  -- Replace with actual hash
);

-- Sample inventory item
INSERT INTO inventory_items (id, user_id, photo_s3_key, thumbnail_s3_key, detection_data)
VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'users/a0eebc99/photos/photo123.jpg',
    'users/a0eebc99/thumbnails/photo123_thumb.jpg',
    '{
        "success": true,
        "ensembleMode": "partial",
        "processingTimeMs": 1250,
        "detections": [
            {
                "id": "det_abc123",
                "label": "laptop",
                "confidence": 0.92,
                "boundingBox": {"x": 0.2, "y": 0.3, "width": 0.4, "height": 0.5},
                "ensembleDetails": {
                    "providerAgreement": 2,
                    "confidenceByProvider": {"google": 0.95, "aws": 0.89},
                    "labelConsensus": "majority"
                },
                "alternativeLabels": []
            }
        ],
        "providerResults": [],
        "ensembleMetrics": {
            "providersUsed": 2,
            "averageConfidence": 0.92,
            "consensusRate": 1.0
        }
    }'::jsonb
);

-- Sample labels
INSERT INTO labels (item_id, key, value)
VALUES
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'type', 'laptop'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'brand', 'Apple'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'room', 'bedroom');
*/

-- ============================================================================
-- PERFORMANCE TIPS
-- ============================================================================
-- 1. Run ANALYZE after bulk inserts to update statistics
-- 2. Consider partitioning inventory_items by created_at for very large datasets
-- 3. Monitor index usage with pg_stat_user_indexes
-- 4. Use EXPLAIN ANALYZE to optimize slow queries
-- 5. Configure autovacuum appropriately for high-write tables
-- ============================================================================

-- Display table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
