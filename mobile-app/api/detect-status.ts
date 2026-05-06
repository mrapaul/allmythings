import { apiFetch } from './client';
import type { DetectedItem } from './types';

export interface DetectStatus {
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
  workflowId: string;
  result?: { items: DetectedItem[] } | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

export async function getDetectStatus(workflowId: string): Promise<DetectStatus> {
  return apiFetch<DetectStatus>(`/v1/detect/status/${encodeURIComponent(workflowId)}`);
}
