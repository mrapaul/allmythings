-- ============================================================================
-- Visual Home Inventory Manager - Backend Database Schema (PostgreSQL)
-- ============================================================================
-- Optimized for cloud sync, multi-user access, and analytics
-- Supports advanced querying, full-text search, and scalability

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search with advanced features
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Trigram similarity matching

-- Enable PostGIS if geolocation features are needed
-- CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- TYPES & ENUMS
-- ============================================================================

CREATE TYPE sync_status_enum AS ENUM ('pending', 'synced', 'conflict', 'error');
CREATE TYPE label_type_enum AS ENUM ('ai', 'user', 'system');
CREATE TYPE location_type_enum AS ENUM ('home', 'floor', 'room', 'area', 'storage', 'outdoor');
CREATE TYPE detection_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed', 'partial');
CREATE TYPE fusion_strategy_enum AS ENUM ('weighted_confidence', 'unanimous', 'majority_vote', 'highest_confidence');
CREATE TYPE vision_provider_enum AS ENUM ('google_vision', 'aws_rekognition', 'azure_cv', 'mock');
CREATE TYPE upload_status_enum AS ENUM ('pending', 'uploading', 'uploaded', 'failed');
CREATE TYPE label_source_enum AS ENUM ('ai_detected', 'user_added', 'user_edited');
CREATE TYPE operation_enum AS ENUM ('create', 'update', 'delete');
CREATE TYPE sync_queue_status_enum AS ENUM ('pending', 'syncing', 'completed', 'failed', 'conflict');
CREATE TYPE conflict_resolution_enum AS ENUM ('use_local', 'use_remote', 'merge', 'manual');
CREATE TYPE search_type_enum AS ENUM ('text', 'label', 'tag', 'location', 'advanced');

-- ============================================================================
-- CORE ENTITIES
-- ============================================================================

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Authentication (managed by auth service)
  auth_provider_id TEXT UNIQUE NOT NULL, -- External auth ID (Firebase, Auth0, etc.)
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,

  -- Profile
  display_name TEXT,
  avatar_url TEXT,
  phone_number TEXT,

  -- Subscription/plan
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK(subscription_tier IN ('free', 'premium', 'enterprise')),
  subscription_expires_at TIMESTAMPTZ,

  -- Limits (based on tier)
  max_items INTEGER NOT NULL DEFAULT 100,
  max_storage_mb INTEGER NOT NULL DEFAULT 100,

  -- Statistics (denormalized for dashboard)
  total_items INTEGER NOT NULL DEFAULT 0,
  total_storage_mb DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ, -- Soft delete

  -- Sync tracking
  last_synced_at TIMESTAMPTZ
);

-- Inventory items - core entity
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- User-customizable fields
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT,

  -- Classification
  primary_label_id UUID REFERENCES labels(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,

  -- Metadata
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  estimated_value_cents BIGINT CHECK(estimated_value_cents >= 0),
  purchase_date DATE,
  warranty_expiry_date DATE,

  -- Serial/model information
  serial_number TEXT,
  model_number TEXT,
  manufacturer TEXT,

  -- Detection tracking
  detection_session_id UUID REFERENCES detection_sessions(id) ON DELETE SET NULL,
  primary_image_id UUID REFERENCES item_images(id) ON DELETE SET NULL,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ, -- Soft delete

  -- Sync tracking
  synced_at TIMESTAMPTZ,
  sync_status sync_status_enum NOT NULL DEFAULT 'pending',
  version INTEGER NOT NULL DEFAULT 1, -- Optimistic locking

  -- Client metadata
  client_id UUID, -- Which client created/last modified
  client_timestamp TIMESTAMPTZ
);

