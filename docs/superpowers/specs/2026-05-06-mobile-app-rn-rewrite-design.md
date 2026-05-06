# Mobile App: Flutter → React Native (Expo) Rewrite — Design Spec

**Date:** 2026-05-06
**Status:** Draft, pending review
**Owner:** Mobile
**Replaces:** Existing Flutter `mobile-app/`

---

## 1. Goal

Replace the current Flutter `mobile-app/` with a React Native + Expo rewrite that matches the UX, visual design, and feature set of the reference app in `design/mobile-app/artifacts/home-inventory/`, while wiring detection into the existing backend (`api-service/` + `pipeline-service/`) instead of the design's bundled Express + Gemini server.

The product target is the design's UX **as-is**: enchanted Disney+ palette, masonry inventory grid, multi-home model, streaming progressive detection screen, swipe-to-discard rows, multi-attribute search.

## 2. Non-goals

- Bringing the design's Express api-server, Gemini integration, or pnpm monorepo (`lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/integrations-gemini-ai`, `lib/db`).
- Migrating user data from the Flutter Drift DB. Per project policy, the app is not deployed; schemas are rewritten directly with no migration step.
- Adding new product features beyond what the design has.
- Multi-user / cloud sync. Single-device, single-Bearer-key today.
- Replacing or restructuring `pipeline-service`'s detection pipeline. The Temporal-orchestrated workflow stays.

## 3. Architecture

```
┌──────────────────────────────────────────┐
│  mobile-app/  (Expo SDK 54, RN 0.81.x)   │
│  ┌────────────────────────────────────┐  │
│  │  Expo Router v4 (file-based)       │  │
│  │  Zustand UI state                  │  │
│  │  TanStack Query v5 server state    │  │
│  │  Drizzle + expo-sqlite (FTS5)      │  │
│  │  expo-file-system (photos)         │  │
│  │  MMKV (prefs)                      │  │
│  │  Sentry RN + OTel JS SDK           │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
              │ HTTPS, Bearer auth
              │ traceparent W3C header
              ▼
┌──────────────────────────────────────────┐
│  api-service/  (Fastify, existing)       │
│  - POST /v1/detect              (sync)   │
│  - POST /v1/detect/stream      (NEW SSE) │
│  - GET  /v1/detect/status/:id            │
│  - GET  /v1/health                       │
│  Maps pipeline result → DetectedItem     │
│  Emits OTel spans                        │
└──────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────┐
│  pipeline-service/ (Temporal workflow,   │
│  Florence + ensemble fusion + dedup)     │
└──────────────────────────────────────────┘
```

**End-to-end trace:** Mobile generates `traceparent`, propagates through `api-service` → Temporal workflow in `pipeline-service`. One trace per detection from tap to result.

## 4. Mobile app

### 4.1 Tech stack

| Concern | Choice | Version target |
|---|---|---|
| Runtime | Expo SDK 54 (~54.0.27), React Native 0.81.x (New Architecture default-on), Hermes | matches design lockfile |
| Language | TypeScript strict, `noUncheckedIndexedAccess` | 5.7+ |
| Navigation | Expo Router | v4 |
| Server state / async orchestration | TanStack Query | v5 |
| Client state | Zustand (slices) + React Context for slow-changing (homes, profile) | v5 |
| Persistence | `expo-sqlite/next` + Drizzle ORM (SQLite dialect) with FTS5 | drizzle-orm 0.36+ |
| Prefs | `react-native-mmkv` | v3 |
| Photos | `expo-file-system` + `expo-image` (with prefetch + disk cache) | latest |
| HTTP | `ofetch` wrapped in TanStack Query | latest |
| SSE | `expo/fetch` (whatwg `ReadableStream` body, no polyfill) | bundled |
| Animations | Reanimated 3, Gesture Handler 2 | latest |
| Lists | `@shopify/flash-list` v2 | v2 |
| Validation | Zod | v3 |
| Lint/format | Biome | 1.9+ |
| Testing | Vitest (unit), Maestro (E2E, already in repo) | latest |
| Errors / perf | Sentry React Native SDK | v6 |
| Tracing | OpenTelemetry JS SDK | latest |

### 4.2 Directory layout

