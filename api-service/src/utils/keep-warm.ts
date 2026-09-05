import { logger } from './logger';

/**
 * Re-issue model warm-ups on a timer so a resident model survives quiet
 * stretches. Ollama's keep_alive is renewed per request; an idle gap longer
 * than it (overnight, a long review session) evicts the 20 GB detector and
 * the next photo pays a ~2 min reload. Other Ollama clients on the same Mac
 * can evict it sooner still. The timer is unref'd so it never holds the
 * process open on shutdown.
 */
export function keepModelsWarm(
  warmers: ReadonlyArray<() => void>,
  intervalMs: number,
): () => void {
  const runAll = (): void => {
    for (const warm of warmers) warm();
  };
  runAll();
  if (!(intervalMs > 0)) return () => undefined;
  const timer = setInterval(() => {
    logger.debug({ intervalMs }, 'model_rewarm_tick');
    runAll();
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
