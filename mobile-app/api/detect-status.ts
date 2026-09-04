import { apiFetch } from './client';
import type { DetectedItem, SceneInfo } from './types';

export interface DetectStatus {
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
  workflowId: string;
  /** VLM async runs: present while running (partial) and when completed. */
  photoSha256?: string | undefined;
  scene?: SceneInfo | null | undefined;
  result?: { items: DetectedItem[] } | undefined;
  /**
   * Optional duplicate hints. Typed as `unknown` on purpose: the server
   * contract is still landing, so the client parses it defensively rather
   * than depending on a shape (lib/suggestions.ts).
   */
  mergeSuggestions?: unknown;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

export async function getDetectStatus(workflowId: string): Promise<DetectStatus> {
  return apiFetch<DetectStatus>(`/v1/detect/status/${encodeURIComponent(workflowId)}`);
}
