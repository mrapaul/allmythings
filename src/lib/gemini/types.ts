export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedObject {
  name: string;
  confidence: number;
  boundingBox: BoundingBox;
  category?: string;
}

export interface SpatialAnalysisResult {
  objects: DetectedObject[];
  relationships?: string[];
  sceneDescription?: string;
}