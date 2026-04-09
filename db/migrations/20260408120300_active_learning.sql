-- migrate:up
CREATE TABLE active_learning_queue (
  id                  bigserial PRIMARY KEY,
  detection_id        uuid REFERENCES detections(id) ON DELETE CASCADE,
  image_id            uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reason              text NOT NULL,
  priority            int NOT NULL,
  uncertainty_score   real,
  created_at          timestamptz NOT NULL DEFAULT now(),
  label_studio_task_id bigint,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','exported','labeled','discarded'))
);
CREATE INDEX ON active_learning_queue (status, priority DESC);

-- migrate:down
DROP TABLE active_learning_queue;
