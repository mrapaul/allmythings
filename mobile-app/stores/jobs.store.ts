import type { DetectionJob } from '@/lib/jobs';
import type { Prefs } from '@/stores/prefs';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Reactive walk-mode job list, mirrored into MMKV on every change so the
 * inbox survives restarts. Hydrated once by the job manager at root level;
 * before hydration the store simply starts empty (safe in tests).
 */

interface JobsState {
  jobs: DetectionJob[];
}

const jobsStore = createStore<JobsState>(() => ({ jobs: [] }));

let prefsRef: Prefs | null = null;

function commit(jobs: DetectionJob[]): void {
  jobsStore.setState({ jobs });
  prefsRef?.setDetectionJobs(jobs);
}

export function initJobsStore(prefs: Prefs): void {
  prefsRef = prefs;
  jobsStore.setState({ jobs: prefs.getDetectionJobs() });
}

export function addJob(job: DetectionJob): void {
  commit([job, ...jobsStore.getState().jobs.filter((j) => j.runId !== job.runId)]);
}

export function patchJob(runId: string, patch: Partial<Omit<DetectionJob, 'runId'>>): void {
  commit(jobsStore.getState().jobs.map((j) => (j.runId === runId ? { ...j, ...patch } : j)));
}

export function removeJob(runId: string): void {
  commit(jobsStore.getState().jobs.filter((j) => j.runId !== runId));
}

export function markJobReviewed(runId: string): void {
  patchJob(runId, { reviewed: true });
}

export function useJobsStore<T>(selector: (s: JobsState) => T): T {
  return useStore(jobsStore, selector);
}

export function getJobsStore() {
  return jobsStore;
}
