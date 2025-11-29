#!/usr/bin/env node

/**
 * Test Orchestration Runner
 * Executes comprehensive regression test suite with reporting
 */

import { TestOrchestrator } from './test-orchestration';
import { ALL_TEST_SUITES, API_TEST_SUITES, MOBILE_TEST_SUITES } from './test-suite-config';

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const platform = args[0] || 'all'; // 'api', 'mobile', or 'all'
  const failFast = args.includes('--fail-fast');
  const generateReports = !args.includes('--no-reports');

  let testSuites = ALL_TEST_SUITES;

  // Filter by platform if specified
  if (platform === 'api') {
    testSuites = API_TEST_SUITES;
  } else if (platform === 'mobile') {
    testSuites = MOBILE_TEST_SUITES;
  }

  // Initialize orchestrator
  const orchestrator = new TestOrchestrator({
    parallelWorkers: 4,
    failFast,
    generateReports,
    minCoverage: 80,
    timeout: 600000,
  });

  // Register test suites
  orchestrator.registerTestSuites(testSuites);

  // Run tests
  try {
    const summary = await orchestrator.runAllTests();

    // Exit with appropriate code
    process.exit(summary.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test orchestration failed:', error);
    process.exit(1);
  }
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
