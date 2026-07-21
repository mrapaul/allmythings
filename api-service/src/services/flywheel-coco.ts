import { VALID_CATEGORIES } from './vlm-detector.parse';

/**
 * Pure transforms from flywheel JSONL records to a COCO detection dataset.
 * The export script does the file I/O; everything here is unit-testable.
 */

export interface FlywheelItem {
  label: string;
  description: string;
  category: string;
  tags: string[];
  box: { x: number; y: number; width: number; height: number };
}

export type FlywheelEvent =
  | { type: 'accept'; item: FlywheelItem }
  | { type: 'discard'; item: FlywheelItem }
  | { type: 'relabel'; item: FlywheelItem; newLabel: string; newTags: string[] }
  | { type: 'add_box'; item: FlywheelItem }
  | { type: 'photo_verdict'; verdict: string; userOverride: boolean };

export interface FlywheelRecord {
  photoSha256: string;
  receivedAt: string;
  events: FlywheelEvent[];
  [key: string]: unknown;
}

export interface ImageDims {
  width: number;
  height: number;
  fileName: string;
}

export interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number];
  area: number;
  iscrowd: 0;
  attributes: { label: string; tags: string[] };
}

export interface CocoDataset {
  images: Array<{ id: number; file_name: string; width: number; height: number }>;
  annotations: CocoAnnotation[];
  categories: Array<{ id: number; name: string }>;
}

/** The user may re-review a photo; only their latest verdict set counts. */
export function latestRecordPerPhoto(records: FlywheelRecord[]): FlywheelRecord[] {
  const byPhoto = new Map<string, FlywheelRecord>();
  for (const rec of records) {
    const prev = byPhoto.get(rec.photoSha256);
    if (!prev || rec.receivedAt > prev.receivedAt) byPhoto.set(rec.photoSha256, rec);
  }
  return [...byPhoto.values()];
}

/** Items the user kept (accept/relabel/add_box), with corrected labels applied. */
export function verifiedItems(record: FlywheelRecord): FlywheelItem[] {
  const out: FlywheelItem[] = [];
  for (const ev of record.events) {
    if (ev.type === 'accept' || ev.type === 'add_box') out.push(ev.item);
    else if (ev.type === 'relabel') {
      out.push({ ...ev.item, label: ev.newLabel, tags: ev.newTags });
    }
  }
  return out;
}

export function flywheelToCoco(
  records: FlywheelRecord[],
  dims: Map<string, ImageDims>,
): CocoDataset {
  const categories = VALID_CATEGORIES.map((name, i) => ({ id: i + 1, name }));
  const categoryId = (name: string): number => {
    const idx = VALID_CATEGORIES.findIndex((c) => c.toLowerCase() === name.toLowerCase());
    return idx >= 0 ? idx + 1 : categories.length; // last entry is 'Other'
  };

  const images: CocoDataset['images'] = [];
  const annotations: CocoAnnotation[] = [];
  let imageId = 0;
  let annId = 0;

  for (const rec of latestRecordPerPhoto(records)) {
    const d = dims.get(rec.photoSha256);
    if (!d) continue;
    imageId += 1;
    images.push({ id: imageId, file_name: d.fileName, width: d.width, height: d.height });
    for (const item of verifiedItems(rec)) {
      annId += 1;
      const x = item.box.x * d.width;
      const y = item.box.y * d.height;
      const w = item.box.width * d.width;
      const h = item.box.height * d.height;
      annotations.push({
        id: annId,
        image_id: imageId,
        category_id: categoryId(item.category),
        bbox: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)],
        area: Math.round(w) * Math.round(h),
        iscrowd: 0,
        attributes: { label: item.label, tags: item.tags },
      });
    }
  }
  return { images, annotations, categories };
}
