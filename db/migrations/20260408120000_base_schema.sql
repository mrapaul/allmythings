-- migrate:up
CREATE TABLE tenants (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  contribute_to_training boolean NOT NULL DEFAULT true
);

CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email        text UNIQUE NOT NULL,
  role         text NOT NULL DEFAULT 'user' CHECK (role IN ('user','reviewer','admin')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON users (tenant_id);

CREATE TABLE images (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  s3_key          text NOT NULL,
  phash           bytea NOT NULL,
  width           int NOT NULL,
  height          int NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  golden_set_consent boolean NOT NULL DEFAULT false
);
CREATE INDEX ON images (tenant_id, created_at DESC);
CREATE INDEX ON images (phash);

CREATE TABLE jobs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  image_id        uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('queued','fast_running','fast_done','deep_running','deep_done','failed')),
  enrichment_state text NOT NULL DEFAULT 'pending' CHECK (enrichment_state IN ('pending','fast','deep','enriched','failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  fast_completed_at  timestamptz,
  deep_completed_at  timestamptz,
  error_message   text
);
CREATE INDEX ON jobs (tenant_id, created_at DESC);
CREATE INDEX ON jobs (status) WHERE status != 'deep_done';

CREATE TABLE detections (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id              uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL,
  label               text NOT NULL,
  category_canonical  text,
  category_raw        text,
  bbox_x              real NOT NULL,
  bbox_y              real NOT NULL,
  bbox_w              real NOT NULL,
  bbox_h              real NOT NULL,
  confidence          real NOT NULL,
  enrichment_state    text NOT NULL DEFAULT 'fast',
  sources             text[] NOT NULL DEFAULT '{}',
  candidate_labels    text[] NOT NULL DEFAULT '{}',
  disagreement_flag   boolean NOT NULL DEFAULT false,
  attributes          jsonb NOT NULL DEFAULT '{}',
  model_version       text,
  prompt_version      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON detections (job_id);
CREATE INDEX ON detections (tenant_id);

-- migrate:down
DROP TABLE detections;
DROP TABLE jobs;
DROP TABLE images;
DROP TABLE users;
DROP TABLE tenants;
