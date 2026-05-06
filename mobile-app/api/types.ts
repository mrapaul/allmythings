// `@hey-api/openapi-ts` v0.64 names schemas after their `$id` (e.g. `def-0`),
// not their `title`. fastify-swagger emits `$id: 'DetectedItem'` but normalizes
// it to `def-0` in the generated openapi.json, so the codegen produces `Def0`.
// We re-export with a domain-meaningful alias here so the rest of the app
// doesn't leak that naming detail.
//
// We import directly from `./generated/types.gen` (not `./generated`) because
// the auto-generated `index.ts` also re-exports the runtime SDK from
// `sdk.gen.ts`, which depends on the installed `@hey-api/client-fetch@0.7`
// API surface that doesn't match what the generator emits. We use `ofetch`
// for HTTP, so only the type definitions are needed here.
export type { Def0 as DetectedItem } from './generated/types.gen';

export type DetectError = { error: string; runId?: string; message?: string };

export type DetectStreamEvent =
  | { type: 'meta'; runId: string; traceId: string }
  | { type: 'item'; item: import('./generated/types.gen').Def0 }
  | { type: 'done'; runId: string; totalItems: number }
  | {
      type: 'error';
      code: string;
      runId?: string;
      message?: string;
      retryAfterS?: number;
    };
