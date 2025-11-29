/**
 * Test Orchestration System
 * Intelligent parallel test execution, resource management, and reporting
 * Uses safe command execution patterns
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test Suite Configuration
 */
interface TestSuite {
  name: string;
  platform: 'api' | 'mobile';
  type: 'unit' | 'integration' | 'e2e' | 'bdd';
  command: string[];
  cwd: string;
  timeout: number;
  parallel: boolean;
  dependencies: string[];
  coverage?: boolean;
}

interface OrchestrationConfig {
  parallelWorkers: number;
  failFast: boolean;
  generateReports: boolean;
  minCoverage: number;
  timeout: number;
}

/**
 * Test Orchestrator - Intelligent parallel test execution
 */
class TestOrchestrator {
  private testSuites: TestSuite[] = [];
  private config: OrchestrationConfig;
  private results: Map<string, TestResult> = new Map();

  constructor(config: Partial<OrchestrationConfig> = {}) {
    this.config = {
      parallelWorkers: 4,
      failFast: false,
      generateReports: true,
      minCoverage: 80,
      timeout: 600000,
      ...config,
    };
  }

  /**
   * Register test suite
   */
  registerTestSuite(suite: TestSuite): void {
    this.testSuites.push(suite);
  }

  /**
   * Register multiple test suites
   */
  registerTestSuites(suites: TestSuite[]): void {
    this.testSuites.push(...suites);
  }

  /**
   * Get all registered test suites
   */
  getTestSuites(): TestSuite[] {
    return this.testSuites;
  }

