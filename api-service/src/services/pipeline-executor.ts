import { withSpan } from '../telemetry/pipeline-tracer';
import { classifyError, StepError, isOk } from '../telemetry/step-result';
import { logger } from '../utils/logger';

export interface PipelineStep {
  name: string;
  fn: (context: Record<string, unknown>) => Promise<Record<string, unknown>>;
  retry: number;
  timeoutMs: number;
}

interface StepReport {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: { step: string; code: string; message: string; retryable: boolean };
}

export interface PipelineRunResult {
  ok: boolean;
  context: Record<string, unknown>;
  errors: Array<{ step: string; code: string; message: string; retryable: boolean }>;
  steps: StepReport[];
  totalMs: number;
}

export class PipelineExecutor {
  static async run(
    pipelineName: string,
    steps: PipelineStep[],
    initialContext: Record<string, unknown>,
    onStepError: 'continue' | 'abort' = 'abort',
  ): Promise<PipelineRunResult> {
    const pipelineStart = Date.now();
    let context = { ...initialContext };
    const errors: PipelineRunResult['errors'] = [];
    const stepReports: StepReport[] = [];

    for (const step of steps) {
      const stepStart = Date.now();
      let succeeded = false;
      let lastError: StepError | undefined;

      for (let attempt = 0; attempt <= step.retry; attempt++) {
        if (attempt > 0) {
          const backoffMs = attempt * 1000;
          logger.info({ step: step.name, attempt, backoffMs }, 'Pipeline step retry');
          await new Promise((r) => setTimeout(r, backoffMs));
        }

        const result = await withSpan(
          `pipeline.${pipelineName}.${step.name}`,
          { 'pipeline.step': step.name, 'pipeline.attempt': attempt },
          async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), step.timeoutMs);
            try {
              const stepResult = await Promise.race([
                step.fn(context),
                new Promise<never>((_, reject) => {
                  controller.signal.addEventListener('abort', () =>
                    reject(
                      Object.assign(
                        new Error(`Step ${step.name} timed out after ${step.timeoutMs}ms`),
                        { name: 'TimeoutError' },
                      ),
                    ),
                  );
                }),
              ]);
              return stepResult;
            } finally {
              clearTimeout(timer);
            }
          },
        );

        if (isOk(result)) {
          context = result.value as Record<string, unknown>;
          succeeded = true;
          break;
        } else {
          lastError = result.error;
        }
      }

      const durationMs = Date.now() - stepStart;

      if (succeeded) {
        stepReports.push({ name: step.name, ok: true, durationMs });
      } else {
        const classified = lastError ?? classifyError(new Error('Unknown step failure'));
        const errorEntry = {
          step: step.name,
          code: classified.code,
          message: classified.message,
          retryable: classified.retryable,
        };
        errors.push(errorEntry);
        stepReports.push({ name: step.name, ok: false, durationMs, error: errorEntry });

        if (onStepError === 'abort') {
          return {
            ok: false,
            context,
            errors,
            steps: stepReports,
            totalMs: Date.now() - pipelineStart,
          };
        }
      }
    }

    return {
      ok: onStepError === 'continue' ? true : errors.length === 0,
      context,
      errors,
      steps: stepReports,
      totalMs: Date.now() - pipelineStart,
    };
  }
}
