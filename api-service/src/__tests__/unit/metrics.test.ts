import { describe, it, expect } from 'vitest';
import {
  registry,
  workflowStartedTotal,
  enrichmentTierUsedTotal,
  providerUp,
  timed,
} from '../../telemetry/metrics';

describe('metrics registry', () => {
  it('registers all expected metric names', async () => {
    const text = await registry.metrics();
    for (const name of [
      'workflow_started_total',
      'workflow_completed_total',
      'workflow_duration_ms',
      'activity_duration_ms',
      'activity_retries_total',
      'activity_nonretryable_failures_total',
      'enrichment_tier_used_total',
      'enrichment_tier_downgrades_total',
      'provider_up',
      'provider_probe_duration_ms',
      'workflow_idempotent_reuse_total',
      'queue_rejections_total',
      'items_per_photo',
      'http_requests_total',
      'http_request_duration_ms',
    ]) {
      expect(text).toContain(name);
    }
  });

  it('counter increments', async () => {
    workflowStartedTotal.labels('detectInventoryWorkflow').inc();
    const text = await registry.metrics();
    expect(text).toMatch(/workflow_started_total\{[^}]*workflow="detectInventoryWorkflow"[^}]*\}\s*[1-9]\d*/);
  });

  it('tier counter labels work', async () => {
    enrichmentTierUsedTotal.labels('qwen7b').inc();
    enrichmentTierUsedTotal.labels('qwen3b').inc();
    const text = await registry.metrics();
    expect(text).toContain('enrichment_tier_used_total');
    expect(text).toMatch(/enrichment_tier_used_total\{[^}]*tier="qwen7b"[^}]*\}/);
  });

  it('gauge set works', async () => {
    providerUp.labels('florence').set(1);
    providerUp.labels('ollama').set(0);
    const text = await registry.metrics();
    expect(text).toMatch(/provider_up\{[^}]*provider="florence"[^}]*\}\s*1/);
    expect(text).toMatch(/provider_up\{[^}]*provider="ollama"[^}]*\}\s*0/);
  });

  it('timed() records duration and rethrows on error', async () => {
    await expect(timed('testActivity', 1, async () => { throw Object.assign(new Error('boom'), { nonRetryable: true, type: 'TestType' }); })).rejects.toThrow('boom');
    const text = await registry.metrics();
    expect(text).toContain('activity_duration_ms_bucket');
    expect(text).toMatch(/activity_nonretryable_failures_total\{[^}]*activity="testActivity"[^}]*type="TestType"[^}]*\}/);
  });

  it('timed() records success duration', async () => {
    const result = await timed('okActivity', 1, async () => 42);
    expect(result).toBe(42);
    const text = await registry.metrics();
    expect(text).toMatch(/activity_duration_ms_count\{[^}]*activity="okActivity"[^}]*status="ok"[^}]*\}/);
  });
});
