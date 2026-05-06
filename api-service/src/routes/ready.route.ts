import { FastifyInstance } from 'fastify';
import { envConfig } from '../config/env.config';
import type { ProviderHealthService } from '../services/provider-health.service';

/**
 * Readiness probe (Kubernetes-style): returns 200 only when the service
 * has all hard dependencies wired and reachable. Differs from
 * `/v1/health` (which reports an aggregate snapshot) by failing FAST
 * with the specific reason in the body — for routing decisions and
 * deployment gates.
 */
export async function readyRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const health = (app as any).health as ProviderHealthService | undefined;

  app.get('/v1/ready', async (_request, reply) => {
    const reasons: string[] = [];

    // Pipeline reachability — primary load-bearing check.
    let pipelineReachable = false;
    try {
      const r = await fetch(`${envConfig.pipelineUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      pipelineReachable = r.ok;
      if (!pipelineReachable) reasons.push(`pipeline_status_${r.status}`);
    } catch (e) {
      reasons.push(`pipeline_unreachable: ${(e as Error).message}`);
    }

    // Provider health snapshot, if wired.
    let snapshot;
    if (health) {
      snapshot = health.snapshot();
      if (snapshot.florence.status === 'down') reasons.push('florence_down');
    }

    const ready = reasons.length === 0;
    return reply.code(ready ? 200 : 503).send({
      ready,
      checks: {
        pipeline: pipelineReachable,
        providers: snapshot ?? null,
      },
      reasons,
      timestamp: new Date().toISOString(),
    });
  });
}
