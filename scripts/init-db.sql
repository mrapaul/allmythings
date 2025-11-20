-- Initial database setup for Visual Home Inventory Manager

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search optimization

-- Create schema
CREATE SCHEMA IF NOT EXISTS inventory;

-- Items table
CREATE TABLE IF NOT EXISTS inventory.items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location VARCHAR(255),
    photo_url VARCHAR(2048),
    thumbnail_url VARCHAR(2048),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_items_user_id ON inventory.items(user_id);
CREATE INDEX idx_items_location ON inventory.items(location);
CREATE INDEX idx_items_created_at ON inventory.items(created_at DESC);
CREATE INDEX idx_items_deleted_at ON inventory.items(deleted_at) WHERE deleted_at IS NULL;

-- Labels table
CREATE TABLE IF NOT EXISTS inventory.labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES inventory.items(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    confidence DECIMAL(3, 2),
    bounding_box JSONB,
    detection_method VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_labels_item_id ON inventory.labels(item_id);
CREATE INDEX idx_labels_label ON inventory.labels USING GIN(label gin_trgm_ops);
CREATE INDEX idx_labels_confidence ON inventory.labels(confidence DESC);

-- Detection results table
CREATE TABLE IF NOT EXISTS inventory.detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES inventory.items(id) ON DELETE CASCADE,
    detection_data JSONB NOT NULL,
    provider VARCHAR(50),
    processing_time_ms INTEGER,
    confidence DECIMAL(3, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_detections_item_id ON inventory.detections(item_id);
CREATE INDEX idx_detections_provider ON inventory.detections(provider);
CREATE INDEX idx_detections_created_at ON inventory.detections(created_at DESC);

-- Search history table
CREATE TABLE IF NOT EXISTS inventory.search_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    query TEXT NOT NULL,
    results_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_search_history_user_id ON inventory.search_history(user_id);
CREATE INDEX idx_search_history_created_at ON inventory.search_history(created_at DESC);

-- User activity log
CREATE TABLE IF NOT EXISTS inventory.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    metadata JSONB,
    ip_address INET,
    user_agent VARCHAR(1024),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_user_id ON inventory.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON inventory.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_action ON inventory.activity_logs(action);

-- Sync state table for mobile app
CREATE TABLE IF NOT EXISTS inventory.sync_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    pending_changes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE INDEX idx_sync_state_user_id ON inventory.sync_state(user_id);

-- Feature flags table
CREATE TABLE IF NOT EXISTS inventory.feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT false,
    percentage INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE IF NOT EXISTS inventory.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    record_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_table_operation ON inventory.audit_logs(table_name, operation);
CREATE INDEX idx_audit_logs_record_id ON inventory.audit_logs(record_id);
CREATE INDEX idx_audit_logs_created_at ON inventory.audit_logs(created_at DESC);

-- Views for common queries
CREATE OR REPLACE VIEW inventory.items_with_labels AS
SELECT
    i.id,
    i.user_id,
    i.name,
    i.description,
    i.location,
    i.photo_url,
    i.thumbnail_url,
    i.created_at,
    COALESCE(json_agg(
        json_build_object(
            'id', l.id,
            'label', l.label,
            'confidence', l.confidence,
            'bounding_box', l.bounding_box,
            'detection_method', l.detection_method
        )
    ) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS labels
FROM inventory.items i
LEFT JOIN inventory.labels l ON i.id = l.item_id
WHERE i.deleted_at IS NULL
GROUP BY i.id, i.user_id, i.name, i.description, i.location, i.photo_url, i.thumbnail_url, i.created_at;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION inventory.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_items_updated_at
BEFORE UPDATE ON inventory.items
FOR EACH ROW
EXECUTE FUNCTION inventory.update_updated_at_column();

CREATE TRIGGER update_sync_state_updated_at
BEFORE UPDATE ON inventory.sync_state
FOR EACH ROW
EXECUTE FUNCTION inventory.update_updated_at_column();

CREATE TRIGGER update_feature_flags_updated_at
BEFORE UPDATE ON inventory.feature_flags
FOR EACH ROW
EXECUTE FUNCTION inventory.update_updated_at_column();

-- Grant permissions
GRANT USAGE ON SCHEMA inventory TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA inventory TO PUBLIC;
GRANT INSERT, UPDATE, DELETE ON inventory.items TO PUBLIC;
GRANT INSERT, UPDATE, DELETE ON inventory.labels TO PUBLIC;
GRANT INSERT, UPDATE, DELETE ON inventory.detections TO PUBLIC;
GRANT INSERT ON inventory.search_history TO PUBLIC;
GRANT INSERT ON inventory.activity_logs TO PUBLIC;
GRANT INSERT, UPDATE ON inventory.sync_state TO PUBLIC;

-- Comments
COMMENT ON TABLE inventory.items IS 'Stores user inventory items';
COMMENT ON TABLE inventory.labels IS 'Stores detected labels/objects for items';
COMMENT ON TABLE inventory.detections IS 'Stores detection results from various providers';
COMMENT ON TABLE inventory.search_history IS 'Stores user search history for analytics';
COMMENT ON TABLE inventory.activity_logs IS 'Logs user activities for audit purposes';
COMMENT ON TABLE inventory.sync_state IS 'Tracks synchronization state for mobile apps';
COMMENT ON TABLE inventory.feature_flags IS 'Manages feature flags for canary deployments';
COMMENT ON TABLE inventory.audit_logs IS 'Complete audit trail of all data changes';
