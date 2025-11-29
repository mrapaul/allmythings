/**
 * Test Suite Configuration
 * Defines all test suites for orchestration and execution
 */

import { TestSuite } from './test-orchestration';

/**
 * API Service Test Suites
 */
export const API_TEST_SUITES: TestSuite[] = [
  // Unit Tests - Layer 1 (No dependencies)
  {
    name: 'API: Image Quality Service',
    platform: 'api',
    type: 'unit',
    command: ['npm', 'test', '--', 'image-quality.service.test.ts'],
    cwd: 'api-service',
    timeout: 60000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },
  {
    name: 'API: Detection Service',
    platform: 'api',
    type: 'unit',
    command: ['npm', 'test', '--', 'detection.service.test.ts'],
    cwd: 'api-service',
    timeout: 60000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },
  {
    name: 'API: Inventory Service',
    platform: 'api',
    type: 'unit',
    command: ['npm', 'test', '--', 'inventory.service.test.ts'],
    cwd: 'api-service',
    timeout: 60000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },

  // Unit Tests - Layer 2 (Depend on service units)
  {
    name: 'API: Vision Orchestrator Service',
    platform: 'api',
    type: 'unit',
    command: ['npm', 'test', '--', 'vision-orchestrator.service.test.ts'],
    cwd: 'api-service',
    timeout: 90000,
    parallel: true,
    dependencies: [
      'API: Image Quality Service',
      'API: Detection Service',
    ],
    coverage: true,
  },
  {
    name: 'API: Ensemble Fusion Service',
    platform: 'api',
    type: 'unit',
    command: ['npm', 'test', '--', 'ensemble-fusion.service.test.ts'],
    cwd: 'api-service',
    timeout: 60000,
    parallel: true,
    dependencies: [
      'API: Image Quality Service',
      'API: Detection Service',
    ],
    coverage: true,
  },

  // Integration Tests (Depend on unit tests)
  {
    name: 'API: Detection Integration',
    platform: 'api',
    type: 'integration',
    command: ['npm', 'test', '--', 'detect.integration.test.ts'],
    cwd: 'api-service',
    timeout: 120000,
    parallel: false,
    dependencies: [
      'API: Vision Orchestrator Service',
      'API: Ensemble Fusion Service',
    ],
    coverage: true,
  },
  {
    name: 'API: Health Check Integration',
    platform: 'api',
    type: 'integration',
    command: ['npm', 'test', '--', 'health.integration.test.ts'],
    cwd: 'api-service',
    timeout: 60000,
    parallel: true,
    dependencies: ['API: Vision Orchestrator Service'],
    coverage: true,
  },
];

/**
 * Mobile App Test Suites
 */
export const MOBILE_TEST_SUITES: TestSuite[] = [
  // Unit Tests - Models
  {
    name: 'Mobile: Detection Models',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/domain/models/detection_models_test.dart'],
    cwd: 'mobile-app',
    timeout: 90000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },
  {
    name: 'Mobile: Detection Model',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/domain/models/detection_test.dart'],
    cwd: 'mobile-app',
    timeout: 90000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },

  // Unit Tests - Services
  {
    name: 'Mobile: Photo Capture Service',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/domain/services/photo_capture_service_test.dart'],
    cwd: 'mobile-app',
    timeout: 90000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },
  {
    name: 'Mobile: Image Processing Service',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/domain/services/image_processing_service_test.dart'],
    cwd: 'mobile-app',
    timeout: 120000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },

  // Unit Tests - Repositories
  {
    name: 'Mobile: Detection Repository',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/data/repositories/detection_repository_test.dart'],
    cwd: 'mobile-app',
    timeout: 90000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },
  {
    name: 'Mobile: Inventory Repository',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/data/repositories/inventory_repository_test.dart'],
    cwd: 'mobile-app',
    timeout: 90000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },

  // Integration Tests
  {
    name: 'Mobile: Detection Repository Functional',
    platform: 'mobile',
    type: 'integration',
    command: ['flutter', 'test', 'test/data/repositories/detection_repository_functional_test.dart'],
    cwd: 'mobile-app',
    timeout: 120000,
    parallel: false,
    dependencies: ['Mobile: Detection Repository'],
    coverage: true,
  },
  {
    name: 'Mobile: Inventory Providers Functional',
    platform: 'mobile',
    type: 'integration',
    command: ['flutter', 'test', 'test/application/providers/inventory_providers_functional_test.dart'],
    cwd: 'mobile-app',
    timeout: 120000,
    parallel: false,
    dependencies: [
      'Mobile: Detection Repository Functional',
      'Mobile: Inventory Repository',
    ],
    coverage: true,
  },

  // Widget Tests
  {
    name: 'Mobile: Camera Screen Widget',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/presentation/camera/camera_screen_test.dart'],
    cwd: 'mobile-app',
    timeout: 90000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },
  {
    name: 'Mobile: Detection Results Screen Widget',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/presentation/detection/detection_results_screen_widget_test.dart'],
    cwd: 'mobile-app',
    timeout: 90000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },
  {
    name: 'Mobile: Inventory Feed Screen Widget',
    platform: 'mobile',
    type: 'unit',
    command: ['flutter', 'test', 'test/presentation/home/inventory_feed_screen_widget_test.dart'],
    cwd: 'mobile-app',
    timeout: 90000,
    parallel: true,
    dependencies: [],
    coverage: true,
  },

  // E2E Tests
  {
    name: 'Mobile: Camera Detection E2E',
    platform: 'mobile',
    type: 'e2e',
    command: ['flutter', 'test', 'test/e2e/auto_detect_save_search_test.dart'],
    cwd: 'mobile-app',
    timeout: 180000,
    parallel: false,
    dependencies: [
      'Mobile: Inventory Providers Functional',
      'Mobile: Detection Results Screen Widget',
    ],
    coverage: true,
  },
];

/**
 * All test suites combined
 */
export const ALL_TEST_SUITES: TestSuite[] = [
  ...API_TEST_SUITES,
  ...MOBILE_TEST_SUITES,
];

/**
 * Get test suites by platform
 */
export function getTestSuitesByPlatform(platform: 'api' | 'mobile'): TestSuite[] {
  return ALL_TEST_SUITES.filter(suite => suite.platform === platform);
}

/**
 * Get test suites by type
 */
export function getTestSuitesByType(
  type: 'unit' | 'integration' | 'e2e' | 'bdd'
): TestSuite[] {
  return ALL_TEST_SUITES.filter(suite => suite.type === type);
}

/**
 * Get test suite by name
 */
export function getTestSuiteByName(name: string): TestSuite | undefined {
  return ALL_TEST_SUITES.find(suite => suite.name === name);
}
