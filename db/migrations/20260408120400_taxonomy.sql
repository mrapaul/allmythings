-- migrate:up
CREATE TABLE taxonomy_category (
  id             bigserial PRIMARY KEY,
  canonical_name text NOT NULL,
  embedding      vector(768),
  cluster_id     int,
  usage_count    int NOT NULL DEFAULT 0,
  last_updated   timestamptz NOT NULL DEFAULT now(),
  tenant_id      uuid REFERENCES tenants(id) ON DELETE CASCADE,
  aliases        text[] NOT NULL DEFAULT '{}',
  status         text NOT NULL CHECK (status IN ('candidate','active','merged','archived'))
);
CREATE INDEX ON taxonomy_category (tenant_id, status);

-- migrate:down
DROP TABLE taxonomy_category;
