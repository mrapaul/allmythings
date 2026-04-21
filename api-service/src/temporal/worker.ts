import { Worker, NativeConnection } from '@temporalio/worker';
import path from 'node:path';
import { envConfig } from '../config/env.config';
import { TASK_QUEUES } from './task-queues';
import { logger } from '../utils/logger';
import * as activities from './activities';

let _worker: Worker | null = null;
let _connection: NativeConnection | null = null;
let _runPromise: Promise<void> | null = null;

/**
 * Create and return the Temporal worker (does NOT start polling).
 * Caller decides when to `.run()` and when to shut down.
 */
export async function createWorker(): Promise<Worker> {
  if (_worker) return _worker;

  _connection = await NativeConnection.connect({ address: envConfig.temporalHost });

  _worker = await Worker.create({
    connection: _connection,
    namespace: envConfig.temporalNamespace,
    taskQueue: TASK_QUEUES.INVENTORY_PIPELINE,
    workflowsPath: path.resolve(__dirname, './workflows/detect-inventory.workflow'),
    activities,
    maxConcurrentActivityTaskExecutions: envConfig.pipelineMaxConcurrency,
    maxConcurrentWorkflowTaskExecutions: 10,
  });

  logger.info({
    taskQueue: TASK_QUEUES.INVENTORY_PIPELINE,
    maxActivities: envConfig.pipelineMaxConcurrency,
  }, 'Temporal worker created');

  return _worker;
}

export async function runWorker(): Promise<void> {
  const worker = await createWorker();
  _runPromise = worker.run();
  logger.info('Temporal worker started polling');
}

export async function closeWorker(): Promise<void> {
  if (_worker) {
    try {
      _worker.shutdown();
    } catch { /* idempotent */ }
  }
  if (_runPromise) {
    try { await _runPromise; } catch { /* expected during shutdown */ }
  }
  if (_connection) {
    try { await _connection.close(); } catch { /* idempotent */ }
  }
  _worker = null;
  _connection = null;
  _runPromise = null;
}
