export interface Home {
  id: string;
  name: string;
  icon: string; // emoji
  createdAt: number; // epoch ms
}

export interface Profile {
  name: string;
  initials: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

import type { ItemAttributes } from '@/lib/attributes';
import type { ItemLabel } from '@/lib/labels';

export interface InventoryItem {
  id: string;
  homeId: string;
  label: string;
  description: string;
  category: string;
  tags: string[];
  primaryPhotoUri: string;
  /** Pre-rendered item crop for tiles; null/absent falls back to bbox-zoom. */
  thumbnailUri?: string | null;
  /** Detected characteristics; null/absent → render-time derivation. */
  attributes?: ItemAttributes | null;
  /** Label-first chips; null/absent → derived from legacy columns. */
  labels?: ItemLabel[] | null;
  /** Free-text whereabouts ('hallway closet — top shelf'); null → not set. */
  location?: string | null;
  additionalPhotoUris: string[];
  notes: string;
  box: BoundingBox;
  createdAt: number;
  updatedAt: number;
}

export interface DetectedItem {
  label: string;
  description: string;
  category: string;
  tags: string[];
  box: BoundingBox;
}