-- Labels - hierarchical taxonomy
CREATE TABLE labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Label information
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL, -- Lowercase, sanitized
  parent_label_id UUID REFERENCES labels(id) ON DELETE SET NULL,
  level INTEGER NOT NULL DEFAULT 0 CHECK(level >= 0),
  path TEXT NOT NULL, -- Materialized path with ltree type would be better

  -- Classification
  label_type label_type_enum NOT NULL DEFAULT 'ai',
  category TEXT,

  -- Metadata
  icon TEXT,
  color TEXT,
  description TEXT,

  -- Statistics (denormalized)
  usage_count INTEGER NOT NULL DEFAULT 0,

  -- AI provider tracking
  ai_provider vision_provider_enum,
  avg_confidence_score DECIMAL(5,4) CHECK(avg_confidence_score BETWEEN 0 AND 1),

  -- Localization
  locale TEXT NOT NULL DEFAULT 'en',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sync
  synced_at TIMESTAMPTZ,

  UNIQUE(normalized_name, parent_label_id, locale)
);

-- Create GIN index for path searching using ltree pattern
-- Note: If using ltree extension, convert path column to ltree type
CREATE INDEX idx_labels_path_gin ON labels USING GIN (path gin_trgm_ops);

-- Tags - user-defined categorization
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  description TEXT,

  usage_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  synced_at TIMESTAMPTZ,

  UNIQUE(user_id, normalized_name)
);

-- Locations - hierarchical structure
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  parent_location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  level INTEGER NOT NULL DEFAULT 0 CHECK(level >= 0),
  path TEXT NOT NULL, -- Materialized path

  location_type location_type_enum,

  -- Metadata
  description TEXT,
  icon TEXT,
  image_url TEXT,

  -- Physical dimensions (optional)
  floor_number INTEGER,
  square_footage DECIMAL(10,2),

  -- Statistics
  item_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  synced_at TIMESTAMPTZ,

  UNIQUE(user_id, path)
);

-- ============================================================================
-- RELATIONSHIP TABLES
-- ============================================================================

-- Item to Label mapping
CREATE TABLE item_labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,

  -- Tracking
  source label_source_enum NOT NULL,
  confidence_score DECIMAL(5,4) CHECK(confidence_score BETWEEN 0 AND 1),
  detection_result_id UUID REFERENCES detection_results(id) ON DELETE SET NULL,

  is_primary BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  synced_at TIMESTAMPTZ,

  UNIQUE(item_id, label_id)
);

-- Item to Tag mapping
CREATE TABLE item_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  synced_at TIMESTAMPTZ,

  UNIQUE(item_id, tag_id)
);

-- ============================================================================
-- DETECTION & AI PROCESSING
-- ============================================================================

-- Detection sessions
CREATE TABLE detection_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Request metadata
  image_id UUID NOT NULL REFERENCES item_images(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Provider configuration
  providers_used vision_provider_enum[] NOT NULL,
  fusion_strategy fusion_strategy_enum NOT NULL DEFAULT 'weighted_confidence',

  -- Results
  status detection_status_enum NOT NULL DEFAULT 'pending',
  error_message TEXT,

  -- Ensemble metrics
  total_detections INTEGER NOT NULL DEFAULT 0,
  avg_confidence DECIMAL(5,4) CHECK(avg_confidence BETWEEN 0 AND 1),
  provider_agreement_score DECIMAL(5,4) CHECK(provider_agreement_score BETWEEN 0 AND 1),
  processing_time_ms INTEGER,

  -- Metadata
  api_version TEXT,
  client_version TEXT,
  request_ip INET,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  synced_at TIMESTAMPTZ
);

-- Detection results
CREATE TABLE detection_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  detection_session_id UUID NOT NULL REFERENCES detection_sessions(id) ON DELETE CASCADE,

  -- Provider info
  provider vision_provider_enum NOT NULL,
  provider_request_id TEXT,

  -- Detection data
  detected_label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  confidence_score DECIMAL(5,4) NOT NULL CHECK(confidence_score BETWEEN 0 AND 1),

  -- Spatial information
  has_bounding_box BOOLEAN NOT NULL DEFAULT FALSE,

  -- Additional metadata (JSONB for flexibility)
  provider_metadata JSONB,
  locale TEXT,

  -- Result quality
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  fusion_weight DECIMAL(5,4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  synced_at TIMESTAMPTZ
);

