/**
 * Process-local admission gate for expensive detector runs.
 *
 * The legacy pipeline path had QueueFullError/Retry-After backpressure; the
 * VLM path accepted unlimited concurrent runs. Each run fires up to 7 serial
 * model calls against a single Ollama instance that serializes them anyway —
 * two phones shooting at once doubled everyone's latency and pinned the GPU
 * interleaved. This gate caps how many runs consume the detector at once.
 *
 * Two admission styles:
 *  - tryAcquire(): non-blocking; callers reject fast (sync HTTP path → 503 +
 *    Retry-After, mirroring the pipeline path's queue_full contract).
 *  - acquire(): waits in a FIFO queue capped at maxQueue; false means the
 *    caller should fail fast rather than queue (async run store → failed run
 *    with a server_busy error the app can retry).
 */
export class DetectGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueue: number,
  ) {}

  /** Non-blocking. Returns true when a slot was taken (caller must release()). */
  tryAcquire(): boolean {
    if (this.active >= this.maxConcurrent) return false;
    this.active += 1;
    return true;
  }

  /**
   * Blocking, queue-capped. Resumed waiters take over the released slot, so a
   * true return always means a slot is held (caller must release()).
   */
  async acquire(): Promise<boolean> {
    if (this.tryAcquire()) return true;
    if (this.waiters.length >= this.maxQueue) return false;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return true;
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Slot transfers to the waiter; active count is unchanged.
      next();
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  get running(): number {
    return this.active;
  }

  get pending(): number {
    return this.waiters.length;
  }
}
