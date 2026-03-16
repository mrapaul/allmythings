import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/domain/models/inventory_item.dart';

const sampleDetectedObject = DetectedObject(
  boxIndex: 0,
  label: 'IKEA BILLY bookcase',
  category: 'living room furniture',
  confidence: 0.92,
  boundingBox: BoundingBox(x: 0.1, y: 0.05, width: 0.25, height: 0.85),
  brand: 'IKEA',
  model: 'BILLY',
  colors: ['birch', 'white'],
  materials: ['particleboard', 'veneer'],
  condition: 'good',
  estimatedValue: ValueRange(low: 40, high: 70),
  description: 'Standard IKEA bookcase with 5 adjustable shelves',
);

final sampleInventoryItem = InventoryItem(
  id: 1,
  photoPath: '/path/to/photo.jpg',
  thumbnailPath: '/path/to/thumb.jpg',
  detectionData: '{"label": "IKEA BILLY bookcase"}',
  createdAt: DateTime(2026, 3, 12, 10),
  updatedAt: DateTime(2026, 3, 12, 10),
);

final sampleItemLabels = [
  ItemLabel(
    id: 1,
    itemId: 1,
    key: 'label',
    value: 'IKEA BILLY bookcase',
    confidence: 0.92,
    createdAt: DateTime(2026, 3, 12, 10),
  ),
  ItemLabel(
    id: 2,
    itemId: 1,
    key: 'category',
    value: 'living room furniture',
    confidence: 0.92,
    createdAt: DateTime(2026, 3, 12, 10),
  ),
  ItemLabel(
    id: 3,
    itemId: 1,
    key: 'brand',
    value: 'IKEA',
    confidence: 0.92,
    createdAt: DateTime(2026, 3, 12, 10),
  ),
];
