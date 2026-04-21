import { DetectResult, EnrichedItem, PipelineError, SavedPhoto } from '../shared-types';

export interface AssembleInput {
  saved: SavedPhoto;
  items: EnrichedItem[];
  errors: PipelineError[];
  traceId: string;
  startedAtMs: number;
}

export async function assembleResult(input: AssembleInput): Promise<DetectResult> {
  return {
    photoId: input.saved.photoId,
    photoUrl: `/photos/${input.saved.photoId}.jpg`,
    itemCount: input.items.length,
    items: input.items,
    errors: input.errors,
    traceId: input.traceId,
    processingMs: Date.now() - input.startedAtMs,
  };
}