-- Bounding boxes
CREATE TABLE bounding_boxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  detection_result_id UUID NOT NULL REFERENCES detection_results(id) ON DELETE CASCADE,

  -- Normalized coordinates (0-1 range)
  x_min DECIMAL(6,5) NOT NULL CHECK(x_min BETWEEN 0 AND 1),
  y_min DECIMAL(6,5) NOT NULL CHECK(y_min BETWEEN 0 AND 1),
  x_max DECIMAL(6,5) NOT NULL CHECK(x_max BETWEEN 0 AND 1),
  y_max DECIMAL(6,5) NOT NULL CHECK(y_max BETWEEN 0 AND 1),

  -- Calculated dimensions
  width DECIMAL(6,5) NOT NULL CHECK(width BETWEEN 0 AND 1),
  height DECIMAL(6,5) NOT NULL CHECK(height BETWEEN 0 AND 1),
  area DECIMAL(6,5) NOT NULL CHECK(area BETWEEN 0 AND 1),

  confidence DECIMAL(5,4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- IMAGES & MEDIA
-- ============================================================================

-- Item images
CREATE TABLE item_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,

  -- File information (cloud storage)
  storage_provider TEXT NOT NULL DEFAULT 's3' CHECK(storage_provider IN ('s3', 'gcs', 'azure_blob', 'cloudinary')),
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL, -- Object key/path in bucket
  storage_url TEXT NOT NULL, -- Full URL

  thumbnail_storage_key TEXT,
  thumbnail_url TEXT,

  -- Image properties
  width INTEGER,
  height INTEGER,
  file_size_bytes BIGINT,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',

  -- Content hash (for deduplication)
  content_hash TEXT, -- SHA256 hash

  -- Metadata
  captured_at TIMESTAMPTZ NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Upload tracking
  upload_status upload_status_enum NOT NULL DEFAULT 'pending',
  uploaded_by_client_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  synced_at TIMESTAMPTZ,

  UNIQUE(storage_provider, storage_bucket, storage_key)
);

-- Image metadata
CREATE TABLE image_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_id UUID NOT NULL UNIQUE REFERENCES item_images(id) ON DELETE CASCADE,

  -- EXIF data (stored as JSONB for flexibility)
  exif_data JSONB,

  -- Extracted common fields for querying
  camera_make TEXT,
  camera_model TEXT,
  focal_length DECIMAL(6,2),
  aperture DECIMAL(4,2),
  iso INTEGER,
  exposure_time TEXT,
  flash_used BOOLEAN,

  -- Location (from EXIF GPS)
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  gps_altitude DECIMAL(8,2),

  -- For PostGIS:
  -- gps_location GEOGRAPHY(POINT, 4326),

  -- Orientation
  orientation INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SYNCHRONIZATION
-- ============================================================================

-- Sync queue (backend tracking of client sync requests)
CREATE TABLE sync_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Change tracking
  entity_type TEXT NOT NULL CHECK(
    entity_type IN ('inventory_item', 'label', 'tag', 'location', 'item_image',
                    'item_label', 'item_tag', 'detection_session')
  ),
  entity_id UUID NOT NULL,
  operation operation_enum NOT NULL,

  -- Change data
  payload JSONB NOT NULL,

  -- Sync status
  status sync_queue_status_enum NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  -- Priority and ordering
  priority INTEGER NOT NULL DEFAULT 0,
  sequence_number BIGSERIAL,
  depends_on_id UUID REFERENCES sync_queue(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ
);

-- Sync conflicts
CREATE TABLE sync_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Conflict data
  local_version JSONB NOT NULL,
  remote_version JSONB NOT NULL,
  local_timestamp TIMESTAMPTZ NOT NULL,
  remote_timestamp TIMESTAMPTZ NOT NULL,

  -- Resolution
  resolution_strategy conflict_resolution_enum,
  resolved_at TIMESTAMPTZ,
  resolved_version JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SEARCH & ANALYTICS
