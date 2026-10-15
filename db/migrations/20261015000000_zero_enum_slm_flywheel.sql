-- migrate:up
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS slm_adapter_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_stage TEXT NOT NULL CHECK (model_stage IN ('localizer', 'vision_extractor', 'taxonomy_icon')),
    adapter_name TEXT NOT NULL UNIQUE,
    adapter_path TEXT NOT NULL,
    training_samples_count INTEGER NOT NULL,
    val_loss REAL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slm_training_samples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL,
    crop_storage_path TEXT NOT NULL,
    visual_embedding vector(768) NOT NULL,
    rejected_output JSONB NOT NULL,
    chosen_output JSONB NOT NULL,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    used_in_adapter_id UUID REFERENCES slm_adapter_versions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_samples_embedding 
ON slm_training_samples USING hnsw (visual_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_training_samples_unused 
ON slm_training_samples (created_at ASC) 
WHERE used_in_adapter_id IS NULL;

-- migrate:down
DROP TABLE IF EXISTS slm_training_samples;
DROP TABLE IF EXISTS slm_adapter_versions;
