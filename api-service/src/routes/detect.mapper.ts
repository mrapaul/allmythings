import type { PipelineDetection, SceneObservation } from '../types/pipeline';
import type { DetectedItem } from '../types/detected-item';

const DESCRIPTION_KEYS = ['description', 'desc', 'caption'];
const CATEGORY_KEYS = ['category', 'cat', 'class'];
const TAG_PRIORITY = [
  'color',
  'material',
  'style',
  'room',
  'subcategory',
  'condition',
  'size',
  'brand',
];
const NON_TAG_KEYS = new Set([...DESCRIPTION_KEYS, ...CATEGORY_KEYS]);
const MAX_TAGS = 8;

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

export function mapPipelineDetectionToItem(d: PipelineDetection): DetectedItem {
  const attrs = d.vlmStructuredAttributes ?? {};
  const description = pickString(attrs, DESCRIPTION_KEYS) ?? '';
  const category = pickString(attrs, CATEGORY_KEYS) ?? 'Unknown';

  const tags: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown): void => {
    if (typeof v !== 'string') return;
    const trimmed = v.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    tags.push(trimmed);
  };
  for (const k of TAG_PRIORITY) {
    if (k in attrs && !NON_TAG_KEYS.has(k)) push(attrs[k]);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (NON_TAG_KEYS.has(k)) continue;
    if (TAG_PRIORITY.includes(k)) continue;
    push(v);
  }

  return {
    label: d.primaryLabel,
    description,
    category,
    tags: tags.slice(0, MAX_TAGS),
    box: {
      x: d.bbox.x,
      y: d.bbox.y,
      width: d.bbox.width,
      height: d.bbox.height,
    },
  };
}

export function mapSceneToItems(scene: SceneObservation): DetectedItem[] {
  return scene.detections.map(mapPipelineDetectionToItem);
}