-- ============================================================================

-- Search history
CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,

  -- Results
  result_count INTEGER NOT NULL DEFAULT 0,
  clicked_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,

  -- Metadata
  search_type search_type_enum NOT NULL,
  filters_used JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User preferences
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- All preferences stored as JSONB for flexibility
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- AUDIT & LOGGING
-- ============================================================================

-- Audit log for compliance and debugging
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Actor
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id UUID,

  -- Action
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'view', 'export'
  entity_type TEXT NOT NULL,
  entity_id UUID,

  -- Changes (for update operations)
  old_values JSONB,
  new_values JSONB,

  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id UUID,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API rate limiting
CREATE TABLE api_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, endpoint, window_start)
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_provider_id ON users(auth_provider_id);
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Inventory items indexes
CREATE INDEX idx_inventory_items_user_id ON inventory_items(user_id);
CREATE INDEX idx_inventory_items_location_id ON inventory_items(location_id);
CREATE INDEX idx_inventory_items_primary_label_id ON inventory_items(primary_label_id);
CREATE INDEX idx_inventory_items_created_at ON inventory_items(created_at DESC);
CREATE INDEX idx_inventory_items_updated_at ON inventory_items(updated_at DESC);
CREATE INDEX idx_inventory_items_sync_status ON inventory_items(sync_status)
  WHERE sync_status != 'synced';
