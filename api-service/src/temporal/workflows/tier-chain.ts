import { EnrichmentTier } from '../shared-types';

export interface TierSpec {
  name: EnrichmentTier;
  model: string | null;
  timeoutSeconds: number;
  retries: number;
}

export function buildTierChain(env: {
  tier1Model: string;
  tier2Model: string;
  tier3Model: string;
}): TierSpec[] {
  return [
    { name: 'qwen7b', model: env.tier1Model, timeoutSeconds: 20, retries: 1 },
    { name: 'qwen3b', model: env.tier2Model, timeoutSeconds: 12, retries: 1 },
    { name: 'moondream', model: env.tier3Model, timeoutSeconds: 8, retries: 0 },
    { name: 'florence-only', model: null, timeoutSeconds: 5, retries: 0 },
  ];
}
