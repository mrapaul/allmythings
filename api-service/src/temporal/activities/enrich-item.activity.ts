import { randomUUID } from 'node:crypto';
import { ApplicationFailure } from '@temporalio/activity';
import { propagation, context } from '@opentelemetry/api';
import { EnrichedItem, EnrichmentTier, FlorenceRegion } from '../shared-types';
import { envConfig } from '../../config/env.config';
import { timed, enrichmentTierUsedTotal } from '../../telemetry/metrics';

export interface EnrichItemInput {
  imageBase64: string;
  region: FlorenceRegion;
  tier: EnrichmentTier;
  model: string | null; // null for tier 'florence-only'
}

const PROMPT = `You are an expert appraiser identifying a single household item in a photo.
Return ONLY a single JSON object with these fields (no markdown, no prose):
{
 "name": "short specific name, e.g. 'Brass desk lamp'",
 "category": "short category, e.g. 'lighting'",
 "color": "dominant color(s)",
 "material": "primary material",
 "condition": "poor|fair|good|excellent",
 "estimated_value": "price range in EUR like '40-60 EUR' or null",
 "description": "one-sentence description",
 "search_tags": ["tag1", "tag2", "..."]
}
The item in question is labeled by a vision detector as: "{CAPTION}"`;

export async function enrichItem(input: EnrichItemInput): Promise<EnrichedItem> {
  return timed('enrichItem', 1, async () => {
    if (input.tier === 'florence-only') {
      const result = buildFlorenceOnly(input.region);
      enrichmentTierUsedTotal.labels(input.tier).inc();
      return result;
    }

    if (!input.model) {
      throw ApplicationFailure.create({
        message: 'Model is required for non-florence-only tier',
        type: 'InvalidTierConfig',
        nonRetryable: true,
      });
    }

    const prompt = PROMPT.replace('{CAPTION}', input.region.caption);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    propagation.inject(context.active(), headers);

    const res = await fetch(`${envConfig.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: input.model,
        prompt,
        images: [input.imageBase64],
        stream: false,
        options: { num_ctx: 4096, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(tierTimeoutMs(input.tier)),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      const retryable = res.status >= 500;
      throw ApplicationFailure.create({
        message: `Ollama ${input.model} returned ${res.status}: ${body.slice(0, 200)}`,
        type: retryable ? 'OllamaTransientError' : 'OllamaBadRequestError',
        nonRetryable: !retryable,
      });
    }

    const data = (await res.json()) as { response?: string };
    const raw = data.response ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      throw ApplicationFailure.create({
        message: `Ollama response was not valid JSON: ${raw.slice(0, 200)}`,
        type: 'OllamaJsonParseError',
        nonRetryable: true, // parsing is deterministic — retry won't help
      });
    }

    const enriched = buildEnrichedItem(input.region, input.tier, parsed as Record<string, unknown>);
    enrichmentTierUsedTotal.labels(input.tier).inc();
    return enriched;
  });
}

function tierTimeoutMs(tier: EnrichmentTier): number {
  switch (tier) {
    case 'qwen7b': return 20_000;
    case 'qwen3b': return 12_000;
    case 'moondream': return 8_000;
    default: return 5_000;
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function buildEnrichedItem(region: FlorenceRegion, tier: EnrichmentTier, parsed: Record<string, unknown>): EnrichedItem {
  const s = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') as string[] : []);
  const name = s(parsed.name) ?? region.caption;
  const category = s(parsed.category) ?? 'household item';
  const color = s(parsed.color);
  const material = s(parsed.material);
  const tags = [...new Set([
    ...arr(parsed.search_tags),
    name, category, color, material,
  ].filter((x): x is string => Boolean(x)).map((t) => t.toLowerCase()))];

  return {
    id: randomUUID(),
    regionIndex: region.regionIndex,
    label: name,
    confidence: 0.9,
    bbox: { x: region.x, y: region.y, width: region.width, height: region.height },
    enrichmentTier: tier,
    attributes: {
      name,
      category,
      color,
      material,
      condition: s(parsed.condition),
      estimatedValue: s(parsed.estimated_value),
      description: s(parsed.description) ?? `${name} detected in the scene`,
      searchTags: tags,
    },
  };
}

function buildFlorenceOnly(region: FlorenceRegion): EnrichedItem {
  const name = region.caption || 'unidentified item';
  return {
    id: randomUUID(),
    regionIndex: region.regionIndex,
    label: name,
    confidence: 0.5,
    bbox: { x: region.x, y: region.y, width: region.width, height: region.height },
    enrichmentTier: 'florence-only',
    attributes: {
      name,
      category: 'household item',
      color: null,
      material: null,
      condition: null,
      estimatedValue: null,
      description: `${name} detected in the scene`,
      searchTags: [name.toLowerCase()],
    },
  };
}
