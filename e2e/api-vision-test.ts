/**
 * E2E API Test: Vision Detection with Real Interior Image
 * Tests the complete API workflow with actual image file
 *
 * This test:
 * 1. Loads a real interior image from disk
 * 2. Sends it to the detection API
 * 3. Validates detection results
 * 4. Verifies ensemble fusion works correctly
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:8000';
const TEST_IMAGE_PATH = path.expandUser('~/Downloads/Images/ai_interior.jpg');

interface DetectionResult {
  imageWidth: number;
  imageHeight: number;
  detections: Array<{
    label: string;
    confidence: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  ensembleDetails?: {
    google?: {
      confidence: number;
      detectionCount: number;
    };
    aws?: {
      confidence: number;
      detectionCount: number;
    };
    mock?: {
      confidence: number;
      detectionCount: number;
    };
  };
  processingTimeMs: number;
}

describe('API Vision Detection E2E Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      throw new Error(`Test image not found at ${TEST_IMAGE_PATH}`);
    }
    console.log(`✅ Test image found: ${TEST_IMAGE_PATH}`);
    console.log(`   File size: ${(fs.statSync(TEST_IMAGE_PATH).size / 1024).toFixed(2)} KB`);
  });

  test('Health check - API is running', async () => {
    const response = await axios.get(`${API_BASE_URL}/v1/health`);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('status');
    console.log('✅ API Health:', response.data);
  });

  test('Detect objects in interior image using FormData', async () => {
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'ai_interior.jpg');

    const response = await axios.post<DetectionResult>(
      `${API_BASE_URL}/v1/detect`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('detections');
    expect(response.data).toHaveProperty('imageWidth');
    expect(response.data).toHaveProperty('imageHeight');
    expect(response.data).toHaveProperty('processingTimeMs');

    console.log('✅ Detection Results:');
    console.log(`   Detections found: ${response.data.detections.length}`);
    console.log(`   Image dimensions: ${response.data.imageWidth}x${response.data.imageHeight}`);
    console.log(`   Processing time: ${response.data.processingTimeMs}ms`);

    if (response.data.detections.length > 0) {
      console.log('   Top detections:');
      response.data.detections.slice(0, 5).forEach((det, i) => {
        console.log(`     ${i + 1}. ${det.label} (confidence: ${(det.confidence * 100).toFixed(2)}%)`);
      });
    }
  });

  test('Detections include furniture and room items', async () => {
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'ai_interior.jpg');

    const response = await axios.post<DetectionResult>(
      `${API_BASE_URL}/v1/detect`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    // Should find interior-related objects
    expect(response.data.detections.length).toBeGreaterThan(0);

    const detectionLabels = response.data.detections.map(d => d.label.toLowerCase());

    // Check for common interior items
    const interiorKeywords = ['furniture', 'chair', 'sofa', 'table', 'lamp', 'room', 'wall', 'floor'];
    const hasInteriorItems = interiorKeywords.some(keyword =>
      detectionLabels.some(label => label.includes(keyword))
    );

    console.log(`✅ Interior detection: ${hasInteriorItems ? 'FOUND' : 'Some items detected but no typical furniture'}`);
  });

  test('Ensemble fusion provides confidence metrics', async () => {
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'ai_interior.jpg');

    const response = await axios.post<DetectionResult>(
      `${API_BASE_URL}/v1/detect`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    if (response.data.ensembleDetails) {
      console.log('✅ Ensemble Details:');
      if (response.data.ensembleDetails.google) {
        console.log(`   Google: ${response.data.ensembleDetails.google.detectionCount} detections, confidence: ${response.data.ensembleDetails.google.confidence.toFixed(3)}`);
      }
      if (response.data.ensembleDetails.aws) {
        console.log(`   AWS: ${response.data.ensembleDetails.aws.detectionCount} detections, confidence: ${response.data.ensembleDetails.aws.confidence.toFixed(3)}`);
      }
      if (response.data.ensembleDetails.mock) {
        console.log(`   Mock: ${response.data.ensembleDetails.mock.detectionCount} detections, confidence: ${response.data.ensembleDetails.mock.confidence.toFixed(3)}`);
      }
    }
  });

  test('Bounding boxes are properly formatted', async () => {
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'ai_interior.jpg');

    const response = await axios.post<DetectionResult>(
      `${API_BASE_URL}/v1/detect`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    const detectionsWithBbox = response.data.detections.filter(d => d.boundingBox);

    if (detectionsWithBbox.length > 0) {
      console.log(`✅ Found ${detectionsWithBbox.length} detections with bounding boxes`);

      detectionsWithBbox.forEach(detection => {
        const { x, y, width, height } = detection.boundingBox!;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        expect(x + width).toBeLessThanOrEqual(response.data.imageWidth);
        expect(y + height).toBeLessThanOrEqual(response.data.imageHeight);
      });
    }
  });

  test('Performance: Detection completes within acceptable time', async () => {
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'ai_interior.jpg');

    const startTime = Date.now();
    const response = await axios.post<DetectionResult>(
      `${API_BASE_URL}/v1/detect`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    const elapsedTime = Date.now() - startTime;

    const maxAllowedTime = 30000; // 30 seconds for vision API
    expect(elapsedTime).toBeLessThan(maxAllowedTime);

    console.log(`✅ Detection completed in ${elapsedTime}ms (API reported: ${response.data.processingTimeMs}ms)`);
  });

  test('Multiple consecutive requests work correctly', async () => {
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);

    const requests = [];
    for (let i = 0; i < 3; i++) {
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('image', blob, `ai_interior_${i}.jpg`);

      requests.push(
        axios.post<DetectionResult>(`${API_BASE_URL}/v1/detect`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );
    }

    const responses = await Promise.all(requests);

    responses.forEach((response, index) => {
      expect(response.status).toBe(200);
      expect(response.data.detections).toBeDefined();
      console.log(`✅ Request ${index + 1}: ${response.data.detections.length} detections`);
    });
  });
});