CREATE INDEX idx_inventory_items_deleted_at ON inventory_items(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Composite index for common query patterns
CREATE INDEX idx_inventory_items_user_location ON inventory_items(user_id, location_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_items_user_created ON inventory_items(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Labels indexes
CREATE INDEX idx_labels_parent_id ON labels(parent_label_id);
CREATE INDEX idx_labels_normalized_name ON labels(normalized_name);
CREATE INDEX idx_labels_usage_count ON labels(usage_count DESC);
CREATE INDEX idx_labels_type_category ON labels(label_type, category);
CREATE INDEX idx_labels_locale ON labels(locale);

-- Tags indexes
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_tags_normalized_name ON tags(user_id, normalized_name);
CREATE INDEX idx_tags_usage_count ON tags(usage_count DESC);

-- Locations indexes
CREATE INDEX idx_locations_user_id ON locations(user_id);
CREATE INDEX idx_locations_parent_id ON locations(parent_location_id);
CREATE INDEX idx_locations_path ON locations(path);
CREATE INDEX idx_locations_deleted_at ON locations(deleted_at) WHERE deleted_at IS NOT NULL;

-- Item labels indexes
CREATE INDEX idx_item_labels_item_id ON item_labels(item_id);
CREATE INDEX idx_item_labels_label_id ON item_labels(label_id);
CREATE INDEX idx_item_labels_primary ON item_labels(item_id, is_primary)
  WHERE is_primary = TRUE;

-- Item tags indexes
CREATE INDEX idx_item_tags_item_id ON item_tags(item_id);
CREATE INDEX idx_item_tags_tag_id ON item_tags(tag_id);

-- Detection sessions indexes
CREATE INDEX idx_detection_sessions_user_id ON detection_sessions(user_id);
CREATE INDEX idx_detection_sessions_image_id ON detection_sessions(image_id);
CREATE INDEX idx_detection_sessions_status ON detection_sessions(status);
CREATE INDEX idx_detection_sessions_created_at ON detection_sessions(created_at DESC);

-- Detection results indexes
CREATE INDEX idx_detection_results_session_id ON detection_results(detection_session_id);
CREATE INDEX idx_detection_results_provider ON detection_results(provider);
CREATE INDEX idx_detection_results_confidence ON detection_results(confidence_score DESC);
CREATE INDEX idx_detection_results_selected ON detection_results(is_selected)
  WHERE is_selected = TRUE;
CREATE INDEX idx_detection_results_normalized_label ON detection_results(normalized_label);

-- Item images indexes
CREATE INDEX idx_item_images_item_id ON item_images(item_id);
CREATE INDEX idx_item_images_primary ON item_images(item_id, is_primary)
  WHERE is_primary = TRUE;
CREATE INDEX idx_item_images_upload_status ON item_images(upload_status)
  WHERE upload_status != 'uploaded';
CREATE INDEX idx_item_images_content_hash ON item_images(content_hash)
  WHERE content_hash IS NOT NULL;

-- Sync queue indexes
CREATE INDEX idx_sync_queue_user_id ON sync_queue(user_id);
CREATE INDEX idx_sync_queue_status_priority ON sync_queue(status, priority DESC, sequence_number);
CREATE INDEX idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
CREATE INDEX idx_sync_queue_scheduled ON sync_queue(scheduled_at)
  WHERE status = 'pending';

-- Search history indexes
CREATE INDEX idx_search_history_user_id ON search_history(user_id, created_at DESC);
CREATE INDEX idx_search_history_query ON search_history(normalized_query);

-- Audit log indexes
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- API rate limits indexes
CREATE INDEX idx_api_rate_limits_user_endpoint ON api_rate_limits(user_id, endpoint, window_end);

-- ============================================================================
-- FULL-TEXT SEARCH INDEXES
-- ============================================================================

-- Full-text search for inventory items
ALTER TABLE inventory_items ADD COLUMN search_vector tsvector;

CREATE INDEX idx_inventory_items_search_vector ON inventory_items USING GIN(search_vector);

-- Trigram indexes for fuzzy matching
CREATE INDEX idx_inventory_items_title_trgm ON inventory_items USING GIN(title gin_trgm_ops);
CREATE INDEX idx_labels_name_trgm ON labels USING GIN(name gin_trgm_ops);
CREATE INDEX idx_tags_name_trgm ON tags USING GIN(name gin_trgm_ops);

-- JSONB indexes for metadata searching
CREATE INDEX idx_detection_results_metadata ON detection_results USING GIN(provider_metadata);
CREATE INDEX idx_image_metadata_exif ON image_metadata USING GIN(exif_data);
CREATE INDEX idx_user_preferences_prefs ON user_preferences USING GIN(preferences);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_labels_updated_at BEFORE UPDATE ON labels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update label usage count
CREATE OR REPLACE FUNCTION update_label_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE labels SET usage_count = usage_count + 1 WHERE id = NEW.label_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE labels SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = OLD.label_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_label_usage_on_item_label_change
AFTER INSERT OR DELETE ON item_labels
FOR EACH ROW EXECUTE FUNCTION update_label_usage_count();

-- Function to update tag usage count
CREATE OR REPLACE FUNCTION update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tags SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = OLD.tag_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tag_usage_on_item_tag_change
AFTER INSERT OR DELETE ON item_tags
FOR EACH ROW EXECUTE FUNCTION update_tag_usage_count();

-- Function to update location item count
CREATE OR REPLACE FUNCTION update_location_item_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.location_id IS NOT NULL THEN
    UPDATE locations SET item_count = item_count + 1 WHERE id = NEW.location_id;
  ELSIF TG_OP = 'DELETE' AND OLD.location_id IS NOT NULL THEN
    UPDATE locations SET item_count = GREATEST(item_count - 1, 0) WHERE id = OLD.location_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.location_id IS NOT NULL AND OLD.location_id != NEW.location_id THEN
      UPDATE locations SET item_count = GREATEST(item_count - 1, 0) WHERE id = OLD.location_id;
    END IF;
    IF NEW.location_id IS NOT NULL AND OLD.location_id != NEW.location_id THEN
      UPDATE locations SET item_count = item_count + 1 WHERE id = NEW.location_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_location_item_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON inventory_items
FOR EACH ROW EXECUTE FUNCTION update_location_item_count();

-- Function to update user statistics
CREATE OR REPLACE FUNCTION update_user_statistics()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET total_items = total_items + 1 WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET total_items = GREATEST(total_items - 1, 0) WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_statistics_trigger
AFTER INSERT OR DELETE ON inventory_items
FOR EACH ROW EXECUTE FUNCTION update_user_statistics();

-- Function to update full-text search vector
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

-- ============================================================================
-- PARTITIONING (for scalability)
-- ============================================================================

-- Partition audit_log by month (example)
-- Note: Requires PostgreSQL 10+
-- ALTER TABLE audit_log PARTITION BY RANGE (created_at);
-- CREATE TABLE audit_log_2024_01 PARTITION OF audit_log
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Items with their labels and tags
CREATE VIEW inventory_items_enriched AS
SELECT
  i.*,
  l.name AS primary_label_name,
  loc.name AS location_name,
  loc.path AS location_path,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'id', labels.id,
        'name', labels.name,
        'confidence', il.confidence_score,
        'source', il.source
      )
    ) FILTER (WHERE labels.id IS NOT NULL),
    '[]'::json
  ) AS all_labels,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'id', tags.id,
        'name', tags.name,
        'color', tags.color
      )
    ) FILTER (WHERE tags.id IS NOT NULL),
    '[]'::json
  ) AS all_tags
