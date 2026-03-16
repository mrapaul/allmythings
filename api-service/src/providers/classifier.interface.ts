import { BoundingBoxResult } from './detector.interface';

export interface ClassifiedObject {
  boxIndex: number;
  label: string;
  category: string;
  brand: string | null;
  model: string | null;
  colors: string[];
  materials: string[];
  condition: string | null;
  estimatedValue: { low: number; high: number } | null;
  description: string | null;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface ObjectClassifier {
  readonly name: string;
  classify(image: Buffer, detections: BoundingBoxResult[]): Promise<ClassifiedObject[]>;
  generateDetectionPrompt(image: Buffer): Promise<string>;
  healthCheck(): Promise<boolean>;
}
