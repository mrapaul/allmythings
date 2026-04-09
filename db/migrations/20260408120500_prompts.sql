-- migrate:up
CREATE TABLE prompts_catalog (
  id           bigserial PRIMARY KEY,
  prompt_name  text NOT NULL,
  version      int NOT NULL,
  body         text NOT NULL,
  status       text NOT NULL CHECK (status IN ('candidate','testing','active','archived')),
  traffic_pct  int NOT NULL DEFAULT 0,
  metrics      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_name, version)
);
CREATE INDEX ON prompts_catalog (prompt_name, status);

-- migrate:down
DROP TABLE prompts_catalog;
