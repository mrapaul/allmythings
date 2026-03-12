import { ClassifiedObject } from '../../providers/classifier.interface';
import { BoundingBoxResult } from '../../providers/detector.interface';

export const sampleBoundingBoxes: BoundingBoxResult[] = [
  { box: { x: 0.1, y: 0.05, width: 0.25, height: 0.85 }, coarseLabel: 'furniture', confidence: 0.9 },
  { box: { x: 0.5, y: 0.1, width: 0.3, height: 0.5 }, coarseLabel: 'electronics', confidence: 0.8 },
];

export const sampleClassifiedObjects: ClassifiedObject[] = [
  {
    boxIndex: 0, label: 'IKEA BILLY bookcase', category: 'living room furniture',
    brand: 'IKEA', model: 'BILLY', colors: ['birch', 'white'], materials: ['particleboard', 'veneer'],
    condition: 'good', estimatedValue: { low: 40, high: 70 },
    description: 'Standard IKEA bookcase with 5 adjustable shelves', confidence: 0.92,
    boundingBox: { x: 0.1, y: 0.05, width: 0.25, height: 0.85 },
  },
  {
    boxIndex: 1, label: 'Samsung 55-inch QLED TV', category: 'home entertainment',
    brand: 'Samsung', model: 'QN55Q60B', colors: ['black'], materials: ['plastic', 'glass'],
    condition: 'like-new', estimatedValue: { low: 400, high: 600 },
    description: 'Wall-mounted Samsung QLED television', confidence: 0.95,
    boundingBox: { x: 0.5, y: 0.1, width: 0.3, height: 0.5 },
  },
];
