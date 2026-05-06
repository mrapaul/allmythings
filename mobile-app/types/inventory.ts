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

export interface InventoryItem {
  id: string;
  homeId: string;
  label: string;
  description: string;
  category: string;
  tags: string[];
  primaryPhotoUri: string;
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
