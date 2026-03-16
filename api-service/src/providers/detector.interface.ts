export interface BoundingBoxResult {
  box: { x: number; y: number; width: number; height: number };
  coarseLabel: string;
  confidence: number;
}

export interface ObjectDetector {
  readonly name: string;
  detect(image: Buffer, prompt?: string): Promise<BoundingBoxResult[]>;
  healthCheck(): Promise<boolean>;
}
