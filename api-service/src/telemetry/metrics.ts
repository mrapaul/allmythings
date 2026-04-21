import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'api-service' });
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total', help: 'HTTP requests',
  labelNames: ['route', 'status'], registers: [registry],
});

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms', help: 'HTTP duration',
  labelNames: ['route', 'status'],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 45000, 90000],
  registers: [registry],
});

export const workflowStartedTotal = new Counter({
  name: 'workflow_started_total', help: 'Workflow starts',
  labelNames: ['workflow'], registers: [registry],
});

export const workflowCompletedTotal = new Counter({
  name: 'workflow_completed_total', help: 'Workflow completions',
  labelNames: ['workflow', 'status'], registers: [registry],
});

export const workflowDurationMs = new Histogram({
  name: 'workflow_duration_ms', help: 'Workflow duration',
  labelNames: ['workflow', 'status'],
  buckets: [500, 1000, 2500, 5000, 10000, 15000, 25000, 45000, 90000, 120000],
  registers: [registry],
});

export const activityDurationMs = new Histogram({
  name: 'activity_duration_ms', help: 'Activity duration',
  labelNames: ['activity', 'status', 'attempt'],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000, 45000, 90000],
  registers: [registry],
});

export const activityRetriesTotal = new Counter({
  name: 'activity_retries_total', help: 'Activity retries',
  labelNames: ['activity'], registers: [registry],
});

export const activityNonRetryableFailuresTotal = new Counter({
  name: 'activity_nonretryable_failures_total', help: 'Non-retryable failures',
  labelNames: ['activity', 'type'], registers: [registry],
});

export const enrichmentTierUsedTotal = new Counter({
  name: 'enrichment_tier_used_total', help: 'Tier usage counts',
  labelNames: ['tier'], registers: [registry],
});

export const enrichmentTierDowngradesTotal = new Counter({
  name: 'enrichment_tier_downgrades_total', help: 'Tier downgrades',
  labelNames: ['from_tier', 'to_tier', 'reason'], registers: [registry],
});

export const providerUp = new Gauge({
  name: 'provider_up', help: 'Provider up (1) / down (0)',
  labelNames: ['provider'], registers: [registry],
});

export const providerProbeDurationMs = new Histogram({
  name: 'provider_probe_duration_ms', help: 'Provider probe latency',
  labelNames: ['provider'], buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 3000],
  registers: [registry],
});

export const workflowIdempotentReuseTotal = new Counter({
  name: 'workflow_idempotent_reuse_total', help: 'Idempotent workflow reuses',
  registers: [registry],
});

export const queueRejectionsTotal = new Counter({
  name: 'queue_rejections_total', help: 'Queue rejections',
  labelNames: ['reason'], registers: [registry],
});

export const itemsPerPhoto = new Histogram({
  name: 'items_per_photo', help: 'Items returned per detection',
  buckets: [0, 1, 2, 5, 10, 15, 20, 30, 50], registers: [registry],
});

/** Helper: time an async activity and emit activity_duration_ms + nonretryable counter */
export async function timed<T>(activity: string, attempt: number, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    activityDurationMs.labels(activity, 'ok', String(attempt)).observe(Date.now() - start);
    return result;
  } catch (err) {
    activityDurationMs.labels(activity, 'error', String(attempt)).observe(Date.now() - start);
    const anyErr = err as { nonRetryable?: boolean; type?: string };
    if (anyErr?.nonRetryable) {
      activityNonRetryableFailuresTotal.labels(activity, anyErr.type ?? 'unknown').inc();
    }
    throw err;
  }
}