```
mobile-app/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # HomesProvider → InventoryProvider, fonts, modal stack
│   ├── index.tsx                 # Home: TopBar + SearchHeader + CategoryStrip + MasonryGrid + ActionCapsule
│   ├── detection.tsx             # Streaming detection screen (SSE)
│   ├── settings.tsx              # Multi-home management
│   ├── profile.tsx               # Profile (name + initials)
│   ├── item/[id].tsx             # Item detail (gallery + notes)
│   └── +not-found.tsx
├── components/                   # Same set as design, ported 1:1
│   ├── ActionCapsule.tsx
│   ├── BoundingBoxOverlay.tsx
│   ├── BoxThumbnail.tsx
│   ├── CategoryStrip.tsx
│   ├── DetectionRow.tsx
│   ├── EditableChip.tsx
│   ├── EmptyState.tsx
│   ├── ErrorBoundary.tsx
│   ├── ErrorFallback.tsx
│   ├── GlowBackdrop.tsx
│   ├── HomePickerSheet.tsx
│   ├── ItemCard.tsx
│   ├── KeyboardAwareScrollViewCompat.tsx
│   ├── MasonryGrid.tsx           # Wraps FlashList v2 masonry mode
│   ├── PrimaryButton.tsx
│   ├── QuickActionsSheet.tsx
│   ├── SearchHeader.tsx
│   └── TopBar.tsx
├── contexts/
│   ├── HomesContext.tsx          # Backed by SQLite + MMKV active id
│   └── InventoryContext.tsx      # Thin wrapper around Drizzle queries + TanStack Query
├── db/
│   ├── client.ts                 # Drizzle + expo-sqlite/next setup
│   ├── schema.ts                 # Tables + FTS5 virtual table
│   └── migrations/               # drizzle-kit generated
├── api/
│   ├── client.ts                 # ofetch instance (auth header, trace context)
│   ├── detect.ts                 # detectImage (sync POST), detectImageStream (SSE)
│   └── types.ts                  # Generated from api-service OpenAPI via @hey-api/openapi-ts
├── observability/
│   ├── sentry.ts                 # Sentry init
│   ├── otel.ts                   # OpenTelemetry SDK + W3C traceparent propagation
│   └── perf.ts                   # expo-performance marks (TTI, scroll, detection RT)
├── hooks/
│   ├── useColors.ts              # Theme colors (palette in constants/colors.ts)
│   └── useResponsive.ts          # sm/md/lg/xl breakpoints, columns, gutters
├── constants/colors.ts           # Enchanted palette
├── stores/                       # Zustand slices (UI-only state)
├── types/inventory.ts            # InventoryItem, Home, Profile, DetectedItem
├── app.json                      # Expo config
├── eas.json                      # EAS Build + Update profiles
├── biome.json
├── tsconfig.json
├── package.json
└── README.md
```

### 4.3 Persistence schema (Drizzle SQLite)

```ts
// db/schema.ts (sketch)
export const homes = sqliteTable("homes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),       // emoji
  createdAt: integer("created_at").notNull(),
});

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  homeId: text("home_id").notNull().references(() => homes.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  primaryPhotoUri: text("primary_photo_uri").notNull(),     // file:// path
  additionalPhotoUris: text("additional_photo_uris", { mode: "json" })
    .$type<string[]>().notNull().default([]),
  // bounding box stored as normalized 0..1 (matches design's `{x,y,width,height}`)
  boxX: real("box_x").notNull(),
  boxY: real("box_y").notNull(),
  boxWidth: real("box_width").notNull(),
  boxHeight: real("box_height").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const itemTags = sqliteTable("item_tags", {
  itemId: text("item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.itemId, t.tag] }),
  itemIdx: index("item_tags_item_idx").on(t.itemId),
  tagIdx: index("item_tags_tag_idx").on(t.tag),
}));

// FTS5 virtual table over label + description + category + tags (concatenated on insert/update via triggers)
// CREATE VIRTUAL TABLE inventory_fts USING fts5(label, description, category, tags, content='', tokenize='porter unicode61');
```

Prefs (MMKV):
- `active_home_id: string`
- `profile: { name: string; initials: string }`
- `last_detection_run_id: string | null` (for crash-recovery resume)

### 4.4 Screens (1:1 with design unless noted)

- **Home (`app/index.tsx`)**: TopBar + persistent SearchHeader + CategoryStrip (live counts + sort cycle) + MasonryGrid (FlashList v2 masonry mode, aspect-aware) + ActionCapsule (Library | glowing Camera | Search-focus). Long-press → QuickActionsSheet.
- **Detection (`app/detection.tsx`)**: three states (loading → streaming → review). Uses `detectImageStream` SSE; items append as they arrive. Hero photo with stats pill, 64px bbox thumbnails, 28px editable chips, per-row save toggle, swipe-to-discard. Race-safe save lifecycle (`savingIds` + `isBulkSaving`). Crash-recovery: if `last_detection_run_id` is set on cold start, re-attaches to that run via `/v1/detect/status/:id`.
- **Settings (`app/settings.tsx`)**: multi-home management (add / rename / delete with confirmation). Empty-list guard: cannot delete last home.
- **Profile (`app/profile.tsx`)**: name + initials.
- **Item detail (`app/item/[id].tsx`)**: gallery + notes card.
- **+not-found**: standard.