FROM inventory_items i
LEFT JOIN labels l ON i.primary_label_id = l.id
LEFT JOIN locations loc ON i.location_id = loc.id
LEFT JOIN item_labels il ON i.id = il.item_id
LEFT JOIN labels ON il.label_id = labels.id
LEFT JOIN item_tags it ON i.id = it.item_id
LEFT JOIN tags ON it.tag_id = tags.id
WHERE i.deleted_at IS NULL
GROUP BY i.id, l.name, loc.name, loc.path;

-- View: Detection session with results summary
CREATE VIEW detection_sessions_summary AS
SELECT
  ds.*,
  COUNT(DISTINCT dr.id) AS result_count,
  COUNT(DISTINCT dr.id) FILTER (WHERE dr.is_selected = TRUE) AS selected_count,
  json_agg(
    json_build_object(
      'provider', dr.provider,
      'label', dr.detected_label,
      'confidence', dr.confidence_score,
      'selected', dr.is_selected
    ) ORDER BY dr.confidence_score DESC
  ) AS results
FROM detection_sessions ds
LEFT JOIN detection_results dr ON ds.id = dr.detection_session_id
GROUP BY ds.id;

-- ============================================================================
-- MATERIALIZED VIEWS (for analytics)
-- ============================================================================

-- Materialized view: Label statistics
CREATE MATERIALIZED VIEW label_statistics AS
SELECT
  l.id,
  l.name,
  l.category,
  l.usage_count,
  COUNT(DISTINCT il.item_id) AS actual_item_count,
  AVG(il.confidence_score) AS avg_detection_confidence,
  COUNT(DISTINCT il.item_id) FILTER (WHERE il.source = 'ai_detected') AS ai_detected_count,
  COUNT(DISTINCT il.item_id) FILTER (WHERE il.source = 'user_added') AS user_added_count
FROM labels l
LEFT JOIN item_labels il ON l.id = il.label_id
GROUP BY l.id, l.name, l.category, l.usage_count;

CREATE UNIQUE INDEX ON label_statistics (id);

-- Refresh can be done periodically
-- REFRESH MATERIALIZED VIEW CONCURRENTLY label_statistics;

-- ============================================================================
-- ROW LEVEL SECURITY (Optional - for multi-tenant isolation)
-- ============================================================================

-- Enable RLS on user tables
-- ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Create policies
-- CREATE POLICY inventory_items_user_isolation ON inventory_items
--   USING (user_id = current_setting('app.current_user_id')::uuid);

-- ============================================================================
-- GRANTS (adjust based on your application roles)
-- ============================================================================

-- CREATE ROLE app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
