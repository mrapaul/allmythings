export interface DetectedItem {
  label: string;
  description: string;
  category: string;
  tags: string[];
  box: { x: number; y: number; width: number; height: number };
}