### 4.5 State boundaries

- **`HomesContext`**: reads `homes` table on mount, exposes CRUD. Active home id stored in MMKV.
- **`InventoryContext`**: thin wrapper around TanStack Query + Drizzle. Exposes `items` (filtered by active home), `counts` (across all homes), `addItems`, `updateItem`, `deleteItem`, `addPhotoToItem`, `deleteAllInActiveHome`. Photo writes go through `expo-file-system` and dedupe across items from the same capture (one file shared by N items).
- **Zustand stores**: ephemeral UI state only — search query, category filter, sort cycle position, detection screen `savingIds` set.
- **TanStack Query**: detection mutation, search debounce, FTS query.

## 5. Backend changes (`api-service/`)

### 5.1 New endpoint: `POST /v1/detect/stream`

- Multipart, single frame (same parsing as `/v1/detect`).
- Bearer auth (existing middleware).
- Returns `text/event-stream`, emits the same idempotency / pipeline-launch contract as `/v1/detect`, but streams items as `pipeline-service` produces them.
- Event shape:

  ```
  event: meta
  data: {"runId":"...","traceId":"..."}

  event: item
  data: {"label":"Sofa","description":"...","category":"Furniture","tags":["leather","brown"],"box":{"x":0.12,"y":0.34,"width":0.4,"height":0.3}}

  event: item
  data: {...}

  event: done
  data: {"runId":"...","totalItems":7}

  event: error
  data: {"code":"pipeline_failed","message":"..."}
  ```

- Heartbeat: emit `:keepalive\n\n` every 15s to keep proxies from closing.
- Backed by Temporal: subscribes to the workflow's signal/update stream (or polls activity completions if signals aren't yet exposed) and emits SSE frames as items arrive.

### 5.2 Response shape mapping

`api-service` is the single source of truth for the `DetectedItem` shape:

```ts
type DetectedItem = {
  label: string;
  description: string;
  category: string;
  tags: string[];
  box: { x: number; y: number; width: number; height: number };  // 0..1 normalized
};
```

Pipeline-service result fields → `DetectedItem` mapping happens in a route-level mapper (`src/routes/detect.mapper.ts`). Same mapping is used by both `/v1/detect` (sync 200 body) and `/v1/detect/stream` (per-item SSE frame).

### 5.3 OpenAPI spec → mobile codegen

- Annotate Fastify routes with `@fastify/swagger` JSON schemas (already partially present).
- CI step exports `api-service/openapi.json`.
- Mobile build runs `@hey-api/openapi-ts` against that spec to generate `mobile-app/api/types.ts`.
- Single source of truth; mobile types can never drift from the API.

### 5.4 Temporal orchestration

No new orchestration. Reuse the existing Temporal workflow in `pipeline-service`. The SSE endpoint is a Fastify-side adapter that pulls progress out of Temporal and pushes it to the client.

## 6. Observability

### 6.1 Sentry (mobile)

- Errors (JS + native crashes), session replay (mobile), performance traces.
- Tag every event with `home_id`, `screen`, `app_version`, `expo_update_id`.
- Source maps uploaded on EAS Build.

### 6.2 OpenTelemetry (end-to-end)

- Mobile: `@opentelemetry/sdk-trace-web` (RN-compatible) + W3C trace context propagator.
- Detection request span: client root → `traceparent` header → `api-service` route span → `pipeline-service` Temporal span.
- One trace per "tap shutter → see results".
- Exporter on mobile: OTLP/HTTP to the existing OTel Collector in `observability/`. (No direct vendor coupling.)

### 6.3 Logs

