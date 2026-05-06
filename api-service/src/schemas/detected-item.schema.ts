export const detectedItemSchema = {
  $id: 'DetectedItem',
  type: 'object',
  required: ['label', 'description', 'category', 'tags', 'box'],
  properties: {
    label: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    box: {
      type: 'object',
      required: ['x', 'y', 'width', 'height'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
    },
  },
} as const;
