/**
 * k6 Load Test - Detection API
 * Tests the object detection endpoint under various load conditions
 *
 * Installation:
 *   brew install k6  (macOS)
 *   or download from https://k6.io/
 *
 * Usage:
 *   k6 run detection-load-test.js
 *   k6 run --vus 100 --duration 5m detection-load-test.js
 *   k6 run --out influxdb=http://localhost:8086/k6 detection-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// ============================================================================
// Custom Metrics
// ============================================================================

const errorRate = new Rate('errors');
const detectionTime = new Trend('detection_time');
const cacheHitRate = new Rate('cache_hits');
const detectionCount = new Counter('detections_total');
const activeUsers = new Gauge('active_users');

// ============================================================================
// Test Configuration
// ============================================================================

export const options = {
  // Load test stages
  stages: [
    { duration: '1m', target: 50 },    // Warm up to 50 users
    { duration: '3m', target: 50 },    // Stay at 50 users
    { duration: '1m', target: 100 },   // Ramp up to 100 users
    { duration: '3m', target: 100 },   // Stay at 100 users
    { duration: '1m', target: 200 },   // Spike to 200 users
    { duration: '2m', target: 200 },   // Hold spike
    { duration: '2m', target: 0 },     // Ramp down
  ],

  // Performance thresholds
  thresholds: {
    // 95% of requests should complete within 500ms
    http_req_duration: ['p(95)<500', 'p(99)<1000'],

    // Error rate should be less than 1%
    http_req_failed: ['rate<0.01'],

    // Custom metric thresholds
    errors: ['rate<0.05'],
    detection_time: ['p(95)<500', 'avg<300'],

    // Check pass rate should be > 95%
    checks: ['rate>0.95'],
  },

  // HTTP settings
  noConnectionReuse: false,
  userAgent: 'k6-load-test/1.0',
};

// ============================================================================
// Test Configuration
// ============================================================================

const BASE_URL = __ENV.API_URL || 'http://localhost:14000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

// Test image data (base64 encoded small test image)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ============================================================================
// Setup and Teardown
// ============================================================================

export function setup() {
  console.log('Starting load test...');
  console.log(`Target API: ${BASE_URL}`);

  // Verify API is accessible
  const healthCheck = http.get(`${BASE_URL}/v1/health`);
  check(healthCheck, {
    'API is accessible': (r) => r.status === 200,
  });

  if (healthCheck.status !== 200) {
    throw new Error('API health check failed');
  }

  return {
    startTime: new Date().toISOString(),
  };
}

export function teardown(data) {
  console.log('Load test completed');
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}

// ============================================================================
// Main Test Scenario
// ============================================================================

export default function () {
  activeUsers.add(1);

  // Test different scenarios
  group('Detection API Tests', () => {
    // Scenario 1: Standard detection
    group('Standard Detection', () => {
      testDetection();
    });

    // Scenario 2: Detection with min confidence
    group('Detection with Confidence Filter', () => {
      testDetectionWithConfidence(0.8);
    });

    // Scenario 3: Health check (lightweight)
    group('Health Check', () => {
      testHealthCheck();
    });
  });

  // Think time - simulate real user behavior
  sleep(Math.random() * 3 + 1); // 1-4 seconds

  activeUsers.add(-1);
}

// ============================================================================
// Test Functions
// ============================================================================

function testDetection() {
  const url = `${BASE_URL}/v1/detect`;

  // Create multipart form data
  const boundary = '----k6TestBoundary';
  const imageData = Uint8Array.from(atob(TEST_IMAGE_BASE64), c => c.charCodeAt(0));

  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="test.png"',
    'Content-Type: image/png',
    '',
    String.fromCharCode.apply(null, imageData),
    `--${boundary}--`,
  ].join('\r\n');

  const params = {
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    timeout: '30s',
    tags: { name: 'detection' },
  };

  const startTime = Date.now();
  const response = http.post(url, body, params);
  const duration = Date.now() - startTime;

  // Validate response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has detections': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.detections !== undefined;
      } catch {
        return false;
      }
    },
    'response time < 1000ms': () => duration < 1000,
  });

  // Record metrics
  errorRate.add(!success);
  detectionTime.add(duration);
  detectionCount.add(1);

  // Check if response was from cache
  if (response.status === 200) {
    try {
      const data = JSON.parse(response.body);
      cacheHitRate.add(data.fromCache === true);
    } catch {
      // Ignore parse errors
    }
  }

  return response;
}

function testDetectionWithConfidence(minConfidence) {
  const url = `${BASE_URL}/v1/detect?minConfidence=${minConfidence}`;

  const boundary = '----k6TestBoundary';
  const imageData = Uint8Array.from(atob(TEST_IMAGE_BASE64), c => c.charCodeAt(0));

  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="test.png"',
    'Content-Type: image/png',
    '',
    String.fromCharCode.apply(null, imageData),
    `--${boundary}--`,
  ].join('\r\n');

  const params = {
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    timeout: '30s',
    tags: { name: 'detection_with_confidence' },
  };

  const response = http.post(url, body, params);

  check(response, {
    'status is 200': (r) => r.status === 200,
    'filtered by confidence': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.detections.every(d => d.confidence >= minConfidence);
      } catch {
        return false;
      }
    },
  });

  return response;
}

function testHealthCheck() {
  const url = `${BASE_URL}/v1/health`;

  const response = http.get(url, {
    tags: { name: 'health_check' },
  });

  check(response, {
    'health check returns 200': (r) => r.status === 200,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });

  return response;
}

// ============================================================================
// Custom Summary Report
// ============================================================================

export function handleSummary(data) {
  return {
    'summary.html': htmlReport(data),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
  };
}

// ============================================================================
// Performance Scenarios (Alternative Configurations)
// ============================================================================

// Uncomment to use specific scenario

/*
// SCENARIO 1: Smoke Test
export const options = {
  vus: 1,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(99)<1000'],
  },
};
*/

/*
// SCENARIO 2: Load Test
export const options = {
  stages: [
    { duration: '5m', target: 100 },
    { duration: '10m', target: 100 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
*/

/*
// SCENARIO 3: Stress Test
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '5m', target: 300 },
    { duration: '2m', target: 400 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
  },
};
*/

/*
// SCENARIO 4: Spike Test
export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '30s', target: 1000 }, // Spike
    { duration: '3m', target: 100 },
    { duration: '30s', target: 1000 }, // Second spike
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
};
*/

/*
// SCENARIO 5: Soak Test (24 hours)
export const options = {
  stages: [
    { duration: '5m', target: 50 },
    { duration: '24h', target: 50 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
*/
