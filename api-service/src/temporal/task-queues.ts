export const TASK_QUEUES = {
  INVENTORY_PIPELINE: 'inventory-pipeline',
} as const;

export type TaskQueue = typeof TASK_QUEUES[keyof typeof TASK_QUEUES];