- Mobile dev: `consola`.
- Mobile prod: Sentry breadcrumbs only. No app-level log shipping (Sentry is enough; we don't need a separate log pipeline for client logs at this scale).

### 6.4 RUM / vitals

- `expo-performance` marks for: app start TTI, home grid first paint, detection round-trip (tap → first item in stream), full detection complete.
- Reported via Sentry custom transactions and OTel spans.

## 7. Build & deploy

| | Choice |
|---|---|
| Builds | EAS Build (iOS + Android), managed workflow |
| OTA | EAS Update (production + preview channels) |
| Secrets | EAS Secrets (`API_KEY`, `API_BASE_URL`, `SENTRY_DSN`, `OTEL_COLLECTOR_URL`) |
| CI | GitHub Actions: lint (Biome) + typecheck (`tsc --noEmit`) + Vitest unit + EAS Build trigger on tag |
| E2E | Maestro (existing flows in `mobile-app/.maestro/` are ported / rewritten as part of this work) |

## 8. Migration plan (high level)

1. **Backup Flutter** to a single git tag `flutter-final-2026-05-06`, then delete `mobile-app/` contents.
2. Scaffold new Expo app at `mobile-app/` with the directory layout above.
3. Set up Drizzle + expo-sqlite, FTS5 triggers.
4. Port design components 1:1 (TS → TS), replacing AsyncStorage callsites with Drizzle/MMKV.
5. Build screens (`index`, `detection`, `settings`, `profile`, `item/[id]`).
6. Add `/v1/detect/stream` SSE endpoint + response mapper to `api-service`.
7. Generate mobile API types from `api-service/openapi.json`.
8. Wire detection screen to SSE.
9. Sentry + OTel setup, source map upload.
10. EAS Build + Update profiles.
11. Maestro E2E smoke flows: capture → detect → save → search → multi-home switch.

(Detailed sectioned implementation plan follows in `docs/superpowers/plans/`.)

## 9. Testing strategy

- **Unit (Vitest)**: pure logic — Drizzle queries, FTS query builder, response mapper, sort/filter helpers, SSE event parser.
- **Component (Vitest + RN Testing Library)**: stateful components — `MasonryGrid` aspect math, `DetectionRow` swipe + save lifecycle, `CategoryStrip` sort cycle.
- **E2E (Maestro)**: golden path per screen; detection happy path against `api-service` running locally with a mock pipeline.
- **Backend (existing Vitest)**: new SSE route gets unit + integration tests using a fake `PipelineClient`.
- **Trace assertions**: OTel test exporter in CI verifies the detection trace links mobile → api-service → pipeline-service span chain.

## 10. Risks & open questions

| Risk | Mitigation |
|---|---|
| New Architecture (Fabric) compatibility issues with one of the chosen RN libs (Reanimated, Gesture Handler, MMKV, FlashList, Sentry) | All libs listed have New-Arch support as of 2025 H2. Pinned minor versions documented in `package.json`. Verify on first EAS Build. |
| `expo/fetch` SSE: `ReadableStream` parsing on Android ≤ 12 historically flaky | If issues found, fall back to `react-native-sse` (well-maintained polyfill). Decision deferred to implementation, not blocking design. |
| Temporal workflow doesn't yet expose progress signals to api-service for SSE fan-out | Phase 1 of SSE endpoint can poll `pipeline-service` activity completions and emit batched SSE frames; phase 2 switches to native Temporal updates when the workflow exposes them. Either way, the wire contract on the mobile side is unchanged. |
| FTS5 trigger correctness (insert / update / delete keep FTS in sync with `inventory_items` + `item_tags`) | Drizzle migration includes triggers; covered by unit tests on the search path. |
| EAS Build cost for a small team | Acceptable for MVP; revisit if build minutes become a constraint. |

## 11. Out of scope (explicit)

- Cloud sync / multi-device.
- User accounts beyond a single Bearer key.
- On-device ML / CoreML / TFLite (the deleted Flutter section-08 work).
- Burst capture UI (1–3 frames). The backend supports it; the new app sends one frame. Multi-frame UX deferred.
- Background detection retries.

---

## Appendix A — File deletion list (Flutter)

Whole-tree removal of:

```
mobile-app/lib/
mobile-app/android/
mobile-app/ios/
mobile-app/main.dart
mobile-app/pubspec.yaml
mobile-app/pubspec.lock
mobile-app/.dart_tool/
mobile-app/build.yaml
mobile-app/analysis_options.yaml
mobile-app/devtools_options.yaml
mobile-app/integration_test/
mobile-app/test/
mobile-app/coverage/
mobile-app/build/
mobile-app/flutter_*.log
mobile-app/analyze_output.txt
mobile-app/build_and_test_x86.sh
mobile-app/all_my_things.iml
mobile-app/home_inventory.iml
mobile-app/.metadata
mobile-app/.flutter-plugins-dependencies
mobile-app/CLAUDE.md  (will be replaced with RN-specific guidance)
```

Preserved:
- `mobile-app/.maestro/` — flows are rewritten in place.
- `mobile-app/assets/` — image / font assets reused where applicable.
- `mobile-app/.gitignore` — updated for Node/Expo.

## Appendix B — Endpoints summary

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/v1/detect` | Bearer | Multipart 1–3 frames. Sync (200 if idempotent hit) or async (202 + runId). Existing. |
| POST | `/v1/detect/stream` | Bearer | **NEW.** Multipart single frame. SSE response. |
| GET | `/v1/detect/status/:workflowId` | Bearer | Existing. Used by mobile crash-recovery on cold start. |
| GET | `/v1/health` | none | Existing. |
