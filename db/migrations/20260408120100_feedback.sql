-- migrate:up
CREATE TABLE feedback_events (
  id                   bigserial PRIMARY KEY,
  event_id             uuid NOT NULL UNIQUE,
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id              uuid REFERENCES users(id) ON DELETE SET NULL,
  image_id             uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  detection_id         uuid REFERENCES detections(id) ON DELETE CASCADE,
  event_type           text NOT NULL CHECK (event_type IN (
    'confirm','reject','relabel','attribute_edit','add_missing',
    'category_rename','merge','split','gatekeeper_appeal'
  )),
  payload              jsonb NOT NULL,
  model_version        text NOT NULL,
  prompt_version       text NOT NULL,
  trace_id             text,
  processed_by         text[] NOT NULL DEFAULT '{}',
  used_in_training_run uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON feedback_events (tenant_id, created_at DESC);
CREATE INDEX ON feedback_events (event_type, created_at DESC)
  WHERE used_in_training_run IS NULL;

-- migrate:down
DROP TABLE feedback_events;