  /**
   * Analyze dependencies and create execution order (topological sort)
   */
  private topologicalSort(suites: TestSuite[]): TestSuite[] {
    const sorted: TestSuite[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (suite: TestSuite): void => {
      if (visited.has(suite.name)) return;
      if (visiting.has(suite.name)) {
        throw new Error(`Circular dependency detected: ${suite.name}`);
      }

      visiting.add(suite.name);

      for (const depName of suite.dependencies) {
        const dep = suites.find(s => s.name === depName);
        if (dep) {
          visit(dep);
        }
      }

      visiting.delete(suite.name);
      visited.add(suite.name);
      sorted.push(suite);
    };

    for (const suite of suites) {
      visit(suite);
    }

    return sorted;
  }

  /**
   * Batch tests by dependencies for intelligent grouping
   */
  private batchTestSuites(suites: TestSuite[]): TestSuite[][] {
    const batches: TestSuite[][] = [];
    const processed = new Set<string>();

    // First batch: prerequisites with no dependencies
    const noDeps = suites.filter(s => s.dependencies.length === 0);
    if (noDeps.length > 0) {
      batches.push(noDeps);
      noDeps.forEach(s => processed.add(s.name));
    }

    // Subsequent batches: dependent tests
    while (processed.size < suites.length) {
      const nextBatch = suites.filter(
        s =>
          !processed.has(s.name) &&
          s.dependencies.every(dep => processed.has(dep))
      );

      if (nextBatch.length === 0) {
        throw new Error('Circular dependency detected in test suites');
      }

      batches.push(nextBatch);
      nextBatch.forEach(s => processed.add(s.name));
    }

    return batches;
  }

  /**
   * Execute a single test suite safely
   */
  private executeTestSuite(suite: TestSuite): TestResult {
    const startTime = Date.now();

    try {
      console.log(`\n▶ Running: ${suite.name}`);
      console.log(`  Platform: ${suite.platform} | Type: ${suite.type}`);

      // Use spawnSync for safe command execution
      const result = spawnSync(suite.command[0], suite.command.slice(1), {
        cwd: suite.cwd,
        timeout: suite.timeout,
        encoding: 'utf-8',
      });

      const duration = Date.now() - startTime;

      if (result.error) {
        throw result.error;
      }

      const output = (result.stdout || '') + (result.stderr || '');

      // Parse coverage from output
      const coverageMatch = output.match(/Coverage:\s*([\d.]+)%/);
      const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : undefined;

      if (result.status !== 0) {
        return {
          suiteName: suite.name,
          status: 'failed',
          duration,
          coverage,
          output,
          error: `Exit code: ${result.status}`,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        suiteName: suite.name,
        status: 'passed',
        duration,
        coverage,
        output,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        suiteName: suite.name,
        status: 'failed',
        duration,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Run all test suites with intelligent orchestration
   */
  async runAllTests(): Promise<TestRunSummary> {
    console.log('\n' + '='.repeat(70));
    console.log('TEST ORCHESTRATION: Parallel Execution with Resource Management');
    console.log('='.repeat(70));

    const startTime = Date.now();

    // Analyze and batch tests
    const sorted = this.topologicalSort(this.testSuites);
    const batches = this.batchTestSuites(sorted);

    console.log(`\nTest Configuration:`);
    console.log(`  Total Suites: ${this.testSuites.length}`);
    console.log(`  Execution Batches: ${batches.length}`);
    console.log(`  Parallel Workers: ${this.config.parallelWorkers}`);
    console.log(`  Minimum Coverage: ${this.config.minCoverage}%`);

    // Execute batches sequentially, with parallel execution within each batch
    for (let i = 0; i < batches.length; i++) {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`Batch ${i + 1}/${batches.length}`);
      console.log(`${'─'.repeat(70)}`);

      const batchResults = await this.executeParallel(batches[i]);

      // Check for failures
      const failures = batchResults.filter(r => r.status === 'failed');
      if (failures.length > 0 && this.config.failFast) {
        console.error('\n✗ Test execution failed (fail-fast enabled)');
        return this.generateSummary(true);
      }
    }

    const totalDuration = Date.now() - startTime;

    return this.generateSummary(false, totalDuration);
  }

  /**
   * Execute tests with parallel resource pooling
   */
  private async executeParallel(batch: TestSuite[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Execute sequentially for now (can be enhanced for true parallelism)
    for (const suite of batch) {
      const result = this.executeTestSuite(suite);
      results.push(result);
      this.results.set(suite.name, result);
    }

    return results;
  }

  /**
   * Generate test summary report
   */
  private generateSummary(
    failed: boolean,
    totalDuration?: number
  ): TestRunSummary {
    const results = Array.from(this.results.values());
    const passed = results.filter(r => r.status === 'passed').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const avgCoverage =
      results
        .filter(r => r.coverage)
        .reduce((sum, r) => sum + (r.coverage || 0), 0) /
      (results.filter(r => r.coverage).length || 1) || 0;

    const summary: TestRunSummary = {
      totalTests: this.testSuites.length,
      passed,
      failed: failedCount,
      duration: totalDuration || 0,
      coverage: Math.round(avgCoverage * 100) / 100,
      results,
      timestamp: new Date().toISOString(),
      status: failedCount === 0 ? 'success' : 'failure',
    };

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Status: ${summary.status === 'success' ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`Total Suites: ${summary.totalTests}`);
    console.log(`Passed: ${summary.passed}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(
      `Coverage: ${summary.coverage}% ${summary.coverage >= this.config.minCoverage ? '✓' : '✗'}`
    );
    console.log(`Duration: ${Math.round(summary.duration / 1000)}s`);

    if (this.config.generateReports) {
      this.generateHTMLReport(summary);
    }

    return summary;
  }

  /**
   * Generate HTML test report
   */
  private generateHTMLReport(summary: TestRunSummary): void {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test Orchestration Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f9f9f9; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: #fff; padding: 20px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .summary { margin: 20px 0; padding: 15px; background: ${summary.status === 'success' ? '#d4edda' : '#f8d7da'}; border-radius: 5px; }
    .results { margin-top: 30px; }
    .suite { margin: 10px 0; padding: 10px; background: #fff; border-left: 4px solid #ddd; border-radius: 3px; }
    .suite.passed { border-color: #28a745; background: #f1f8f5; }
    .suite.failed { border-color: #dc3545; background: #fdf5f5; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #fff; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 Test Orchestration Report</h1>
      <p style="color: #666;">Generated: ${summary.timestamp}</p>
    </div>

    <div class="summary">
      <h2>${summary.status === 'success' ? '✓ All Tests Passed' : '✗ Tests Failed'}</h2>
      <table>
        <tr>
          <td><strong>Status</strong></td>
          <td>${summary.status === 'success' ? '✓ PASSED' : '✗ FAILED'}</td>
        </tr>
        <tr>
          <td><strong>Total Suites</strong></td>
          <td>${summary.totalTests}</td>
        </tr>
        <tr>
          <td><strong>Passed</strong></td>
          <td style="color: #28a745;">${summary.passed}</td>
        </tr>
        <tr>
          <td><strong>Failed</strong></td>
          <td style="color: #dc3545;">${summary.failed}</td>
        </tr>
        <tr>
          <td><strong>Coverage</strong></td>
          <td>${summary.coverage}% ${summary.coverage >= 80 ? '✓' : '⚠'}</td>
        </tr>
        <tr>
          <td><strong>Duration</strong></td>
          <td>${Math.round(summary.duration / 1000)}s</td>
        </tr>
      </table>
    </div>

    <div class="results">
      <h2>📋 Test Suite Results</h2>
      ${summary.results
        .map(
          r => `
      <div class="suite ${r.status}">
        <div><strong>${r.suiteName}</strong></div>
        <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
          ${r.status === 'passed' ? '✓' : '✗'}
          Duration: ${Math.round(r.duration / 1000)}s
          ${r.coverage ? `| Coverage: ${r.coverage}%` : ''}
        </div>
        ${r.error ? `<div style="color: #dc3545; margin-top: 5px; font-family: monospace; font-size: 0.85em;">Error: ${r.error}</div>` : ''}
      </div>
      `
        )
        .join('')}
    </div>
  </div>
</body>
</html>`;

    const reportPath = path.join(process.cwd(), 'test-report.html');
    fs.writeFileSync(reportPath, html);
    console.log(`\n📊 Report generated: ${reportPath}`);
  }
}

/**
 * Test Result
 */
interface TestResult {
  suiteName: string;
  status: 'passed' | 'failed';
  duration: number;
  coverage?: number;
  output?: string;
  error?: string;
  timestamp: string;
}

/**
 * Test Run Summary
 */
interface TestRunSummary {
  totalTests: number;
  passed: number;
  failed: number;
  duration: number;
  coverage: number;
  results: TestResult[];
  timestamp: string;
  status: 'success' | 'failure';
}

export { TestOrchestrator, TestSuite, OrchestrationConfig, TestResult, TestRunSummary };
