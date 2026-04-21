import {
  proxyActivities,
  defineSignal,
  ApplicationFailure,
  log,
} from '@temporalio/workflow';
import type * as activities from '../activities';
import {
  DetectInput,
  DetectResult,
  EnrichedItem,
  FlorenceDetection,
  PipelineError,
  SavedPhoto,
} from '../shared-types';

interface TierSpec {
  name: 'qwen7b' | 'qwen3b' | 'moondream' | 'florence-only';
  model: string | null;
  timeoutSec: number;
  retries: number;
}

// Hardcoded here because workflow code cannot import runtime env config safely.
// Env-overridable values are threaded through activities via arguments.
const TIER_CHAIN: TierSpec[] = [
  { name: 'qwen7b', model: 'qwen2.5vl:7b', timeoutSec: 20, retries: 1 },
  { name: 'qwen3b', model: 'qwen2.5vl:3b', timeoutSec: 12, retries: 1 },
  { name: 'moondream', model: 'moondream', timeoutSec: 8, retries: 0 },
  { name: 'florence-only', model: null, timeoutSec: 5, retries: 0 },
];

const ENRICHMENT_BUDGET_MS = 45_000;

// Activities — proxied with per-activity retry + timeout policies.
const { savePhoto, florenceDetect, assembleResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 3,
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['UnsupportedMediaType', 'FlorenceBadRequestError'],
  },
});

// Per-tier activity proxies with distinct timeouts and retry policies
const tierProxies: Record<string, typeof activities.enrichItem> = {};
for (const tier of TIER_CHAIN) {
  tierProxies[tier.name] = proxyActivities<typeof activities>({
    startToCloseTimeout: `${tier.timeoutSec} seconds`,
    heartbeatTimeout: '10 seconds',
    retry: {
      initialInterval: '1s',
      backoffCoefficient: 2,
      maximumAttempts: tier.retries + 1,
      nonRetryableErrorTypes: [
        'InvalidTierConfig',
        'OllamaJsonParseError',
        'OllamaBadRequestError',
      ],
    },
  }).enrichItem;
}

export const cancelWorkflowSignal = defineSignal('cancel-workflow');

export async function detectInventoryWorkflow(input: DetectInput): Promise<DetectResult> {
  const startedAtMs = Date.now();
  const errors: PipelineError[] = [];

  log.info('pipeline.start', { traceId: input.traceId, sha: input.imageSha256 });

  // 1. Save photo (non-negotiable; no retry, fail whole workflow on error)
  let saved: SavedPhoto;
  try {
    saved = await savePhoto(input);
  } catch (err) {
    log.error('save-photo failed — failing whole workflow', { err: String(err) });
    throw err;
  }

  // 2. Florence detect (retry policy in proxy handles transient failures)
  let detection: FlorenceDetection;
  try {
    detection = await florenceDetect(input);
  } catch (err) {
    errors.push({
      step: 'florence-detect',
      code: 'detector_exhausted',
      message: String(err),
      retryable: false,
    });
    return assembleResult({
      saved,
      items: [],
      errors,
      traceId: input.traceId,
      startedAtMs,
    });
  }

  // 3. Enrich items with tier chain
  const items = await enrichItemsWithTierChain(input, detection, startedAtMs, errors);

  // 4. Assemble
  return assembleResult({
    saved,
    items,
    errors,
    traceId: input.traceId,
    startedAtMs,
  });
}

async function enrichItemsWithTierChain(
  input: DetectInput,
  detection: FlorenceDetection,
  startedAtMs: number,
  errors: PipelineError[],
): Promise<EnrichedItem[]> {
  const items: EnrichedItem[] = [];
  const budgetEndMs = startedAtMs + ENRICHMENT_BUDGET_MS;

  for (const region of detection.regions) {
    let enriched: EnrichedItem | null = null;
    for (const tier of TIER_CHAIN) {
      const remaining = budgetEndMs - Date.now();
      if (remaining <= 0 && tier.name !== 'florence-only') continue;

      try {
        enriched = await tierProxies[tier.name]({
          imageBase64: input.imageBase64,
          region,
          tier: tier.name,
          model: tier.model,
        });
        if (tier.name !== 'qwen7b') {
          log.info('tier downgraded', {
            regionIndex: region.regionIndex,
            finalTier: tier.name,
          });
        }
        break;
      } catch (err) {
        if (err instanceof ApplicationFailure && err.nonRetryable) {
          errors.push({
            step: `enrich-${tier.name}`,
            code: 'nonretryable',
            message: String(err),
            retryable: false,
          });
          continue;
        }
        errors.push({
          step: `enrich-${tier.name}`,
          code: 'exhausted_retries',
          message: String(err),
          retryable: true,
        });
        continue;
      }
    }
    if (!enriched) {
      log.error('no tier produced a result', { regionIndex: region.regionIndex });
      errors.push({
        step: 'enrich-items',
        code: 'tier_exhausted',
        message: 'All tiers failed including florence-only',
        retryable: false,
      });
      continue;
    }
    items.push(enriched);
  }

  return items;
}
