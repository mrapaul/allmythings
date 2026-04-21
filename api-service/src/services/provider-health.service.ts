import { logger } from '../utils/logger';

export type ProviderStatus = 'unknown' | 'up' | 'down';

export interface ProviderState {
  status: ProviderStatus;
  lastProbeMs: number;
  lastLatencyMs: number;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface HealthSnapshot {
  florence: ProviderState;
  ollama: ProviderState;
  temporal: ProviderState;
}

export interface ProviderHealthConfig {
  florenceUrl: string;
  ollamaUrl: string;
  temporalHost: string;
  intervalMs?: number;
  probeTimeoutMs?: number;
}

/**
 * Periodic health probes for downstream dependencies consumed by
 * `/v1/health`. Runs as a simple in-process timer; independent of
 * Temporal so it can report honest status even when Temporal itself
 * is unreachable. State is cached; callers read `snapshot()`
 * synchronously.
 */
export class ProviderHealthService {
  private state: HealthSnapshot;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly cfg: ProviderHealthConfig) {
    const empty: ProviderState = {
      status: 'unknown',
      lastProbeMs: 0,
      lastLatencyMs: 0,
      consecutiveFailures: 0,
      lastError: null,
    };
    this.state = {
      florence: { ...empty },
      ollama: { ...empty },
      temporal: { ...empty },
    };
  }

  start(): void {
    if (this.timer) return;
    const interval = this.cfg.intervalMs ?? 10_000;
    this.timer = setInterval(() => {
      void this.probeOnce();
    }, interval);
    void this.probeOnce();
    logger.info({ intervalMs: interval }, 'ProviderHealthService started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot(): HealthSnapshot {
    return {
      florence: { ...this.state.florence },
      ollama: { ...this.state.ollama },
      temporal: { ...this.state.temporal },
    };
  }

  async probeOnce(): Promise<void> {
    await Promise.all([
      this.probeHttp('florence', `${this.cfg.florenceUrl}/`),
      this.probeHttp('ollama', `${this.cfg.ollamaUrl}/api/tags`),
      this.probeTemporal(),
    ]);
  }

  private async probeHttp(name: 'florence' | 'ollama', url: string): Promise<void> {
    const start = Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.cfg.probeTimeoutMs ?? 3000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      this.record(name, 'up', Date.now() - start, null);
    } catch (err) {
      this.record(name, 'down', Date.now() - start, (err as Error).message);
    }
  }

  private async probeTemporal(): Promise<void> {
    const start = Date.now();
    try {
      const [host, port] = this.cfg.temporalHost.split(':');
      const { Socket } = await import('node:net');
      await new Promise<void>((resolve, reject) => {
        const s = new Socket();
        const t = setTimeout(() => {
          s.destroy();
          reject(new Error('timeout'));
        }, this.cfg.probeTimeoutMs ?? 3000);
        s.connect(Number(port || 7233), host, () => {
          clearTimeout(t);
          s.end();
          resolve();
        });
        s.on('error', (e) => {
          clearTimeout(t);
          reject(e);
        });
      });
      this.record('temporal', 'up', Date.now() - start, null);
    } catch (err) {
      this.record('temporal', 'down', Date.now() - start, (err as Error).message);
    }
  }

  private record(
    name: keyof HealthSnapshot,
    status: ProviderStatus,
    latencyMs: number,
    err: string | null,
  ): void {
    const prev = this.state[name];
    this.state[name] = {
      status,
      lastProbeMs: Date.now(),
      lastLatencyMs: latencyMs,
      consecutiveFailures: status === 'up' ? 0 : prev.consecutiveFailures + 1,
      lastError: err,
    };
  }
}
