export const SPATIAL_ANALYSIS_PROMPT = `Analyze this image and provide a detailed spatial analysis in the following JSON format:
{
  "objects": [
    {
      "name": "object name",
      "confidence": 0.95,
      "category": "furniture/electronics/etc",
      "boundingBox": {
        "x": 0.1,
        "y": 0.2,
        "width": 0.3,
        "height": 0.4
      }
    }
  ],
  "relationships": [
    "object1 is to the left of object2",
    "object3 is on top of object4"
  ],
  "sceneDescription": "Brief description of the overall scene"
}

Important:
- Coordinates (x,y) and dimensions (width,height) should be normalized (0-1)
- Confidence scores should be between 0-1
- Be as precise as possible with object detection
- Include spatial relationships between objects
- Categorize objects into common household categories`;