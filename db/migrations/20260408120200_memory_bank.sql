-- migrate:up
CREATE TABLE memory_bank (
  id                 bigserial PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  embedding          vector(768) NOT NULL,
  embedding_hash     bytea NOT NULL,
  item_label         text NOT NULL,
  category_canonical text,
  category_raw       text,
  attributes         jsonb NOT NULL DEFAULT '{}',
  status             text NOT NULL CHECK (status IN ('candidate','confirmed','archived')),
  seen_count         int NOT NULL DEFAULT 1,
  confirm_count      int NOT NULL DEFAULT 0,
  reject_count       int NOT NULL DEFAULT 0,
  first_seen         timestamptz NOT NULL DEFAULT now(),
  last_seen          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  source_event_id    uuid,
  UNIQUE (tenant_id, embedding_hash)
);
CREATE INDEX memory_bank_hnsw ON memory_bank
  USING hnsw (embedding vector_cosine_ops)
  WHERE status IN ('candidate','confirmed');
CREATE INDEX ON memory_bank (tenant_id, status);
CREATE INDEX ON memory_bank (expires_at) WHERE status = 'candidate';

-- migrate:down
DROP TABLE memory_bank;
