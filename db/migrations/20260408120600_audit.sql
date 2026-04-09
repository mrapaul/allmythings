-- migrate:up
CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,
  tenant_id     uuid,
  payload       jsonb,
  completed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (kind, completed_at DESC);
CREATE INDEX ON audit_log (tenant_id) WHERE tenant_id IS NOT NULL;

-- migrate:down
DROP TABLE audit_log;
