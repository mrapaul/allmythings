# Mobile App RN/Expo Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-06-mobile-app-rn-rewrite-design.md`](../specs/2026-05-06-mobile-app-rn-rewrite-design.md)

**Goal:** Replace the existing Flutter `mobile-app/` with a React Native + Expo rewrite that ports the design from `design/mobile-app/artifacts/home-inventory/` and wires detection through `api-service` (with a new SSE streaming endpoint) instead of the design's bundled Express/Gemini server.

**Architecture:** Expo SDK 54 / RN 0.81 (New Architecture) on the mobile side; `api-service` (Fastify) gains a `POST /v1/detect/stream` SSE endpoint and a route-level `PipelineDetection → DetectedItem` mapper that becomes the single contract source of truth. `pipeline-service` is unchanged. Mobile uses Drizzle + `expo-sqlite/next` (with FTS5) for storage, TanStack Query v5 for server state, Zustand v5 for UI state, MMKV for prefs, and end-to-end OTel tracing + Sentry.

**Tech Stack:** Expo 54 / RN 0.81 / TypeScript 5.7 / Expo Router v4 / TanStack Query v5 / Zustand v5 / Drizzle 0.36+ / `expo-sqlite/next` / `react-native-mmkv` / `@shopify/flash-list` v2 / Reanimated 3 / Gesture Handler 2 / `ofetch` / Sentry RN 6 / OpenTelemetry JS / Biome 1.9 / Vitest / Maestro / EAS Build + Update.

---

## Section index

| # | Section | What ships |
|---|---|---|
| 0 | Foundation & scaffold | Flutter archived; empty Expo app boots; Biome + TS strict + Vitest green |
| 1 | Theme, colors, fonts, GlowBackdrop | `useColors`, `useResponsive`, GlowBackdrop, font loading |
| 2 | Persistence (Drizzle + SQLite + FTS5) | DB client, schema, FTS5 triggers, repo helpers, unit tests |
| 3 | Domain contexts (Homes + Inventory) | `HomesContext`, `InventoryContext` backed by SQLite + MMKV |
| 4 | Backend: DetectedItem mapper + sync detect mapping | `api-service` returns `DetectedItem[]` from `/v1/detect`; OpenAPI annotated |
| 5 | Backend: `/v1/detect/stream` SSE endpoint | New route; emits `meta` / `item` / `done` / `error` SSE events |
| 6 | API codegen + mobile API client | `@hey-api/openapi-ts` types; `ofetch` client; SSE consumer |
| 7 | UI primitives | TopBar, SearchHeader, CategoryStrip, ActionCapsule, EditableChip, EmptyState, PrimaryButton, KeyboardAwareScrollViewCompat, ErrorBoundary, ErrorFallback |
| 8 | Lists, sheets, home screen | MasonryGrid (FlashList v2), ItemCard, QuickActionsSheet, HomePickerSheet, `app/index.tsx` |
| 9 | Settings / Profile / Item detail screens | `app/settings.tsx`, `app/profile.tsx`, `app/item/[id].tsx` |
| 10 | Detection screen + SSE wiring | DetectionRow, BoxThumbnail, BoundingBoxOverlay, `app/detection.tsx`, crash-resume |
| 11 | Observability + EAS + Maestro + CI | Sentry RN, OTel JS SDK, Maestro flows, EAS Build/Update, GitHub Actions |

Each section ends in a single merge commit (mirroring the existing `section-08`, `section-09`, `section-10` pattern in git history).

---

## Conventions (apply to every task)

- **TDD red-green:** write the failing test first, run it, watch it fail with the exact error you expect, then make it pass.
- **Mobile tests** run with `cd mobile-app && pnpm test` (Vitest, jsdom env for component tests, node env for pure logic).
- **Backend tests** run with `cd api-service && pnpm test`.
- **One commit per completed task** unless a task explicitly says "no commit yet". Commit messages follow the existing repo style: `feat(scope): subject`, `test(scope): subject`, `chore(scope): subject`. Example: `feat(mobile): drizzle schema with FTS5 triggers`.
- **No `console.log` in committed code** — use `consola` (mobile dev) or Sentry breadcrumbs.
- **Biome** is the only formatter/linter on the mobile side; do not also configure ESLint or Prettier there.
- **Imports** in mobile use the `@/` alias mapped to `mobile-app/`.
- **Never** import from `mobile-app/` outside its own boundary; backend changes stay in `api-service/`.

---

# Section 0 — Foundation & scaffold

**Goal:** Archive the Flutter app, scaffold an empty Expo SDK 54 app at `mobile-app/`, get TypeScript strict / Biome / Vitest passing on a trivial test. After this section the app boots to a blank "Hello" screen on iOS simulator and CI is green.

**Files touched (Section 0):**
- Delete: all of `mobile-app/lib/`, `mobile-app/android/`, `mobile-app/ios/`, `mobile-app/main.dart`, `mobile-app/pubspec.yaml`, `mobile-app/pubspec.lock`, `mobile-app/.dart_tool/`, `mobile-app/build.yaml`, `mobile-app/analysis_options.yaml`, `mobile-app/devtools_options.yaml`, `mobile-app/integration_test/`, `mobile-app/test/`, `mobile-app/coverage/`, `mobile-app/build/`, `mobile-app/flutter_*.log`, `mobile-app/analyze_output.txt`, `mobile-app/build_and_test_x86.sh`, `mobile-app/all_my_things.iml`, `mobile-app/home_inventory.iml`, `mobile-app/.metadata`, `mobile-app/.flutter-plugins-dependencies`
- Preserve: `mobile-app/.maestro/`, `mobile-app/assets/`
- Create: `mobile-app/package.json`, `mobile-app/app.json`, `mobile-app/tsconfig.json`, `mobile-app/biome.json`, `mobile-app/vitest.config.ts`, `mobile-app/babel.config.js`, `mobile-app/metro.config.js`, `mobile-app/.gitignore`, `mobile-app/app/_layout.tsx`, `mobile-app/app/index.tsx`, `mobile-app/app/+not-found.tsx`, `mobile-app/CLAUDE.md`, `mobile-app/__tests__/smoke.test.ts`

### Task 0.1: Tag Flutter and remove it

**Files:**
- Delete: enumerated list above

- [ ] **Step 1: Tag the Flutter snapshot**

```bash
git tag -a flutter-final-2026-05-06 -m "Final Flutter snapshot before RN rewrite"
git push origin flutter-final-2026-05-06
```

- [ ] **Step 2: Remove Flutter directories and files**

```bash
cd /Users/mrarindampaul/Develop/allmythings/mobile-app
rm -rf lib android ios .dart_tool integration_test test coverage build .idea
rm -f main.dart pubspec.yaml pubspec.lock build.yaml analysis_options.yaml \
      devtools_options.yaml flutter_*.log analyze_output.txt \
      build_and_test_x86.sh all_my_things.iml home_inventory.iml \
      .metadata .flutter-plugins-dependencies CLAUDE.md
rm -rf .expo .replit-artifact
# preserve .maestro/ and assets/
```

- [ ] **Step 3: Verify only preserved dirs remain**

```bash
ls -la mobile-app
# Expect: .maestro/, assets/, .gitignore  (and nothing Flutter-related)
```

- [ ] **Step 4: Commit**

```bash
git add -A mobile-app/
git commit -m "chore(mobile): remove Flutter app (tagged flutter-final-2026-05-06)"
```

### Task 0.2: Scaffold Expo SDK 54 app

**Files:**
- Create: `mobile-app/package.json`, `mobile-app/app.json`, `mobile-app/tsconfig.json`, `mobile-app/babel.config.js`, `mobile-app/metro.config.js`, `mobile-app/.gitignore`, `mobile-app/app/_layout.tsx`, `mobile-app/app/index.tsx`, `mobile-app/app/+not-found.tsx`

- [ ] **Step 1: Write `mobile-app/package.json`**

```json
{
  "name": "mobile-app",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "web": "expo start --web",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "codegen:api": "openapi-ts -i ../api-service/openapi.json -o api/generated -c @hey-api/client-fetch",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "expo": "~54.0.27",
    "expo-router": "~5.0.0",
    "expo-status-bar": "~2.0.0",
    "expo-constants": "~17.0.0",
    "expo-linking": "~7.0.0",
    "expo-splash-screen": "~0.29.0",
    "expo-system-ui": "~4.0.0",
    "expo-font": "~13.0.0",
    "expo-image": "~2.0.0",
    "expo-image-picker": "~16.0.0",
    "expo-image-manipulator": "~13.0.0",
    "expo-file-system": "~18.0.0",
    "expo-haptics": "~14.0.0",
    "expo-linear-gradient": "~14.0.0",
    "expo-blur": "~14.0.0",
    "expo-sqlite": "~15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-reanimated": "~4.0.0",
    "react-native-svg": "~15.10.0",
    "react-native-safe-area-context": "~4.14.0",
    "react-native-screens": "~4.4.0",
    "@shopify/flash-list": "^2.0.0",
    "@tanstack/react-query": "^5.62.0",
    "zustand": "^5.0.0",
    "drizzle-orm": "^0.36.0",
    "react-native-mmkv": "^3.1.0",
    "ofetch": "^1.4.0",
    "zod": "^3.23.0",
    "consola": "^3.4.0",
    "@sentry/react-native": "^6.0.0",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-trace-web": "^1.30.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.57.0",
    "@opentelemetry/core": "^1.30.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@hey-api/openapi-ts": "^0.64.0",
    "@hey-api/client-fetch": "^0.7.0",
    "@testing-library/react-native": "^12.7.0",
    "@types/react": "~19.0.0",
    "@types/react-test-renderer": "~19.0.0",
    "drizzle-kit": "^0.28.0",
    "react-test-renderer": "19.0.0",
    "typescript": "~5.7.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Write `mobile-app/app.json`**

```json
{
  "expo": {
    "name": "Home Inventory",
    "slug": "home-inventory",
    "scheme": "homeinventory",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#FFF8F0"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.codesparktech.homeinventory"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFF8F0"
      },
      "package": "com.codesparktech.homeinventory"
    },
    "plugins": [
      "expo-router",
      "expo-font",
      "expo-sqlite"
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

- [ ] **Step 3: Write `mobile-app/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "expo-env.d.ts"],
  "exclude": ["node_modules", "dist", "build"]
}
```

- [ ] **Step 4: Write `mobile-app/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

- [ ] **Step 5: Write `mobile-app/metro.config.js`**

```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;
module.exports = config;
```

- [ ] **Step 6: Write `mobile-app/.gitignore`**

```
node_modules/
.expo/
dist/
web-build/
*.log
ios/Pods/
android/.gradle/
android/app/build/
.env
.env.local
.DS_Store
coverage/
api/generated/
db/migrations/
```

- [ ] **Step 7: Write minimal `mobile-app/app/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 8: Write minimal `mobile-app/app/index.tsx`**

```tsx
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Home Inventory</Text>
    </View>
  );
}
```

- [ ] **Step 9: Write `mobile-app/app/+not-found.tsx`**

```tsx
import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>This screen does not exist.</Text>
        <Link href="/">Go home</Link>
      </View>
    </>
  );
}
```

- [ ] **Step 10: Install dependencies**

```bash
cd mobile-app && pnpm install
```

Expected: lockfile written, no errors.

- [ ] **Step 11: Verify the typecheck passes**

```bash
cd mobile-app && pnpm typecheck
```

Expected: exit 0, no diagnostics.

- [ ] **Step 12: Commit**

```bash
git add mobile-app/
git commit -m "feat(mobile): scaffold Expo SDK 54 app skeleton"
```

### Task 0.3: Biome configuration

**Files:**
- Create: `mobile-app/biome.json`

- [ ] **Step 1: Write `mobile-app/biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignore": ["node_modules", "dist", "ios", "android", "api/generated", "db/migrations"]
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "warn",
        "useImportType": "error"
      },
      "suspicious": { "noExplicitAny": "error" },
      "correctness": { "noUnusedImports": "error", "noUnusedVariables": "error" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "always", "trailingCommas": "all" }
  }
}
```

- [ ] **Step 2: Run lint**

```bash
cd mobile-app && pnpm lint
```

Expected: zero diagnostics.

- [ ] **Step 3: Commit**

```bash
git add mobile-app/biome.json
git commit -m "chore(mobile): add Biome config (lint + format)"
```

### Task 0.4: Vitest setup + smoke test

**Files:**
- Create: `mobile-app/vitest.config.ts`, `mobile-app/__tests__/smoke.test.ts`

- [ ] **Step 1: Write the failing test `mobile-app/__tests__/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Write `mobile-app/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx', '**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'ios', 'android', 'dist', 'api/generated'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 3: Run the test**

```bash
cd mobile-app && pnpm test
```

Expected: 1 passed (smoke > runs vitest).

- [ ] **Step 4: Commit**

```bash
git add mobile-app/vitest.config.ts mobile-app/__tests__/smoke.test.ts
git commit -m "test(mobile): add vitest config and smoke test"
```

### Task 0.5: New CLAUDE.md for mobile

**Files:**
- Create: `mobile-app/CLAUDE.md`

- [ ] **Step 1: Write `mobile-app/CLAUDE.md`**

```md
# mobile-app (RN/Expo)

Expo SDK 54 / RN 0.81 / TypeScript / TanStack Query / Zustand / Drizzle + expo-sqlite (FTS5) / Sentry RN / OTel JS.

## Commands
- `pnpm start` – Expo dev server
- `pnpm test` – Vitest
- `pnpm typecheck` – `tsc --noEmit`
- `pnpm lint` / `pnpm lint:fix` – Biome
- `pnpm db:generate` – drizzle-kit migrations
- `pnpm codegen:api` – regenerate API types from `api-service/openapi.json`

## Layout
- `app/` Expo Router routes
- `components/` UI primitives (1:1 ports of `design/mobile-app/artifacts/home-inventory/components/`)
- `contexts/` HomesContext, InventoryContext (SQLite-backed)
- `db/` Drizzle schema + client
- `api/` HTTP client + generated types
- `observability/` Sentry + OTel
- `hooks/`, `constants/`, `stores/`, `types/`

## Testing
Vitest + RN Testing Library for components, pure-JS Vitest for logic. Maestro flows live in `.maestro/`.

## Backend contract
Single source of truth lives in `api-service/openapi.json`. Mobile does not duplicate types; codegen runs in CI.
```

- [ ] **Step 2: Commit**

```bash
git add mobile-app/CLAUDE.md
git commit -m "docs(mobile): CLAUDE.md for new RN app"
```

### Task 0.6: Section 0 merge

- [ ] **Step 1: Verify everything green**

```bash
cd mobile-app && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all three exit 0.

- [ ] **Step 2: Tag and push**

```bash
git tag -a section-rn-00-foundation -m "Section 0: Foundation & scaffold complete"
```

---

# Section 1 — Theme, colors, fonts, GlowBackdrop

**Goal:** Match the design's "enchanted Disney+" visual identity. After this section, `app/index.tsx` shows the GlowBackdrop with cloud-cream background, midnight-ink text, and a "Home Inventory" title in Fraunces serif.

**Files (Section 1):**
- Create: `mobile-app/constants/colors.ts`, `mobile-app/hooks/useColors.ts`, `mobile-app/hooks/useResponsive.ts`, `mobile-app/components/GlowBackdrop.tsx`, `mobile-app/types/inventory.ts`
- Modify: `mobile-app/app/_layout.tsx`, `mobile-app/app/index.tsx`
- Test: `mobile-app/hooks/useResponsive.test.ts`, `mobile-app/components/GlowBackdrop.test.tsx`

### Task 1.1: Port `constants/colors.ts` from design

**Files:**
- Create: `mobile-app/constants/colors.ts`

- [ ] **Step 1: Read the design's palette**

```bash
cat /Users/mrarindampaul/Develop/allmythings/design/mobile-app/artifacts/home-inventory/constants/colors.ts
```

- [ ] **Step 2: Copy to `mobile-app/constants/colors.ts`** (verbatim — palette is the spec)

- [ ] **Step 3: Verify import compiles**

```bash
cd mobile-app && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add mobile-app/constants/colors.ts
git commit -m "feat(mobile): port enchanted palette from design"
```

### Task 1.2: `useColors` hook (test-first)

**Files:**
- Create: `mobile-app/hooks/useColors.ts`, `mobile-app/hooks/useColors.test.ts`

- [ ] **Step 1: Write failing test `mobile-app/hooks/useColors.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { resolveColors } from './useColors';

describe('resolveColors', () => {
  it('returns the light palette for "light"', () => {
    const c = resolveColors('light');
    expect(c.background).toMatch(/^#/);
    expect(c.primary).toMatch(/^#/);
  });

  it('returns the dark palette for "dark"', () => {
    const c = resolveColors('dark');
    expect(c.background).toMatch(/^#/);
    expect(c).not.toEqual(resolveColors('light'));
  });
});
```

- [ ] **Step 2: Run, verify it fails (no module)**

```bash
cd mobile-app && pnpm test hooks/useColors
```

Expected: `Cannot find module './useColors'`.

- [ ] **Step 3: Implement `mobile-app/hooks/useColors.ts`** (port + add `resolveColors` pure helper for testability)

```ts
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/colors';

export type Scheme = 'light' | 'dark';

export function resolveColors(scheme: Scheme) {
  return scheme === 'dark' ? Colors.dark : Colors.light;
}

export function useColors() {
  const scheme = (useColorScheme() ?? 'light') as Scheme;
  return resolveColors(scheme);
}
```

- [ ] **Step 4: Run test — pass**

- [ ] **Step 5: Commit**

```bash
git add mobile-app/hooks/useColors.ts mobile-app/hooks/useColors.test.ts
git commit -m "feat(mobile): useColors hook + tests"
```

### Task 1.3: `useResponsive` hook (test-first)

**Files:**
- Create: `mobile-app/hooks/useResponsive.ts`, `mobile-app/hooks/useResponsive.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { resolveResponsive } from './useResponsive';

describe('resolveResponsive', () => {
  it('sm < md < lg < xl breakpoints map correctly', () => {
    expect(resolveResponsive(320).breakpoint).toBe('sm');
    expect(resolveResponsive(600).breakpoint).toBe('md');
    expect(resolveResponsive(1000).breakpoint).toBe('lg');
    expect(resolveResponsive(1400).breakpoint).toBe('xl');
  });

  it('column count grows with width', () => {
    expect(resolveResponsive(320).columns).toBe(2);
    expect(resolveResponsive(600).columns).toBe(3);
    expect(resolveResponsive(1000).columns).toBe(4);
    expect(resolveResponsive(1400).columns).toBeGreaterThanOrEqual(5);
  });

  it('content max-width clamps on lg/xl', () => {
    expect(resolveResponsive(1000).contentMaxWidth).toBeLessThanOrEqual(920);
    expect(resolveResponsive(1400).contentMaxWidth).toBeLessThanOrEqual(1100);
  });
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement** (`mobile-app/hooks/useResponsive.ts`)

```ts
import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface Responsive {
  breakpoint: Breakpoint;
  columns: number;
  gutter: number;
  cardGap: number;
  contentMaxWidth: number;
  capsuleMaxWidth: number;
  width: number;
}

export function resolveResponsive(width: number): Responsive {
  let breakpoint: Breakpoint = 'sm';
  if (width >= 1280) breakpoint = 'xl';
  else if (width >= 900) breakpoint = 'lg';
  else if (width >= 600) breakpoint = 'md';

  const columns = breakpoint === 'sm' ? 2 : breakpoint === 'md' ? 3 : breakpoint === 'lg' ? 4 : 5;
  const gutter = breakpoint === 'sm' ? 12 : 16;
  const cardGap = breakpoint === 'sm' ? 10 : 14;
  const contentMaxWidth = breakpoint === 'xl' ? 1100 : breakpoint === 'lg' ? 920 : width;
  const capsuleMaxWidth = Math.min(width - 24, 460);

  return { breakpoint, columns, gutter, cardGap, contentMaxWidth, capsuleMaxWidth, width };
}

export function useResponsive(): Responsive {
  const { width } = useWindowDimensions();
  return resolveResponsive(width);
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add mobile-app/hooks/useResponsive.ts mobile-app/hooks/useResponsive.test.ts
git commit -m "feat(mobile): useResponsive hook with breakpoints"
```

### Task 1.4: Port `types/inventory.ts`

**Files:**
- Create: `mobile-app/types/inventory.ts`

- [ ] **Step 1: Write `mobile-app/types/inventory.ts`** (port + tighten)

```ts
export interface Home {
  id: string;
  name: string;
  icon: string;        // emoji
  createdAt: number;   // epoch ms
}

export interface Profile {
  name: string;
  initials: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InventoryItem {
  id: string;
  homeId: string;
  label: string;
  description: string;
  category: string;
  tags: string[];
  primaryPhotoUri: string;
  additionalPhotoUris: string[];
  notes: string;
  box: BoundingBox;
  createdAt: number;
  updatedAt: number;
}

export interface DetectedItem {
  label: string;
  description: string;
  category: string;
  tags: string[];
  box: BoundingBox;
}
```

- [ ] **Step 2: typecheck passes**
- [ ] **Step 3: Commit**

```bash
git add mobile-app/types/inventory.ts
git commit -m "feat(mobile): inventory + detection types"
```

### Task 1.5: GlowBackdrop component (test-first)

**Files:**
- Create: `mobile-app/components/GlowBackdrop.tsx`, `mobile-app/components/GlowBackdrop.test.tsx`

- [ ] **Step 1: Switch tsx tests to jsdom — update `mobile-app/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    environment: 'node',
    globals: false,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'ios', 'android', 'dist', 'api/generated'],
    coverage: { provider: 'v8' },
    setupFiles: ['./__tests__/setup-rn.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

- [ ] **Step 2: Add RN test setup `mobile-app/__tests__/setup-rn.ts`**

```ts
import { vi } from 'vitest';
// jest is referenced by RN testing-library internals
(globalThis as unknown as { jest: typeof vi }).jest = vi;
```

- [ ] **Step 3: Write failing test `mobile-app/components/GlowBackdrop.test.tsx`**

```tsx
import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import GlowBackdrop from './GlowBackdrop';

describe('GlowBackdrop', () => {
  it('renders without throwing', () => {
    const tree = render(<GlowBackdrop />).toJSON();
    expect(tree).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run, watch test fail (no `GlowBackdrop` module)**

- [ ] **Step 5: Port `mobile-app/components/GlowBackdrop.tsx`** from design (no behavior change), substituting `Colors` import path. Reference: `design/mobile-app/artifacts/home-inventory/components/GlowBackdrop.tsx`. Replace `import { Colors } from '../constants/colors'` with `import { Colors } from '@/constants/colors'`.

- [ ] **Step 6: Run — pass**

- [ ] **Step 7: Commit**

```bash
git add mobile-app/components/GlowBackdrop.tsx mobile-app/components/GlowBackdrop.test.tsx mobile-app/vitest.config.ts mobile-app/__tests__/setup-rn.ts
git commit -m "feat(mobile): GlowBackdrop + jsdom test env for tsx"
```

### Task 1.6: Wire fonts + GlowBackdrop into root layout

**Files:**
- Modify: `mobile-app/app/_layout.tsx`, `mobile-app/app/index.tsx`

- [ ] **Step 1: Install Google Fonts packages (mirror design's setup)**

```bash
cd mobile-app && pnpm add @expo-google-fonts/fraunces @expo-google-fonts/inter
```

- [ ] **Step 2: Update `mobile-app/app/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';
import { useFonts, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 3: Update `mobile-app/app/index.tsx`**

```tsx
import { Text, View } from 'react-native';
import GlowBackdrop from '@/components/GlowBackdrop';
import { useColors } from '@/hooks/useColors';

export default function Index() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlowBackdrop />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text, fontFamily: 'Fraunces_700Bold', fontSize: 28 }}>
          Home Inventory
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: typecheck + lint pass**

- [ ] **Step 5: Commit**

```bash
git add mobile-app/app/_layout.tsx mobile-app/app/index.tsx mobile-app/package.json mobile-app/pnpm-lock.yaml
git commit -m "feat(mobile): font loading + GlowBackdrop on home"
```

### Task 1.7: Section 1 merge

```bash
cd mobile-app && pnpm lint && pnpm typecheck && pnpm test
git tag -a section-rn-01-theme -m "Section 1: theme, fonts, GlowBackdrop"
```

---

# Section 2 — Persistence (Drizzle + expo-sqlite + FTS5)

**Goal:** Type-safe SQLite database with FTS5 search across `label + description + category + tags`. After this section, repository functions can `addItems`, `getItemsByHome`, `searchItems`, `deleteItem`, with full-text search hitting FTS5. Comprehensive unit tests using `better-sqlite3` in-memory.

**Files (Section 2):**
- Create: `mobile-app/db/client.ts`, `mobile-app/db/schema.ts`, `mobile-app/db/migrations/0000_init.sql` (drizzle-kit output), `mobile-app/db/triggers.ts`, `mobile-app/db/repository.ts`, `mobile-app/db/repository.test.ts`, `mobile-app/db/test-helpers.ts`, `mobile-app/drizzle.config.ts`

### Task 2.1: Drizzle schema

**Files:**
- Create: `mobile-app/db/schema.ts`, `mobile-app/drizzle.config.ts`

- [ ] **Step 1: Write `mobile-app/db/schema.ts`**

```ts
import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';

export const homes = sqliteTable('homes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    id: text('id').primaryKey(),
    homeId: text('home_id').notNull().references(() => homes.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull(),
    primaryPhotoUri: text('primary_photo_uri').notNull(),
    additionalPhotoUris: text('additional_photo_uris', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    boxX: real('box_x').notNull(),
    boxY: real('box_y').notNull(),
    boxWidth: real('box_width').notNull(),
    boxHeight: real('box_height').notNull(),
    notes: text('notes').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    homeIdx: index('inventory_items_home_idx').on(t.homeId),
    createdAtIdx: index('inventory_items_created_at_idx').on(t.createdAt),
  }),
);

export const itemTags = sqliteTable(
  'item_tags',
  {
    itemId: text('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId, t.tag] }),
    itemIdx: index('item_tags_item_idx').on(t.itemId),
    tagIdx: index('item_tags_tag_idx').on(t.tag),
  }),
);

export type HomeRow = typeof homes.$inferSelect;
export type ItemRow = typeof inventoryItems.$inferSelect;
export type TagRow = typeof itemTags.$inferSelect;
```

- [ ] **Step 2: Write `mobile-app/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
});
```

- [ ] **Step 3: Generate the initial migration**

```bash
cd mobile-app && pnpm db:generate
```

Expected: a new file under `mobile-app/db/migrations/0000_<name>.sql` with `CREATE TABLE …` for `homes`, `inventory_items`, `item_tags` plus indexes.

- [ ] **Step 4: typecheck**
- [ ] **Step 5: Commit**

```bash
git add mobile-app/db/schema.ts mobile-app/drizzle.config.ts mobile-app/db/migrations
git commit -m "feat(mobile): drizzle schema + initial migration"
```

### Task 2.2: FTS5 virtual table + triggers (as a TS module of SQL strings)

**Files:**
- Create: `mobile-app/db/triggers.ts`

- [ ] **Step 1: Write `mobile-app/db/triggers.ts`**

```ts
// Additional DDL applied after the drizzle migration. Splitting per-statement
// is required for any SQLite client that runs single-statement prepared
// statements (most of them).
export const FTS_STATEMENTS: string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS inventory_fts USING fts5(
     item_id UNINDEXED,
     label,
     description,
     category,
     tags,
     tokenize = 'porter unicode61'
   );`,

  `CREATE TRIGGER IF NOT EXISTS inventory_items_ai
   AFTER INSERT ON inventory_items
   BEGIN
     INSERT INTO inventory_fts (item_id, label, description, category, tags)
     VALUES (
       NEW.id,
       NEW.label,
       NEW.description,
       NEW.category,
       COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.id), '')
     );
   END;`,

  `CREATE TRIGGER IF NOT EXISTS inventory_items_au
   AFTER UPDATE ON inventory_items
   BEGIN
     DELETE FROM inventory_fts WHERE item_id = OLD.id;
     INSERT INTO inventory_fts (item_id, label, description, category, tags)
     VALUES (
       NEW.id,
       NEW.label,
       NEW.description,
       NEW.category,
       COALESCE((SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.id), '')
     );
   END;`,

  `CREATE TRIGGER IF NOT EXISTS inventory_items_ad
   AFTER DELETE ON inventory_items
   BEGIN
     DELETE FROM inventory_fts WHERE item_id = OLD.id;
   END;`,

  `CREATE TRIGGER IF NOT EXISTS item_tags_ai
   AFTER INSERT ON item_tags
   BEGIN
     UPDATE inventory_fts
        SET tags = COALESCE(
          (SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = NEW.item_id), ''
        )
      WHERE item_id = NEW.item_id;
   END;`,

  `CREATE TRIGGER IF NOT EXISTS item_tags_ad
   AFTER DELETE ON item_tags
   BEGIN
     UPDATE inventory_fts
        SET tags = COALESCE(
          (SELECT GROUP_CONCAT(tag, ' ') FROM item_tags WHERE item_id = OLD.item_id), ''
        )
      WHERE item_id = OLD.item_id;
   END;`,
];
```

- [ ] **Step 2: Commit**

```bash
git add mobile-app/db/triggers.ts
git commit -m "feat(mobile): FTS5 virtual table + sync triggers as TS module"
```

### Task 2.3: DB client (uses Drizzle's expo-sqlite migrator)

**Files:**
- Create: `mobile-app/db/client.ts`

- [ ] **Step 1: Write `mobile-app/db/client.ts`**

```ts
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from './migrations/migrations';
import * as schema from './schema';
import { FTS_STATEMENTS } from './triggers';

let _db: ExpoSQLiteDatabase<typeof schema> | null = null;

export function getDb(): ExpoSQLiteDatabase<typeof schema> {
  if (_db) return _db;
  const sqlite: SQLiteDatabase = openDatabaseSync('home-inventory.db', {
    enableChangeListener: true,
  });
  const db = drizzle(sqlite, { schema, logger: false });
  // Drizzle generates migrations/migrations.ts when you run `db:generate`;
  // it bundles all .sql files into a single async migrator.
  void migrate(db, migrations);

  // Apply FTS5 / trigger DDL via Drizzle raw runner — IDEMPOTENT (uses IF NOT EXISTS).
  for (const stmt of FTS_STATEMENTS) {
    void db.run(stmt as unknown as never);
  }
  _db = db;
  return db;
}

export { schema };
```

- [ ] **Step 2: After running `pnpm db:generate`** drizzle-kit emits `db/migrations/migrations.ts` along with the SQL files; nothing to write by hand here.

- [ ] **Step 3: typecheck**

- [ ] **Step 4: Commit**

```bash
git add mobile-app/db/client.ts
git commit -m "feat(mobile): drizzle expo-sqlite client + migrator + FTS init"
```

### Task 2.4: Repository (test-first, against `better-sqlite3` in tests)

**Files:**
- Create: `mobile-app/db/repository.ts`, `mobile-app/db/repository.test.ts`, `mobile-app/db/test-helpers.ts`

- [ ] **Step 1: Add `better-sqlite3` for tests**

```bash
cd mobile-app && pnpm add -D better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Write `mobile-app/db/test-helpers.ts`**

```ts
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import fs from 'node:fs';
import path from 'node:path';
import { FTS_STATEMENTS } from './triggers';

export function makeTestDb(): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  // Apply drizzle-kit's generated migration directly (single .sql file).
  const migrationDir = path.resolve(__dirname, './migrations');
  const sqlFiles = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    // drizzle separates statements with "--> statement-breakpoint"
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim();
      if (t) sqlite.prepare(t).run();
    }
  }
  for (const stmt of FTS_STATEMENTS) sqlite.prepare(stmt).run();
  return drizzle(sqlite, { schema, logger: false });
}
```

- [ ] **Step 3: Write failing test `mobile-app/db/repository.test.ts`**

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { makeTestDb } from './test-helpers';
import { Repo } from './repository';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

describe('Repo', () => {
  let db: BetterSQLite3Database<typeof schema>;
  let repo: Repo;

  beforeEach(() => {
    db = makeTestDb();
    repo = new Repo(db);
  });

  it('addHome + listHomes', async () => {
    const h = await repo.addHome({ name: 'My Home', icon: '🏡' });
    expect(h.id).toBeTruthy();
    const homes = await repo.listHomes();
    expect(homes).toHaveLength(1);
    expect(homes[0]?.name).toBe('My Home');
  });

  it('addItem populates FTS and search returns the item', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    await repo.addItems(h.id, [
      {
        label: 'Sofa',
        description: 'Brown leather couch',
        category: 'Furniture',
        tags: ['leather', 'brown'],
        primaryPhotoUri: 'file:///a.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.5, height: 0.5 },
      },
    ]);
    const hits = await repo.searchItems(h.id, 'leather');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.label).toBe('Sofa');
  });

  it('updateItem updates the FTS row', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'Lamp',
        description: '',
        category: 'Lighting',
        tags: ['brass'],
        primaryPhotoUri: 'file:///b.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.2, height: 0.2 },
      },
    ]);
    await repo.updateItem(id, { description: 'Vintage brass floor lamp' });
    const hits = await repo.searchItems(h.id, 'vintage');
    expect(hits[0]?.id).toBe(id);
  });

  it('deleteItem removes the FTS row', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'Chair',
        description: 'Oak chair',
        category: 'Furniture',
        tags: [],
        primaryPhotoUri: 'file:///c.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.3, height: 0.3 },
      },
    ]);
    await repo.deleteItem(id);
    const hits = await repo.searchItems(h.id, 'oak');
    expect(hits).toHaveLength(0);
  });

  it('counts groups by homeId', async () => {
    const h1 = await repo.addHome({ name: 'A', icon: '🏠' });
    const h2 = await repo.addHome({ name: 'B', icon: '🏡' });
    await repo.addItems(h1.id, [
      {
        label: 'X',
        description: '',
        category: 'Misc',
        tags: [],
        primaryPhotoUri: '',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.1, height: 0.1 },
      },
    ]);
    expect((await repo.counts())[h1.id]).toBe(1);
    expect((await repo.counts())[h2.id] ?? 0).toBe(0);
  });
});
```

- [ ] **Step 4: Run, all 5 tests fail with `Cannot find module './repository'`**

- [ ] **Step 5: Implement `mobile-app/db/repository.ts`**

```ts
import { and, eq, sql, desc } from 'drizzle-orm';
import { homes, inventoryItems, itemTags } from './schema';
import type { Home, InventoryItem } from '@/types/inventory';

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export interface AddItemInput {
  label: string;
  description: string;
  category: string;
  tags: string[];
  primaryPhotoUri: string;
  additionalPhotoUris: string[];
  notes: string;
  box: { x: number; y: number; width: number; height: number };
}

// Drizzle's row-level db type varies between expo-sqlite and better-sqlite3
// drivers. Repo's surface is identical against either; we accept the broader
// any here to keep DI simple and tests fast.
type DrizzleLike = {
  insert: (...a: unknown[]) => any;
  select: (...a: unknown[]) => any;
  update: (...a: unknown[]) => any;
  delete: (...a: unknown[]) => any;
  transaction: (fn: (tx: any) => Promise<unknown>) => Promise<unknown>;
  run: (q: unknown) => any;
};

export class Repo {
  constructor(private db: DrizzleLike) {}

  async addHome(input: { name: string; icon: string }): Promise<Home> {
    const home: Home = {
      id: newId(),
      name: input.name.trim() || 'New Home',
      icon: input.icon || '🏠',
      createdAt: Date.now(),
    };
    await this.db.insert(homes).values(home);
    return home;
  }

  async listHomes(): Promise<Home[]> {
    return await this.db.select().from(homes).orderBy(homes.createdAt);
  }

  async renameHome(id: string, name: string, icon: string): Promise<void> {
    await this.db.update(homes).set({ name: name.trim(), icon }).where(eq(homes.id, id));
  }

  async deleteHome(id: string): Promise<void> {
    await this.db.delete(homes).where(eq(homes.id, id));
  }

  async addItems(homeId: string, items: AddItemInput[]): Promise<string[]> {
    const ids: string[] = [];
    const now = Date.now();
    for (const it of items) {
      const id = newId();
      ids.push(id);
      await this.db.transaction(async (tx) => {
        await tx.insert(inventoryItems).values({
          id,
          homeId,
          label: it.label,
          description: it.description,
          category: it.category,
          primaryPhotoUri: it.primaryPhotoUri,
          additionalPhotoUris: it.additionalPhotoUris,
          notes: it.notes,
          boxX: it.box.x,
          boxY: it.box.y,
          boxWidth: it.box.width,
          boxHeight: it.box.height,
          createdAt: now,
          updatedAt: now,
        });
        if (it.tags.length > 0) {
          await tx.insert(itemTags).values(it.tags.map((tag) => ({ itemId: id, tag })));
        }
      });
    }
    return ids;
  }

  async getItemsByHome(homeId: string): Promise<InventoryItem[]> {
    const rows = await this.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.homeId, homeId))
      .orderBy(desc(inventoryItems.createdAt));
    return Promise.all(rows.map((r: any) => this.hydrateItem(r)));
  }

  async getItem(id: string): Promise<InventoryItem | null> {
    const rows = await this.db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (rows.length === 0) return null;
    return this.hydrateItem(rows[0]);
  }

  async updateItem(id: string, patch: Partial<InventoryItem>): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const k of [
      'label',
      'description',
      'category',
      'primaryPhotoUri',
      'additionalPhotoUris',
      'notes',
    ] as const) {
      if (patch[k] !== undefined) updates[k] = patch[k];
    }
    if (patch.box) {
      updates.boxX = patch.box.x;
      updates.boxY = patch.box.y;
      updates.boxWidth = patch.box.width;
      updates.boxHeight = patch.box.height;
    }
    await this.db.transaction(async (tx) => {
      await tx.update(inventoryItems).set(updates).where(eq(inventoryItems.id, id));
      if (patch.tags) {
        await tx.delete(itemTags).where(eq(itemTags.itemId, id));
        if (patch.tags.length > 0) {
          await tx.insert(itemTags).values(patch.tags.map((tag) => ({ itemId: id, tag })));
        }
      }
    });
  }

  async deleteItem(id: string): Promise<void> {
    await this.db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  }

  async deleteAllInHome(homeId: string): Promise<void> {
    await this.db.delete(inventoryItems).where(eq(inventoryItems.homeId, homeId));
  }

  async counts(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ homeId: inventoryItems.homeId, n: sql<number>`COUNT(*)` })
      .from(inventoryItems)
      .groupBy(inventoryItems.homeId);
    const out: Record<string, number> = {};
    for (const r of rows as { homeId: string; n: number }[]) out[r.homeId] = Number(r.n);
    return out;
  }

  async searchItems(homeId: string, query: string): Promise<InventoryItem[]> {
    const q = query.trim();
    if (!q) return this.getItemsByHome(homeId);
    const ftsRows = await this.db.run(
      sql`SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH ${q + '*'} LIMIT 200`,
    );
    const ids = (ftsRows.rows ?? []).map((r: any) => r.item_id as string);
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.homeId, homeId), sql`${inventoryItems.id} IN ${ids}`));
    return Promise.all(rows.map((r: any) => this.hydrateItem(r)));
  }

  private async hydrateItem(row: any): Promise<InventoryItem> {
    const tags = (
      await this.db.select().from(itemTags).where(eq(itemTags.itemId, row.id))
    ).map((t: any) => t.tag);
    return {
      id: row.id,
      homeId: row.homeId,
      label: row.label,
      description: row.description,
      category: row.category,
      primaryPhotoUri: row.primaryPhotoUri,
      additionalPhotoUris: row.additionalPhotoUris,
      notes: row.notes,
      tags,
      box: { x: row.boxX, y: row.boxY, width: row.boxWidth, height: row.boxHeight },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
```

- [ ] **Step 6: Run tests — all 5 pass**

- [ ] **Step 7: Commit**

```bash
git add mobile-app/db/repository.ts mobile-app/db/repository.test.ts mobile-app/db/test-helpers.ts mobile-app/package.json mobile-app/pnpm-lock.yaml
git commit -m "feat(mobile): repository with FTS5-backed search + tests"
```

### Task 2.5: Section 2 merge

```bash
cd mobile-app && pnpm lint && pnpm typecheck && pnpm test
git tag -a section-rn-02-persistence -m "Section 2: drizzle + sqlite + FTS5"
```

---

# Section 3 — Domain contexts (Homes + Inventory)

**Goal:** `HomesContext` and `InventoryContext` backed by SQLite via `Repo`, plus MMKV for `active_home_id` + `profile`. Components consume hooks (`useHomes`, `useInventory`) with the same surface as the design.

**Files (Section 3):**
- Create: `mobile-app/contexts/HomesContext.tsx`, `mobile-app/contexts/InventoryContext.tsx`, `mobile-app/contexts/HomesContext.test.tsx`, `mobile-app/contexts/InventoryContext.test.tsx`, `mobile-app/stores/prefs.ts`, `mobile-app/stores/prefs.test.ts`, `mobile-app/services/photo-storage.ts`, `mobile-app/services/photo-storage.test.ts`
- Modify: `mobile-app/app/_layout.tsx`

### Task 3.1: MMKV prefs store

**Files:**
- Create: `mobile-app/stores/prefs.ts`, `mobile-app/stores/prefs.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { Prefs } from './prefs';

describe('Prefs (in-memory backend)', () => {
  it('stores active home id', () => {
    const p = Prefs.makeInMemory();
    expect(p.getActiveHomeId()).toBeNull();
    p.setActiveHomeId('h1');
    expect(p.getActiveHomeId()).toBe('h1');
  });

  it('stores profile', () => {
    const p = Prefs.makeInMemory();
    p.setProfile({ name: 'You', initials: 'Y' });
    expect(p.getProfile()).toEqual({ name: 'You', initials: 'Y' });
  });
});
```

- [ ] **Step 2: Implement `mobile-app/stores/prefs.ts`**

```ts
import type { Profile } from '@/types/inventory';

export interface KVBackend {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

const KEY_ACTIVE_HOME = 'active_home_id';
const KEY_PROFILE = 'profile';
const KEY_LAST_DETECTION_RUN = 'last_detection_run_id';

export class Prefs {
  constructor(private kv: KVBackend) {}

  static makeInMemory(): Prefs {
    const m = new Map<string, string>();
    return new Prefs({
      getString: (k) => m.get(k),
      set: (k, v) => void m.set(k, v),
      delete: (k) => void m.delete(k),
    });
  }

  static makeMmkv(): Prefs {
    const { MMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const storage = new MMKV({ id: 'home-inventory.prefs' });
    return new Prefs({
      getString: (k) => storage.getString(k),
      set: (k, v) => storage.set(k, v),
      delete: (k) => storage.delete(k),
    });
  }

  getActiveHomeId(): string | null {
    return this.kv.getString(KEY_ACTIVE_HOME) ?? null;
  }
  setActiveHomeId(id: string): void {
    this.kv.set(KEY_ACTIVE_HOME, id);
  }

  getProfile(): Profile | null {
    const raw = this.kv.getString(KEY_PROFILE);
    return raw ? (JSON.parse(raw) as Profile) : null;
  }
  setProfile(p: Profile): void {
    this.kv.set(KEY_PROFILE, JSON.stringify(p));
  }

  getLastDetectionRunId(): string | null {
    return this.kv.getString(KEY_LAST_DETECTION_RUN) ?? null;
  }
  setLastDetectionRunId(id: string | null): void {
    if (id) this.kv.set(KEY_LAST_DETECTION_RUN, id);
    else this.kv.delete(KEY_LAST_DETECTION_RUN);
  }
}
```

- [ ] **Step 3: Run tests — pass**
- [ ] **Step 4: Commit**

```bash
git add mobile-app/stores/prefs.ts mobile-app/stores/prefs.test.ts
git commit -m "feat(mobile): prefs store (MMKV + in-memory backend)"
```

### Task 3.2: Photo storage service

**Files:**
- Create: `mobile-app/services/photo-storage.ts`, `mobile-app/services/photo-storage.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { PhotoStorage, type FileSystemPort } from './photo-storage';

function makeFs(): FileSystemPort & { copies: Array<{ from: string; to: string }> } {
  const copies: Array<{ from: string; to: string }> = [];
  return {
    documentDirectory: 'file:///doc/',
    copies,
    async ensureDir() {},
    async copy(args) {
      copies.push(args);
    },
  };
}

describe('PhotoStorage', () => {
  it('copies a photo into inventory dir under a deterministic name', async () => {
    const fs = makeFs();
    const ps = new PhotoStorage(fs);
    const dest = await ps.savePhoto('file:///cache/IMG_0001.jpg', 'photo_1');
    expect(dest).toBe('file:///doc/inventory/photo_1.jpg');
    expect(fs.copies).toEqual([{ from: 'file:///cache/IMG_0001.jpg', to: dest }]);
  });

  it('falls back to source uri when copy fails', async () => {
    const ps = new PhotoStorage({
      documentDirectory: 'file:///doc/',
      ensureDir: async () => {},
      copy: async () => {
        throw new Error('nope');
      },
    });
    const out = await ps.savePhoto('file:///source.jpg', 'p');
    expect(out).toBe('file:///source.jpg');
  });
});
```

- [ ] **Step 2: Implement `mobile-app/services/photo-storage.ts`**

```ts
export interface FileSystemPort {
  documentDirectory: string;
  ensureDir(path: string): Promise<void>;
  copy(args: { from: string; to: string }): Promise<void>;
}

const SAFE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);

export class PhotoStorage {
  constructor(private fs: FileSystemPort) {}

  static fromExpo(): PhotoStorage {
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    return new PhotoStorage({
      documentDirectory: FileSystem.documentDirectory ?? '',
      async ensureDir(path) {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) await FileSystem.makeDirectoryAsync(path, { intermediates: true });
      },
      async copy({ from, to }) {
        await FileSystem.copyAsync({ from, to });
      },
    });
  }

  async savePhoto(sourceUri: string, name: string): Promise<string> {
    const dir = `${this.fs.documentDirectory}inventory/`;
    await this.fs.ensureDir(dir);
    const ext = (sourceUri.split('.').pop() ?? 'jpg').split('?')[0]?.toLowerCase() ?? 'jpg';
    const safe = SAFE_EXT.has(ext) ? ext : 'jpg';
    const dest = `${dir}${name}.${safe}`;
    try {
      await this.fs.copy({ from: sourceUri, to: dest });
      return dest;
    } catch {
      return sourceUri;
    }
  }
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add mobile-app/services/photo-storage.ts mobile-app/services/photo-storage.test.ts
git commit -m "feat(mobile): photo storage service with port for testability"
```

### Task 3.3: HomesContext

**Files:**
- Create: `mobile-app/contexts/HomesContext.tsx`, `mobile-app/contexts/HomesContext.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { Text } from 'react-native';
import { HomesProvider, useHomes } from './HomesContext';
import { Repo } from '@/db/repository';
import { makeTestDb } from '@/db/test-helpers';
import { Prefs } from '@/stores/prefs';

function Probe() {
  const h = useHomes();
  return <Text>{h.isLoading ? 'L' : `${h.homes.length}:${h.activeHomeId ?? ''}`}</Text>;
}

describe('HomesContext', () => {
  it('seeds a default home on first launch', async () => {
    const repo = new Repo(makeTestDb());
    const prefs = Prefs.makeInMemory();
    const { findByText } = render(
      <HomesProvider repo={repo} prefs={prefs}>
        <Probe />
      </HomesProvider>,
    );
    const t = await findByText(/^1:/);
    expect(t).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement `mobile-app/contexts/HomesContext.tsx`** — DI-friendly: takes `repo` + `prefs`. Production root layout wires `Repo(getDb())` + `Prefs.makeMmkv()`.

```tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Home, Profile } from '@/types/inventory';
import type { Repo } from '@/db/repository';
import { Prefs } from '@/stores/prefs';

interface HomesContextValue {
  homes: Home[];
  activeHomeId: string | null;
  activeHome: Home | null;
  profile: Profile;
  setActiveHomeId: (id: string) => Promise<void>;
  addHome: (name: string, icon: string) => Promise<Home>;
  renameHome: (id: string, name: string, icon: string) => Promise<void>;
  deleteHome: (id: string) => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  isLoading: boolean;
}

const HomesContext = createContext<HomesContextValue | undefined>(undefined);
const DEFAULT_PROFILE: Profile = { name: 'You', initials: 'Y' };

interface ProviderProps {
  repo: Repo;
  prefs: Prefs;
  children: ReactNode;
}

export function HomesProvider({ repo, prefs, children }: ProviderProps) {
  const [homes, setHomes] = useState<Home[]>([]);
  const [activeHomeId, setActiveHomeIdState] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      let current = await repo.listHomes();
      if (current.length === 0) {
        const seed = await repo.addHome({ name: 'My Home', icon: '🏡' });
        current = [seed];
        prefs.setActiveHomeId(seed.id);
      }
      setHomes(current);

      const stored = prefs.getActiveHomeId();
      const active = stored && current.some((h) => h.id === stored)
        ? stored
        : current[0]?.id ?? null;
      setActiveHomeIdState(active);
      if (active) prefs.setActiveHomeId(active);

      const p = prefs.getProfile();
      if (p) setProfile(p);

      setIsLoading(false);
    })();
  }, [repo, prefs]);

  const setActiveHomeId: HomesContextValue['setActiveHomeId'] = async (id) => {
    setActiveHomeIdState(id);
    prefs.setActiveHomeId(id);
  };

  const addHome: HomesContextValue['addHome'] = async (name, icon) => {
    const h = await repo.addHome({ name, icon });
    setHomes((prev) => [...prev, h]);
    await setActiveHomeId(h.id);
    return h;
  };

  const renameHome: HomesContextValue['renameHome'] = async (id, name, icon) => {
    await repo.renameHome(id, name, icon);
    setHomes((prev) =>
      prev.map((h) => (h.id === id ? { ...h, name: name.trim() || h.name, icon: icon || h.icon } : h)),
    );
  };

  const deleteHome: HomesContextValue['deleteHome'] = async (id) => {
    if (homes.length <= 1) return;
    await repo.deleteHome(id);
    const next = homes.filter((h) => h.id !== id);
    setHomes(next);
    if (activeHomeId === id) await setActiveHomeId(next[0]!.id);
  };

  const updateProfile: HomesContextValue['updateProfile'] = async (next) => {
    setProfile(next);
    prefs.setProfile(next);
  };

  const activeHome = useMemo(
    () => homes.find((h) => h.id === activeHomeId) ?? null,
    [homes, activeHomeId],
  );

  return (
    <HomesContext.Provider
      value={{
        homes,
        activeHomeId,
        activeHome,
        profile,
        setActiveHomeId,
        addHome,
        renameHome,
        deleteHome,
        updateProfile,
        isLoading,
      }}
    >
      {children}
    </HomesContext.Provider>
  );
}

export function useHomes(): HomesContextValue {
  const v = useContext(HomesContext);
  if (!v) throw new Error('useHomes outside HomesProvider');
  return v;
}
```

- [ ] **Step 3: Run, pass**
- [ ] **Step 4: Commit**

```bash
git add mobile-app/contexts/HomesContext.tsx mobile-app/contexts/HomesContext.test.tsx
git commit -m "feat(mobile): HomesContext with SQLite-backed Repo + MMKV prefs"
```

### Task 3.4: InventoryContext

**Files:**
- Create: `mobile-app/contexts/InventoryContext.tsx`, `mobile-app/contexts/InventoryContext.test.tsx`

- [ ] **Step 1: Write failing test** — covers `addItems` (with photo dedupe by source URI), `updateItem`, `deleteItem`, `counts`.

```tsx
import { describe, expect, it } from 'vitest';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { InventoryProvider, useInventory } from './InventoryContext';
import { HomesProvider } from './HomesContext';
import { Repo } from '@/db/repository';
import { makeTestDb } from '@/db/test-helpers';
import { Prefs } from '@/stores/prefs';
import { PhotoStorage } from '@/services/photo-storage';

function Stats() {
  const inv = useInventory();
  return <Text>{`n=${inv.items.length}`}</Text>;
}

describe('InventoryContext', () => {
  it('adds two items sharing one source photo (deduped to one file copy)', async () => {
    const repo = new Repo(makeTestDb());
    const prefs = Prefs.makeInMemory();
    const copies: Array<{ from: string; to: string }> = [];
    const photo = new PhotoStorage({
      documentDirectory: 'file:///d/',
      ensureDir: async () => {},
      copy: async (a) => {
        copies.push(a);
      },
    });
    let api: ReturnType<typeof useInventory> | undefined;
    function Capture() {
      api = useInventory();
      return null;
    }
    render(
      <HomesProvider repo={repo} prefs={prefs}>
        <InventoryProvider repo={repo} photoStorage={photo}>
          <Capture />
          <Stats />
        </InventoryProvider>
      </HomesProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await api!.addItems([
        {
          label: 'A',
          description: '',
          category: 'Misc',
          tags: [],
          primaryPhotoUri: 'file:///c/IMG.jpg',
          additionalPhotoUris: [],
          notes: '',
          box: { x: 0, y: 0, width: 0.1, height: 0.1 },
        },
        {
          label: 'B',
          description: '',
          category: 'Misc',
          tags: [],
          primaryPhotoUri: 'file:///c/IMG.jpg',
          additionalPhotoUris: [],
          notes: '',
          box: { x: 0, y: 0, width: 0.1, height: 0.1 },
        },
      ]);
    });
    expect(copies).toHaveLength(1);
    expect(api!.items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Implement `mobile-app/contexts/InventoryContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { InventoryItem } from '@/types/inventory';
import type { Repo, AddItemInput } from '@/db/repository';
import type { PhotoStorage } from '@/services/photo-storage';
import { useHomes } from './HomesContext';

interface InventoryContextValue {
  items: InventoryItem[];
  counts: Record<string, number>;
  addItems: (
    items: Array<Omit<AddItemInput, 'primaryPhotoUri'> & { primaryPhotoUri: string }>,
  ) => Promise<string[]>;
  updateItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  addPhotoToItem: (id: string, uri: string) => Promise<void>;
  deleteAllInActiveHome: () => Promise<void>;
  refresh: () => Promise<void>;
  isLoading: boolean;
}

const InventoryContext = createContext<InventoryContextValue | undefined>(undefined);

interface ProviderProps {
  repo: Repo;
  photoStorage: PhotoStorage;
  children: ReactNode;
}

export function InventoryProvider({ repo, photoStorage, children }: ProviderProps) {
  const { activeHomeId } = useHomes();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!activeHomeId) {
      setItems([]);
      setCounts(await repo.counts());
      setIsLoading(false);
      return;
    }
    const [list, c] = await Promise.all([repo.getItemsByHome(activeHomeId), repo.counts()]);
    setItems(list);
    setCounts(c);
    setIsLoading(false);
  }, [activeHomeId, repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItems: InventoryContextValue['addItems'] = useCallback(
    async (incoming) => {
      if (!activeHomeId) return [];
      const cache = new Map<string, string>();
      const prepared: AddItemInput[] = [];
      let i = 0;
      for (const data of incoming) {
        const cached = cache.get(data.primaryPhotoUri);
        const stored =
          cached ??
          (await photoStorage.savePhoto(data.primaryPhotoUri, `photo_${Date.now()}_${i++}`));
        if (!cached) cache.set(data.primaryPhotoUri, stored);
        prepared.push({ ...data, primaryPhotoUri: stored });
      }
      const ids = await repo.addItems(activeHomeId, prepared);
      await refresh();
      return ids;
    },
    [activeHomeId, photoStorage, refresh, repo],
  );

  const updateItem: InventoryContextValue['updateItem'] = useCallback(
    async (id, patch) => {
      await repo.updateItem(id, patch);
      await refresh();
    },
    [refresh, repo],
  );

  const deleteItem: InventoryContextValue['deleteItem'] = useCallback(
    async (id) => {
      await repo.deleteItem(id);
      await refresh();
    },
    [refresh, repo],
  );

  const deleteAllInActiveHome: InventoryContextValue['deleteAllInActiveHome'] = useCallback(
    async () => {
      if (!activeHomeId) return;
      await repo.deleteAllInHome(activeHomeId);
      await refresh();
    },
    [activeHomeId, refresh, repo],
  );

  const addPhotoToItem: InventoryContextValue['addPhotoToItem'] = useCallback(
    async (id, uri) => {
      const item = await repo.getItem(id);
      if (!item) return;
      const stored = await photoStorage.savePhoto(
        uri,
        `photo_${id}_${Date.now()}_${item.additionalPhotoUris.length + 1}`,
      );
      await repo.updateItem(id, {
        additionalPhotoUris: [...item.additionalPhotoUris, stored],
      });
      await refresh();
    },
    [photoStorage, refresh, repo],
  );

  const value = useMemo<InventoryContextValue>(
    () => ({
      items,
      counts,
      addItems,
      updateItem,
      deleteItem,
      addPhotoToItem,
      deleteAllInActiveHome,
      refresh,
      isLoading,
    }),
    [
      items,
      counts,
      addItems,
      updateItem,
      deleteItem,
      addPhotoToItem,
      deleteAllInActiveHome,
      refresh,
      isLoading,
    ],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  const v = useContext(InventoryContext);
  if (!v) throw new Error('useInventory outside InventoryProvider');
  return v;
}
```

- [ ] **Step 3: Run tests — pass**

- [ ] **Step 4: Wire providers in `mobile-app/app/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';
import { useFonts, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useMemo } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomesProvider } from '@/contexts/HomesContext';
import { InventoryProvider } from '@/contexts/InventoryContext';
import { Repo } from '@/db/repository';
import { getDb } from '@/db/client';
import { Prefs } from '@/stores/prefs';
import { PhotoStorage } from '@/services/photo-storage';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });
  const repo = useMemo(() => new Repo(getDb()), []);
  const prefs = useMemo(() => Prefs.makeMmkv(), []);
  const photoStorage = useMemo(() => PhotoStorage.fromExpo(), []);
  const queryClient = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <HomesProvider repo={repo} prefs={prefs}>
          <InventoryProvider repo={repo} photoStorage={photoStorage}>
            <Stack screenOptions={{ headerShown: false }} />
          </InventoryProvider>
        </HomesProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add mobile-app/contexts/InventoryContext.tsx mobile-app/contexts/InventoryContext.test.tsx mobile-app/app/_layout.tsx
git commit -m "feat(mobile): InventoryContext + provider wiring"
```

### Task 3.5: Section 3 merge

```bash
cd mobile-app && pnpm lint && pnpm typecheck && pnpm test
git tag -a section-rn-03-contexts -m "Section 3: HomesContext + InventoryContext"
```

---

# Section 4 — Backend: DetectedItem mapper + sync detect mapping

**Goal:** `api-service`'s `POST /v1/detect` now returns `{ items: DetectedItem[] }` for the success case, mapped from the pipeline's `SceneObservation`. OpenAPI schema is updated and exported. After this section, the existing detect path is fully aligned with the design's wire shape.

**Files (Section 4):**
- Create: `api-service/src/routes/detect.mapper.ts`, `api-service/src/routes/detect.mapper.test.ts`, `api-service/src/types/detected-item.ts`, `api-service/src/schemas/detected-item.schema.ts`, `api-service/scripts/export-openapi.ts`, `api-service/openapi.json` (output)
- Modify: `api-service/src/routes/detect.route.ts`, `api-service/src/app.ts`, `api-service/package.json`

### Task 4.1: `DetectedItem` type + mapper (test-first)

**Files:**
- Create: `api-service/src/types/detected-item.ts`, `api-service/src/routes/detect.mapper.ts`, `api-service/src/routes/detect.mapper.test.ts`

- [ ] **Step 1: Write `api-service/src/types/detected-item.ts`**

```ts
export interface DetectedItem {
  label: string;
  description: string;
  category: string;
  tags: string[];
  box: { x: number; y: number; width: number; height: number };
}
```

- [ ] **Step 2: Write failing test `api-service/src/routes/detect.mapper.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mapPipelineDetectionToItem, mapSceneToItems } from './detect.mapper';
import type { PipelineDetection, SceneObservation } from '../types/pipeline';

const baseDetection: PipelineDetection = {
  id: 'd1',
  bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  primaryLabel: 'Sofa',
  alternateLabels: [
    { label: 'Couch', confidence: 0.7 },
    { label: 'Loveseat', confidence: 0.4 },
  ],
  vlmStructuredAttributes: {
    description: 'Brown leather two-seater',
    category: 'Furniture',
    color: 'brown',
    material: 'leather',
    style: 'modern',
  },
  agreementScore: 0.9,
  contributingSignals: [],
  confidence: 0.85,
};

describe('mapPipelineDetectionToItem', () => {
  it('maps primaryLabel + box and harvests tags from VLM attributes', () => {
    const item = mapPipelineDetectionToItem(baseDetection);
    expect(item.label).toBe('Sofa');
    expect(item.description).toBe('Brown leather two-seater');
    expect(item.category).toBe('Furniture');
    expect(item.box).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    expect(item.tags).toEqual(expect.arrayContaining(['brown', 'leather', 'modern']));
    expect(item.tags).not.toContain('Brown leather two-seater');
    expect(item.tags).not.toContain('Furniture');
  });

  it('falls back to "Unknown" category when VLM omits it', () => {
    const d: PipelineDetection = {
      ...baseDetection,
      vlmStructuredAttributes: { color: 'red' },
    };
    expect(mapPipelineDetectionToItem(d).category).toBe('Unknown');
  });

  it('produces empty description when VLM omits it', () => {
    const d: PipelineDetection = {
      ...baseDetection,
      vlmStructuredAttributes: { category: 'X' },
    };
    expect(mapPipelineDetectionToItem(d).description).toBe('');
  });

  it('limits tag count to 8', () => {
    const d: PipelineDetection = {
      ...baseDetection,
      vlmStructuredAttributes: {
        description: 'd',
        category: 'c',
        color: 'a',
        material: 'b',
        style: 'c',
        room: 'd',
        subcategory: 'e',
        condition: 'f',
        size: 'g',
        brand: 'h',
        extra1: 'i',
        extra2: 'j',
      },
    };
    expect(mapPipelineDetectionToItem(d).tags.length).toBeLessThanOrEqual(8);
  });

  it('mapSceneToItems maps every detection in order', () => {
    const scene: SceneObservation = {
      sceneId: 's',
      runId: 'r',
      frameIds: ['f1'],
      detections: [baseDetection, { ...baseDetection, id: 'd2', primaryLabel: 'Chair' }],
      agreementCoverage: 1,
      agreementPrecision: 1,
      selfDiagnosisTriggered: false,
      rerunDepth: 0,
      flagged: false,
      processingMs: 10,
      errors: [],
      tileErrors: [],
    };
    const items = mapSceneToItems(scene);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.label)).toEqual(['Sofa', 'Chair']);
  });
});
```

- [ ] **Step 3: Run, fail with `Cannot find module './detect.mapper'`**

- [ ] **Step 4: Implement `api-service/src/routes/detect.mapper.ts`**

```ts
import type { PipelineDetection, SceneObservation } from '../types/pipeline';
import type { DetectedItem } from '../types/detected-item';

const DESCRIPTION_KEYS = ['description', 'desc', 'caption'];
const CATEGORY_KEYS = ['category', 'cat', 'class'];
const TAG_PRIORITY = [
  'color',
  'material',
  'style',
  'room',
  'subcategory',
  'condition',
  'size',
  'brand',
];
const NON_TAG_KEYS = new Set([...DESCRIPTION_KEYS, ...CATEGORY_KEYS]);
const MAX_TAGS = 8;

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

export function mapPipelineDetectionToItem(d: PipelineDetection): DetectedItem {
  const attrs = d.vlmStructuredAttributes ?? {};
  const description = pickString(attrs, DESCRIPTION_KEYS) ?? '';
  const category = pickString(attrs, CATEGORY_KEYS) ?? 'Unknown';

  const tags: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    const trimmed = v.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    tags.push(trimmed);
  };
  for (const k of TAG_PRIORITY) {
    if (k in attrs && !NON_TAG_KEYS.has(k)) push(attrs[k]);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (NON_TAG_KEYS.has(k)) continue;
    if (TAG_PRIORITY.includes(k)) continue;
    push(v);
  }

  return {
    label: d.primaryLabel,
    description,
    category,
    tags: tags.slice(0, MAX_TAGS),
    box: {
      x: d.bbox.x,
      y: d.bbox.y,
      width: d.bbox.width,
      height: d.bbox.height,
    },
  };
}

export function mapSceneToItems(scene: SceneObservation): DetectedItem[] {
  return scene.detections.map(mapPipelineDetectionToItem);
}
```

- [ ] **Step 5: Run, pass (5 tests)**

- [ ] **Step 6: Commit**

```bash
git add api-service/src/types/detected-item.ts api-service/src/routes/detect.mapper.ts api-service/src/routes/detect.mapper.test.ts
git commit -m "feat(api-service): DetectedItem type + pipeline → item mapper"
```

### Task 4.2: Wire mapper into `/v1/detect` and update OpenAPI schema

**Files:**
- Modify: `api-service/src/routes/detect.route.ts`, `api-service/src/app.ts`
- Create: `api-service/src/schemas/detected-item.schema.ts`

- [ ] **Step 1: Update success branches in `runPipelinePath`**

In `api-service/src/routes/detect.route.ts`, at top:

```ts
import { mapSceneToItems } from './detect.mapper';
```

Replace each of the two `reply.code(200).send(...)` lines (idempotent hit + final success) with:

```ts
return reply.code(200).send({ items: mapSceneToItems(launch.result) });
```

and

```ts
return reply.code(200).send({ items: mapSceneToItems(final.result) });
```

- [ ] **Step 2: Add a Fastify route schema** for `POST /v1/detect`. In the route registration:

```ts
app.post(
  '/v1/detect',
  {
    preHandler: authMiddleware,
    schema: {
      summary: 'Detect home objects in 1–3 image frames',
      tags: ['vision'],
      response: {
        200: {
          type: 'object',
          required: ['items'],
          properties: {
            items: { type: 'array', items: { $ref: 'DetectedItem' } },
          },
        },
        202: {
          type: 'object',
          required: ['runId', 'statusUrl'],
          properties: {
            runId: { type: 'string' },
            statusUrl: { type: 'string' },
          },
        },
      },
    },
  },
  async (request, reply) => { /* unchanged body */ },
);
```

- [ ] **Step 3: Add the shared schema. Create `api-service/src/schemas/detected-item.schema.ts`**

```ts
export const detectedItemSchema = {
  $id: 'DetectedItem',
  type: 'object',
  required: ['label', 'description', 'category', 'tags', 'box'],
  properties: {
    label: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    box: {
      type: 'object',
      required: ['x', 'y', 'width', 'height'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
    },
  },
} as const;
```

- [ ] **Step 4: Register schema in `api-service/src/app.ts`** (after `app = Fastify(...)`):

```ts
import { detectedItemSchema } from './schemas/detected-item.schema';
app.addSchema(detectedItemSchema);
```

- [ ] **Step 5: Update existing `detect.route` integration tests** in `api-service/src/__tests__/unit/routes/detect.route.test.ts`. For each `expect(body)` that asserted the raw `SceneObservation` shape on success, switch to `expect(body.items[0]).toMatchObject({ label: ..., box: ... })`.

- [ ] **Step 6: Run api-service tests — green**

```bash
cd api-service && pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add api-service/
git commit -m "feat(api-service): /v1/detect returns mapped DetectedItem[] + route schema"
```

### Task 4.3: Register `@fastify/swagger`, export `openapi.json`

**Files:**
- Modify: `api-service/package.json`, `api-service/src/app.ts`
- Create: `api-service/scripts/export-openapi.ts`

- [ ] **Step 1: Add deps**

```bash
cd api-service && pnpm add @fastify/swagger @fastify/swagger-ui
```

- [ ] **Step 2: Register in `app.ts`** (before route registration):

```ts
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

await app.register(swagger, {
  openapi: {
    openapi: '3.1.0',
    info: { title: 'Visual Home Inventory API', version: '2.0.0' },
    servers: [{ url: '/' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearerAuth: [] }],
  },
});
await app.register(swaggerUi, { routePrefix: '/docs' });
```

- [ ] **Step 3: Write `api-service/scripts/export-openapi.ts`**

```ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from '../src/app';

(async () => {
  const app = await buildApp({ disableRateLimit: true });
  await app.ready();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spec = (app as any).swagger();
  const out = resolve(__dirname, '../openapi.json');
  writeFileSync(out, JSON.stringify(spec, null, 2));
  await app.close();
  console.log('Wrote', out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Add npm script**

In `api-service/package.json` `scripts`:

```json
"export:openapi": "tsx scripts/export-openapi.ts"
```

- [ ] **Step 5: Run it**

```bash
cd api-service && pnpm export:openapi
```

Expected: `api-service/openapi.json` written, contains `paths./v1/detect` with `DetectedItem` ref.

- [ ] **Step 6: Commit**

```bash
git add api-service/ 
git commit -m "feat(api-service): swagger plugin + openapi export script"
```

### Task 4.4: Section 4 merge

```bash
cd api-service && pnpm test
git tag -a section-rn-04-mapper -m "Section 4: DetectedItem mapper + OpenAPI export"
```

---

# Section 5 — Backend: `/v1/detect/stream` SSE endpoint

**Goal:** Add `POST /v1/detect/stream` to `api-service`. Wire format matches the spec: `meta` event first, then one `item` event per detection, then `done`. Phase-1 implementation: launch run, await completion via existing `waitForCompletion`, then emit per-detection items with a small delay (configurable, default 50ms) so the client perceives progressive arrival. 15s keepalive comments. Heartbeat-clean closes on client disconnect.

**Files (Section 5):**
- Create: `api-service/src/routes/detect-stream.route.ts`, `api-service/src/routes/detect-stream.route.test.ts`, `api-service/src/utils/sse.ts`, `api-service/src/utils/sse.test.ts`
- Modify: `api-service/src/app.ts`

### Task 5.1: SSE writer utility (test-first)

**Files:**
- Create: `api-service/src/utils/sse.ts`, `api-service/src/utils/sse.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { encodeSseEvent } from './sse';

describe('encodeSseEvent', () => {
  it('emits event + data + blank line', () => {
    const s = encodeSseEvent('item', { label: 'Sofa' });
    expect(s).toBe('event: item\ndata: {"label":"Sofa"}\n\n');
  });

  it('escapes embedded newlines', () => {
    const s = encodeSseEvent('msg', 'line1\nline2');
    expect(s).toBe('event: msg\ndata: "line1\\nline2"\n\n');
  });

  it('omits event line for the default event', () => {
    const s = encodeSseEvent(null, { x: 1 });
    expect(s).toBe('data: {"x":1}\n\n');
  });
});
```

- [ ] **Step 2: Implement `api-service/src/utils/sse.ts`**

```ts
export function encodeSseEvent(event: string | null, data: unknown): string {
  const payload = JSON.stringify(data);
  const head = event ? `event: ${event}\n` : '';
  return `${head}data: ${payload}\n\n`;
}

export const SSE_KEEPALIVE = ':keepalive\n\n';
```

- [ ] **Step 3: Pass + commit**

```bash
git add api-service/src/utils/sse.ts api-service/src/utils/sse.test.ts
git commit -m "feat(api-service): SSE encoder utility"
```

### Task 5.2: SSE route (test-first with a fake `PipelineClient`)

**Files:**
- Create: `api-service/src/routes/detect-stream.route.ts`, `api-service/src/routes/detect-stream.route.test.ts`
- Modify: `api-service/src/app.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { detectStreamRoute } from './detect-stream.route';
import type { PipelineClient, LaunchRunResult } from '../clients/pipeline.client';
import type { RunStatus, SceneObservation } from '../types/pipeline';

const sceneFixture: SceneObservation = {
  sceneId: 's',
  runId: 'r1',
  frameIds: ['f1'],
  detections: [
    {
      id: 'd1',
      bbox: { x: 0, y: 0, width: 0.5, height: 0.5 },
      primaryLabel: 'Sofa',
      alternateLabels: [],
      vlmStructuredAttributes: { category: 'Furniture', description: 'Brown' },
      agreementScore: 1,
      contributingSignals: [],
      confidence: 0.9,
    },
    {
      id: 'd2',
      bbox: { x: 0.5, y: 0, width: 0.4, height: 0.4 },
      primaryLabel: 'Lamp',
      alternateLabels: [],
      vlmStructuredAttributes: { category: 'Lighting' },
      agreementScore: 1,
      contributingSignals: [],
      confidence: 0.8,
    },
  ],
  agreementCoverage: 1,
  agreementPrecision: 1,
  selfDiagnosisTriggered: false,
  rerunDepth: 0,
  flagged: false,
  processingMs: 5,
  errors: [],
  tileErrors: [],
};

class FakePipeline implements PipelineClient {
  async launchRun(): Promise<LaunchRunResult> {
    return { runId: 'r1', startedAt: new Date().toISOString(), idempotentHit: false };
  }
  async waitForCompletion(): Promise<RunStatus> {
    return {
      runId: 'r1',
      status: 'succeeded',
      startedAt: new Date().toISOString(),
      result: sceneFixture,
    };
  }
  async getRun(): Promise<RunStatus> {
    throw new Error('unused');
  }
}

describe('detectStreamRoute', () => {
  let app: ReturnType<typeof Fastify>;
  beforeEach(async () => {
    app = Fastify();
    await app.register(multipart);
    (app as any).pipeline = new FakePipeline();
    process.env.SSE_ITEM_DRIBBLE_MS = '0';
    await detectStreamRoute(app);
  });

  it('emits meta, item×N, done in order', async () => {
    const form = new FormData();
    form.append(
      'frame',
      new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
      'a.jpg',
    );
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream',
      headers: { 'content-type': 'multipart/form-data; boundary=---ABC' },
      payload: form as any,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = res.body.split('\n\n').filter(Boolean);
    expect(events[0]).toMatch(/^event: meta\ndata: \{/);
    expect(events[1]).toMatch(/^event: item\ndata: \{.*Sofa/);
    expect(events[2]).toMatch(/^event: item\ndata: \{.*Lamp/);
    expect(events[3]).toMatch(/^event: done\ndata: \{.*"totalItems":2/);
  });
});
```

(If `app.inject` doesn't easily support multipart in your test runner, switch to a real HTTP listen + `undici` request — there's precedent for this in existing api-service tests; mirror that pattern.)

- [ ] **Step 2: Implement `api-service/src/routes/detect-stream.route.ts`**

```ts
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { envConfig } from '../config/env.config';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  PipelineClient,
  PipelineUnavailableError,
  QueueFullError,
} from '../clients/pipeline.client';
import { mapPipelineDetectionToItem } from './detect.mapper';
import { encodeSseEvent, SSE_KEEPALIVE } from '../utils/sse';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const KEEPALIVE_MS = 15_000;

export async function detectStreamRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as PipelineClient | undefined;

  app.post(
    '/v1/detect/stream',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Detect home objects, streaming items via SSE',
        tags: ['vision'],
        consumes: ['multipart/form-data'],
        produces: ['text/event-stream'],
        response: {
          200: { description: 'SSE stream', type: 'string' },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          503: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const itemDribbleMs = Number(process.env.SSE_ITEM_DRIBBLE_MS ?? 50);
      const frames: Array<{ buffer: Buffer; mime: string; sha256: string }> = [];
      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        if (frames.length >= 1) {
          await part.toBuffer();
          continue;
        }
        const buf = await part.toBuffer();
        if (buf.length > MAX_IMAGE_SIZE)
          return reply.code(413).send({ error: 'payload_too_large' });
        const mime = part.mimetype ?? 'image/jpeg';
        if (!SUPPORTED.has(mime))
          return reply.code(400).send({ error: 'unsupported_mime', mime });
        frames.push({
          buffer: buf,
          mime,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        });
      }
      if (frames.length === 0) return reply.code(400).send({ error: 'no_frame' });
      if (!pipeline) return reply.code(503).send({ error: 'pipeline_unavailable' });

      const photoDir = path.join(envConfig.photoDir, 'photos');
      await fs.mkdir(photoDir, { recursive: true });
      const f = frames[0]!;
      const ext = f.mime === 'image/png' ? 'png' : f.mime === 'image/webp' ? 'webp' : 'jpg';
      const photoPath = path.join(photoDir, `${f.sha256}.${ext}`);
      await fs.writeFile(photoPath, f.buffer);

      const idempotencyKey = crypto
        .createHash('sha256')
        .update(Buffer.from(f.sha256, 'hex'))
        .digest('hex');

      const traceparent = request.headers['traceparent']?.toString();
      const traceId =
        traceparent?.split('-')[1] ?? crypto.randomBytes(16).toString('hex');
      const requestId = request.id;

      reply.raw.statusCode = 200;
      reply.raw.setHeader('content-type', 'text/event-stream');
      reply.raw.setHeader('cache-control', 'no-cache, no-transform');
      reply.raw.setHeader('connection', 'keep-alive');
      reply.raw.setHeader('x-accel-buffering', 'no');
      reply.raw.flushHeaders();

      let aborted = false;
      const onClose = () => {
        aborted = true;
      };
      reply.raw.on('close', onClose);

      const keepalive = setInterval(() => {
        if (!aborted) reply.raw.write(SSE_KEEPALIVE);
      }, KEEPALIVE_MS);

      const writeEvent = (event: string, data: unknown) => {
        if (aborted) return;
        reply.raw.write(encodeSseEvent(event, data));
      };

      try {
        let launch;
        try {
          launch = await pipeline.launchRun({
            idempotencyKey,
            photoPaths: [photoPath],
            traceId,
            requestId,
          });
        } catch (err) {
          if (err instanceof QueueFullError) {
            writeEvent('error', { code: 'queue_full', retryAfterS: err.retryAfterS });
            return;
          }
          if (err instanceof PipelineUnavailableError) {
            writeEvent('error', { code: 'pipeline_unavailable' });
            return;
          }
          throw err;
        }

        writeEvent('meta', { runId: launch.runId, traceId });

        const final =
          launch.idempotentHit && launch.status === 'succeeded' && launch.result
            ? { result: launch.result }
            : await pipeline.waitForCompletion(
                launch.runId,
                Date.now() + envConfig.httpResponseTimeoutMs - 250,
              );

        if (!('result' in final) || !final.result) {
          writeEvent('error', {
            code: 'pipeline_failed',
            runId: launch.runId,
            ...(final && 'errorMessage' in final ? { message: final.errorMessage } : {}),
          });
          return;
        }

        const items = final.result.detections.map(mapPipelineDetectionToItem);
        for (const item of items) {
          if (aborted) return;
          writeEvent('item', item);
          if (itemDribbleMs > 0) await new Promise((r) => setTimeout(r, itemDribbleMs));
        }
        writeEvent('done', { runId: launch.runId, totalItems: items.length });
      } finally {
        clearInterval(keepalive);
        reply.raw.off('close', onClose);
        reply.raw.end();
      }
    },
  );
}
```

- [ ] **Step 3: Register the route in `api-service/src/app.ts`**

```ts
import { detectStreamRoute } from './routes/detect-stream.route';
// after other routes:
await app.register(detectStreamRoute);
```

- [ ] **Step 4: Run all api-service tests — green**

- [ ] **Step 5: Commit**

```bash
git add api-service/src/routes/detect-stream.route.ts api-service/src/routes/detect-stream.route.test.ts api-service/src/app.ts
git commit -m "feat(api-service): POST /v1/detect/stream SSE endpoint"
```

### Task 5.3: Re-export OpenAPI

- [ ] **Step 1:** Run

```bash
cd api-service && pnpm export:openapi
```

The route schema added in Step 2 above means the SSE endpoint shows up automatically.

- [ ] **Step 2: Commit**

```bash
git add api-service/openapi.json
git commit -m "docs(api-service): include SSE endpoint in openapi.json"
```

### Task 5.4: Section 5 merge

```bash
cd api-service && pnpm test
git tag -a section-rn-05-sse -m "Section 5: /v1/detect/stream SSE endpoint"
```

---

# Section 6 — Mobile API client + codegen

**Goal:** Mobile generates types from `api-service/openapi.json`, exposes a typed `detectImage` (sync) and `detectImageStream` (SSE consumer) on top of `ofetch` + `expo/fetch`. Auth header + W3C `traceparent` propagation handled centrally.

**Files (Section 6):**
- Create: `mobile-app/api/client.ts`, `mobile-app/api/detect.ts`, `mobile-app/api/sse.ts`, `mobile-app/api/sse.test.ts`, `mobile-app/api/detect.test.ts`, `mobile-app/api/types.ts`

### Task 6.1: Generate types

- [ ] **Step 1: Run codegen**

```bash
cd mobile-app && pnpm codegen:api
```

Expected: `mobile-app/api/generated/` populated with `types.gen.ts`, etc.

- [ ] **Step 2: Re-export the types `mobile-app/api/types.ts`**

```ts
export type { DetectedItem } from './generated';

export type DetectError = { error: string; runId?: string; message?: string };

export type DetectStreamEvent =
  | { type: 'meta'; runId: string; traceId: string }
  | { type: 'item'; item: import('./generated').DetectedItem }
  | { type: 'done'; runId: string; totalItems: number }
  | {
      type: 'error';
      code: string;
      runId?: string;
      message?: string;
      retryAfterS?: number;
    };
```

- [ ] **Step 3: Commit**

```bash
git add mobile-app/api/generated mobile-app/api/types.ts
git commit -m "feat(mobile): generate API types from api-service openapi.json"
```

### Task 6.2: SSE parser (test-first)

**Files:**
- Create: `mobile-app/api/sse.ts`, `mobile-app/api/sse.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { parseSseChunks, splitSseEvents } from './sse';

describe('splitSseEvents', () => {
  it('splits on blank lines, handles \\r\\n line endings', () => {
    const buf = 'event: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2\r\n\r\n';
    expect(splitSseEvents(buf)).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('ignores keepalive comments', () => {
    const buf = ':keepalive\n\nevent: a\ndata: 1\n\n';
    expect(splitSseEvents(buf)).toEqual([{ event: 'a', data: '1' }]);
  });

  it('returns the trailing partial fragment as remainder when no blank line yet', () => {
    const { remainder } = parseSseChunks('event: x\ndata: ');
    expect(remainder).toBe('event: x\ndata: ');
  });
});
```

- [ ] **Step 2: Implement `mobile-app/api/sse.ts`**

```ts
export interface RawSseEvent {
  event: string;
  data: string;
}

export function splitSseEvents(buf: string): RawSseEvent[] {
  const events: RawSseEvent[] = [];
  const blocks = buf.replace(/\r\n/g, '\n').split('\n\n');
  for (const block of blocks) {
    if (!block.trim()) continue;
    if (block.startsWith(':')) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (dataLines.length === 0) continue;
    events.push({ event, data: dataLines.join('\n') });
  }
  return events;
}

export function parseSseChunks(buf: string): { events: RawSseEvent[]; remainder: string } {
  const lastBoundary = buf.lastIndexOf('\n\n');
  if (lastBoundary < 0) return { events: [], remainder: buf };
  const complete = buf.slice(0, lastBoundary + 2);
  const remainder = buf.slice(lastBoundary + 2);
  return { events: splitSseEvents(complete), remainder };
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add mobile-app/api/sse.ts mobile-app/api/sse.test.ts
git commit -m "feat(mobile): SSE event parser"
```

### Task 6.3: API client + detect helpers

**Files:**
- Create: `mobile-app/api/client.ts`, `mobile-app/api/detect.ts`, `mobile-app/api/detect.test.ts`

- [ ] **Step 1: Write `mobile-app/api/client.ts`**

```ts
import { ofetch } from 'ofetch';
import Constants from 'expo-constants';

interface ClientConfig {
  baseUrl: string;
  apiKey?: string | undefined;
}

function readConfig(): ClientConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; apiKey?: string };
  return {
    baseUrl: extra.apiBaseUrl ?? 'http://localhost:14000',
    apiKey: extra.apiKey,
  };
}

export const apiFetch = ofetch.create({
  baseURL: readConfig().baseUrl,
  retry: 1,
  retryDelay: 250,
  onRequest({ options }) {
    const cfg = readConfig();
    const headers = new Headers(options.headers ?? {});
    if (cfg.apiKey) headers.set('authorization', `Bearer ${cfg.apiKey}`);
    options.headers = headers;
  },
});

export function makeTraceparent(): string {
  const hex = (n: number) => {
    let out = '';
    for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  };
  return `00-${hex(32)}-${hex(16)}-01`;
}
```

- [ ] **Step 2: Write failing test `mobile-app/api/detect.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { _testParseStreamLine } from './detect';

describe('detect helpers', () => {
  it('_testParseStreamLine maps "item"', () => {
    const ev = _testParseStreamLine({
      event: 'item',
      data:
        '{"label":"X","description":"","category":"C","tags":[],"box":{"x":0,"y":0,"width":1,"height":1}}',
    });
    expect(ev.type).toBe('item');
    if (ev.type === 'item') expect(ev.item.label).toBe('X');
  });

  it('_testParseStreamLine maps "done"', () => {
    const ev = _testParseStreamLine({
      event: 'done',
      data: '{"runId":"r","totalItems":3}',
    });
    expect(ev).toEqual({ type: 'done', runId: 'r', totalItems: 3 });
  });
});
```

- [ ] **Step 3: Implement `mobile-app/api/detect.ts`**

```ts
import Constants from 'expo-constants';
import { apiFetch, makeTraceparent } from './client';
import type { DetectedItem, DetectStreamEvent } from './types';
import type { RawSseEvent } from './sse';
import { parseSseChunks } from './sse';

interface DetectInput {
  fileUri: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export async function detectImage(
  input: DetectInput,
): Promise<{ items: DetectedItem[]; traceparent: string }> {
  const traceparent = makeTraceparent();
  const form = new FormData();
  form.append('frame', {
    uri: input.fileUri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);
  const data = await apiFetch<{ items: DetectedItem[] }>('/v1/detect', {
    method: 'POST',
    body: form,
    headers: { traceparent },
  });
  return { items: data.items, traceparent };
}

export async function* detectImageStream(
  input: DetectInput,
  signal?: AbortSignal,
): AsyncGenerator<DetectStreamEvent, void, unknown> {
  const traceparent = makeTraceparent();
  const form = new FormData();
  form.append('frame', {
    uri: input.fileUri,
    name: input.fileName,
    type: input.mimeType,
  } as unknown as Blob);

  const baseUrl =
    (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
    'http://localhost:14000';
  const apiKey = (Constants.expoConfig?.extra as { apiKey?: string } | undefined)?.apiKey;
  const headers: Record<string, string> = { traceparent };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/detect/stream`, {
    method: 'POST',
    body: form as unknown as BodyInit,
    headers,
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`detect/stream HTTP ${res.status}`);

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const { events, remainder } = parseSseChunks(buf);
      buf = remainder;
      for (const ev of events) yield _testParseStreamLine(ev);
    }
    if (buf.trim()) {
      const { events } = parseSseChunks(buf + '\n\n');
      for (const ev of events) yield _testParseStreamLine(ev);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

export function _testParseStreamLine(ev: RawSseEvent): DetectStreamEvent {
  const data = JSON.parse(ev.data) as Record<string, unknown>;
  switch (ev.event) {
    case 'meta':
      return { type: 'meta', runId: String(data.runId), traceId: String(data.traceId) };
    case 'item':
      return { type: 'item', item: data as unknown as DetectedItem };
    case 'done':
      return {
        type: 'done',
        runId: String(data.runId),
        totalItems: Number(data.totalItems ?? 0),
      };
    case 'error':
      return {
        type: 'error',
        code: String(data.code ?? 'unknown'),
        ...(typeof data.runId === 'string' ? { runId: data.runId } : {}),
        ...(typeof data.message === 'string' ? { message: data.message } : {}),
        ...(typeof data.retryAfterS === 'number' ? { retryAfterS: data.retryAfterS } : {}),
      };
    default:
      return { type: 'error', code: 'unknown_event', message: ev.event };
  }
}
```

- [ ] **Step 4: Pass + commit**

```bash
git add mobile-app/api/client.ts mobile-app/api/detect.ts mobile-app/api/detect.test.ts
git commit -m "feat(mobile): typed detect client (sync + SSE generator)"
```

### Task 6.4: Section 6 merge

```bash
cd mobile-app && pnpm lint && pnpm typecheck && pnpm test
git tag -a section-rn-06-api-client -m "Section 6: API codegen + typed client"
```

---

# Section 7 — UI primitives

**Goal:** Port the small, mostly-presentational components from `design/mobile-app/artifacts/home-inventory/components/` into `mobile-app/components/`. Substitute `import { Colors } from "../constants/colors"` with `@/constants/colors`. No behavior changes.

**Components ported in this section:**
- `EmptyState.tsx`
- `PrimaryButton.tsx`
- `KeyboardAwareScrollViewCompat.tsx`
- `ErrorBoundary.tsx`
- `ErrorFallback.tsx`
- `EditableChip.tsx`
- `SearchHeader.tsx`
- `CategoryStrip.tsx`
- `ActionCapsule.tsx`
- `TopBar.tsx`

### Task 7.1: For each component, repeat this micro-cycle (TDD smoke render)

The `EditableChip` example is shown in full; the rest follow the same structure.

- [ ] **Step 1: Write a smoke render test** `mobile-app/components/EditableChip.test.tsx`

```tsx
import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import EditableChip from './EditableChip';

describe('EditableChip', () => {
  it('renders given label', () => {
    const { getByText } = render(<EditableChip value="leather" onChange={() => {}} />);
    expect(getByText('leather')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, fail with `Cannot find module './EditableChip'`**
- [ ] **Step 3: Port `mobile-app/components/EditableChip.tsx`** verbatim from design + adjust imports.
- [ ] **Step 4: Run, pass**
- [ ] **Step 5: Commit**

```bash
git add mobile-app/components/EditableChip.tsx mobile-app/components/EditableChip.test.tsx
git commit -m "feat(mobile): port EditableChip"
```

**Apply the same red-green-commit cycle for** `EmptyState`, `PrimaryButton`, `KeyboardAwareScrollViewCompat`, `ErrorBoundary`, `ErrorFallback`, `SearchHeader`, `CategoryStrip`, `ActionCapsule`, `TopBar`. Each is its own commit. Each test asserts visible text or testID present after `render(...)` — keep tests stable; do not assert against internal style values.

### Task 7.2: Section 7 merge

```bash
cd mobile-app && pnpm lint && pnpm typecheck && pnpm test
git tag -a section-rn-07-primitives -m "Section 7: UI primitives ported"
```

---

# Section 8 — Lists, sheets, home screen

**Goal:** Composing components on top of primitives. `MasonryGrid` rebuilt on top of `@shopify/flash-list` v2 masonry mode. `HomePickerSheet`, `QuickActionsSheet`, `ItemCard` ported. `app/index.tsx` becomes a working home screen.

**Files (Section 8):**
- Create: `mobile-app/components/MasonryGrid.tsx`, `mobile-app/components/MasonryGrid.test.tsx`, `mobile-app/components/ItemCard.tsx`, `mobile-app/components/QuickActionsSheet.tsx`, `mobile-app/components/HomePickerSheet.tsx`, `mobile-app/stores/home-screen.store.ts`, `mobile-app/stores/home-screen.store.test.ts`
- Modify: `mobile-app/app/index.tsx`

### Task 8.1: Zustand store for home screen UI state

**Files:**
- Create: `mobile-app/stores/home-screen.store.ts`, `mobile-app/stores/home-screen.store.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createHomeScreenStore } from './home-screen.store';

describe('homeScreenStore', () => {
  it('cycles sort: newest → oldest → alpha → newest', () => {
    const s = createHomeScreenStore();
    expect(s.getState().sort).toBe('newest');
    s.getState().cycleSort();
    expect(s.getState().sort).toBe('oldest');
    s.getState().cycleSort();
    expect(s.getState().sort).toBe('alpha');
    s.getState().cycleSort();
    expect(s.getState().sort).toBe('newest');
  });

  it('clears category filter when set to null', () => {
    const s = createHomeScreenStore();
    s.getState().setCategory('Furniture');
    expect(s.getState().category).toBe('Furniture');
    s.getState().setCategory(null);
    expect(s.getState().category).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `mobile-app/stores/home-screen.store.ts`**

```ts
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

type Sort = 'newest' | 'oldest' | 'alpha';

interface HomeScreenState {
  query: string;
  category: string | null;
  sort: Sort;
  setQuery: (q: string) => void;
  setCategory: (c: string | null) => void;
  cycleSort: () => void;
}

export function createHomeScreenStore() {
  return createStore<HomeScreenState>((set, get) => ({
    query: '',
    category: null,
    sort: 'newest',
    setQuery: (q) => set({ query: q }),
    setCategory: (c) => set({ category: c }),
    cycleSort: () =>
      set({
        sort:
          get().sort === 'newest' ? 'oldest' : get().sort === 'oldest' ? 'alpha' : 'newest',
      }),
  }));
}

const homeScreenStore = createHomeScreenStore();
export function useHomeScreenStore<T>(selector: (s: HomeScreenState) => T): T {
  return useStore(homeScreenStore, selector);
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add mobile-app/stores/home-screen.store.ts mobile-app/stores/home-screen.store.test.ts
git commit -m "feat(mobile): home-screen UI store (query/category/sort)"
```

### Task 8.2: Port `ItemCard`, `QuickActionsSheet`, `HomePickerSheet`

For each, repeat Task 7.1's micro-cycle. Tests assert testID or label rendering. Each in its own commit (`feat(mobile): port <Name>`).

### Task 8.3: MasonryGrid on FlashList v2

**Files:**
- Create: `mobile-app/components/MasonryGrid.tsx`, `mobile-app/components/MasonryGrid.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { Text } from 'react-native';
import MasonryGrid from './MasonryGrid';

describe('MasonryGrid', () => {
  it('renders all provided items', () => {
    const items = Array.from({ length: 6 }).map((_, i) => ({ id: String(i), label: `i${i}` }));
    const { getByText } = render(
      <MasonryGrid
        items={items}
        keyExtractor={(it) => it.id}
        getAspectRatio={() => 1}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        columns={2}
      />,
    );
    expect(getByText('i0')).toBeTruthy();
    expect(getByText('i5')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
import { MasonryFlashList } from '@shopify/flash-list';
import type { ReactElement } from 'react';

interface Props<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  getAspectRatio: (item: T) => number;
  renderItem: (info: { item: T; index: number }) => ReactElement;
  columns: number;
  gutter?: number;
  ListEmptyComponent?: ReactElement;
  ListHeaderComponent?: ReactElement;
}

export default function MasonryGrid<T>(props: Props<T>) {
  return (
    <MasonryFlashList<T>
      data={props.items}
      keyExtractor={props.keyExtractor}
      numColumns={props.columns}
      estimatedItemSize={220}
      overrideItemLayout={(layout, item) => {
        layout.size = 220 / props.getAspectRatio(item);
      }}
      renderItem={({ item, index }) => props.renderItem({ item, index })}
      ListEmptyComponent={props.ListEmptyComponent}
      ListHeaderComponent={props.ListHeaderComponent}
      contentContainerStyle={{ padding: props.gutter ?? 12 }}
    />
  );
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add mobile-app/components/MasonryGrid.tsx mobile-app/components/MasonryGrid.test.tsx
git commit -m "feat(mobile): MasonryGrid on FlashList v2"
```

### Task 8.4: Compose `app/index.tsx`

**Files:**
- Modify: `mobile-app/app/index.tsx`

- [ ] **Step 1: Replace contents** with composition mirroring the design's `index.tsx` (425 lines). Use `useHomes`, `useInventory`, `useHomeScreenStore`. Wire `SearchHeader` to `setQuery` debounced 200ms; on non-empty query, call `repo.searchItems(activeHomeId, query)` via a TanStack Query `useQuery` keyed `['search', activeHomeId, query]`. The `CategoryStrip` reads counts from `inventory.counts`, the `MasonryGrid` shows items filtered by category + sorted per `sort`. Long-press on an `ItemCard` opens `QuickActionsSheet`. `ActionCapsule.onCameraPress` navigates to `/detection`.

(Read the design's `index.tsx` line-by-line during port; behavior is the spec.)

- [ ] **Step 2: typecheck + lint pass**
- [ ] **Step 3: Commit**

```bash
git add mobile-app/app/index.tsx
git commit -m "feat(mobile): home screen with search, filter, sort, masonry"
```

### Task 8.5: Section 8 merge

```bash
cd mobile-app && pnpm lint && pnpm typecheck && pnpm test
git tag -a section-rn-08-home -m "Section 8: lists, sheets, home screen"
```

---

# Section 9 — Settings / Profile / Item detail

**Goal:** Three secondary screens, all composable on top of existing primitives + contexts.

**Files (Section 9):**
- Create: `mobile-app/app/settings.tsx`, `mobile-app/app/profile.tsx`, `mobile-app/app/item/[id].tsx`

### Task 9.1: Port `app/settings.tsx`

- [ ] **Step 1:** Read design's `settings.tsx` (372 lines). Port verbatim, swap data calls from AsyncStorage to `useHomes` (`addHome`, `renameHome`, `deleteHome`).
- [ ] **Step 2:** Add a Vitest render test asserting "Add home" button is present.
- [ ] **Step 3:** Commit `feat(mobile): settings screen (multi-home CRUD)`.

### Task 9.2: Port `app/profile.tsx`

- [ ] **Step 1:** Same flow against `useHomes().updateProfile`.
- [ ] **Step 2:** Render test asserts the name input is initialized from current profile.
- [ ] **Step 3:** Commit `feat(mobile): profile screen`.

### Task 9.3: Port `app/item/[id].tsx`

- [ ] **Step 1:** Read design's `item/[id].tsx`. Port using `useInventory` for `updateItem`/`addPhotoToItem`/`deleteItem`. Use `useLocalSearchParams<{ id: string }>()` from `expo-router`.
- [ ] **Step 2:** Test: navigating to `/item/non-existent` shows the "item not found" state.
- [ ] **Step 3:** Commit `feat(mobile): item detail screen`.

### Task 9.4: Section 9 merge

```bash
cd mobile-app && pnpm lint && pnpm typecheck && pnpm test
git tag -a section-rn-09-other-screens -m "Section 9: settings + profile + item detail"
```

---

# Section 10 — Detection screen + SSE wiring

**Goal:** `app/detection.tsx` ported to use `detectImageStream`. DetectionRow + BoundingBoxOverlay + BoxThumbnail ported. Crash-resume on cold start via `prefs.getLastDetectionRunId()` polling `/v1/detect/status/:id`. Includes a small `api-service` follow-up so the status route also returns `DetectedItem[]`.

**Files (Section 10):**
- Create: `mobile-app/components/BoundingBoxOverlay.tsx`, `mobile-app/components/BoxThumbnail.tsx`, `mobile-app/components/DetectionRow.tsx`, `mobile-app/app/detection.tsx`, `mobile-app/stores/detection-screen.store.ts`, `mobile-app/stores/detection-screen.store.test.ts`, `mobile-app/api/detect-status.ts`
- Modify: `api-service/src/routes/detect-status.route.ts`, plus its test

### Task 10.1: Port `BoundingBoxOverlay`, `BoxThumbnail`, `DetectionRow`

Each in its own commit using the Section 7 micro-cycle (test → fail → port → pass → commit).

### Task 10.2: Detection screen Zustand store

**Files:**
- Create: `mobile-app/stores/detection-screen.store.ts`, `mobile-app/stores/detection-screen.store.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createDetectionStore } from './detection-screen.store';
import type { DetectedItem } from '@/api/types';

const sample: DetectedItem = {
  label: 'Sofa',
  description: '',
  category: 'Furniture',
  tags: ['leather'],
  box: { x: 0, y: 0, width: 0.4, height: 0.4 },
};

describe('detectionStore', () => {
  it('transitions loading → streaming on first item, → review on done', () => {
    const s = createDetectionStore();
    expect(s.getState().phase).toBe('loading');
    s.getState().handleEvent({ type: 'meta', runId: 'r', traceId: 't' });
    expect(s.getState().phase).toBe('loading');
    s.getState().handleEvent({ type: 'item', item: sample });
    expect(s.getState().phase).toBe('streaming');
    expect(s.getState().rows).toHaveLength(1);
    s.getState().handleEvent({ type: 'done', runId: 'r', totalItems: 1 });
    expect(s.getState().phase).toBe('review');
  });

  it('toggles row include', () => {
    const s = createDetectionStore();
    s.getState().handleEvent({ type: 'item', item: sample });
    const id = s.getState().rows[0]!.id;
    s.getState().toggleInclude(id);
    expect(s.getState().rows[0]!.included).toBe(false);
  });

  it('marks rows as saving during save and saved after', () => {
    const s = createDetectionStore();
    s.getState().handleEvent({ type: 'item', item: sample });
    const id = s.getState().rows[0]!.id;
    s.getState().beginSave([id]);
    expect(s.getState().rows[0]!.saving).toBe(true);
    s.getState().endSave([id]);
    expect(s.getState().rows[0]!.saving).toBe(false);
    expect(s.getState().rows[0]!.saved).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { DetectStreamEvent, DetectedItem } from '@/api/types';

export interface DetectionRow {
  id: string;
  item: DetectedItem;
  included: boolean;
  saving: boolean;
  saved: boolean;
}
type Phase = 'loading' | 'streaming' | 'review';

interface DetectionState {
  phase: Phase;
  runId: string | null;
  traceId: string | null;
  rows: DetectionRow[];
  errorCode: string | null;
  errorMessage: string | null;
  handleEvent: (e: DetectStreamEvent) => void;
  toggleInclude: (id: string) => void;
  patchRow: (id: string, patch: Partial<Omit<DetectionRow, 'id'>>) => void;
  beginSave: (ids: string[]) => void;
  endSave: (ids: string[]) => void;
  reset: () => void;
}

export function createDetectionStore() {
  return createStore<DetectionState>((set) => ({
    phase: 'loading',
    runId: null,
    traceId: null,
    rows: [],
    errorCode: null,
    errorMessage: null,
    handleEvent: (e) =>
      set((s) => {
        if (e.type === 'meta') return { runId: e.runId, traceId: e.traceId };
        if (e.type === 'item') {
          const id = `${s.rows.length}-${e.item.label}`;
          return {
            phase: 'streaming',
            rows: [
              ...s.rows,
              { id, item: e.item, included: true, saving: false, saved: false },
            ],
          };
        }
        if (e.type === 'done') return { phase: 'review' };
        if (e.type === 'error')
          return {
            phase: 'review',
            errorCode: e.code,
            errorMessage: e.message ?? null,
          };
        return s;
      }),
    toggleInclude: (id) =>
      set((s) => ({
        rows: s.rows.map((r) => (r.id === id ? { ...r, included: !r.included } : r)),
      })),
    patchRow: (id, patch) =>
      set((s) => ({ rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
    beginSave: (ids) =>
      set((s) => ({
        rows: s.rows.map((r) => (ids.includes(r.id) ? { ...r, saving: true } : r)),
      })),
    endSave: (ids) =>
      set((s) => ({
        rows: s.rows.map((r) =>
          ids.includes(r.id) ? { ...r, saving: false, saved: true } : r,
        ),
      })),
    reset: () =>
      set({
        phase: 'loading',
        runId: null,
        traceId: null,
        rows: [],
        errorCode: null,
        errorMessage: null,
      }),
  }));
}

const detectionStore = createDetectionStore();
export function useDetectionStore<T>(selector: (s: DetectionState) => T): T {
  return useStore(detectionStore, selector);
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add mobile-app/stores/detection-screen.store.ts mobile-app/stores/detection-screen.store.test.ts
git commit -m "feat(mobile): detection screen state store"
```

### Task 10.3: Map status route response (api-service follow-up)

**Files:**
- Modify: `api-service/src/routes/detect-status.route.ts` and its test

- [ ] **Step 1: Update success branch**

```ts
import { mapSceneToItems } from './detect.mapper';
// inside the switch:
case 'succeeded':
  return reply.code(200).send({
    status: 'completed',
    workflowId: status.runId,
    result: status.result ? { items: mapSceneToItems(status.result) } : undefined,
  });
```

- [ ] **Step 2: Update existing test** in `api-service/src/__tests__/unit/routes/detect-status.route.test.ts` to assert `body.result.items[0].label`.
- [ ] **Step 3: Commit** `feat(api-service): /v1/detect/status response uses DetectedItem[]`.

### Task 10.4: Status client on mobile

**Files:**
- Create: `mobile-app/api/detect-status.ts`

- [ ] **Step 1: Implement**

```ts
import { apiFetch } from './client';
import type { DetectedItem } from './types';

export interface DetectStatus {
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
  workflowId: string;
  result?: { items: DetectedItem[] };
  errorCode?: string;
  errorMessage?: string;
}

export async function getDetectStatus(workflowId: string): Promise<DetectStatus> {
  return apiFetch<DetectStatus>(`/v1/detect/status/${encodeURIComponent(workflowId)}`);
}
```

- [ ] **Step 2: Commit** `feat(mobile): detect-status client`.

### Task 10.5: Compose `app/detection.tsx`

**Files:**
- Modify: `mobile-app/app/detection.tsx`

- [ ] **Step 1:** Read the design's `detection.tsx` (770 lines). Port with these substitutions:
  - Replace the design's `useDetectObjects` mutation with a `useEffect`-launched `for await (const ev of detectImageStream(...))` loop that calls `useDetectionStore().getState().handleEvent(ev)`.
  - Replace AsyncStorage save calls with `useInventory().addItems(...)` mapping included rows.
  - On mount: read `prefs.getLastDetectionRunId()`. If set, call `getDetectStatus(id)` and pre-populate rows when the result comes back; otherwise launch fresh.
  - On `meta`: persist `runId` via `prefs.setLastDetectionRunId(runId)`. On `done` / unmount: clear it.
  - Cancel in-flight stream on screen unmount via `AbortController`.

- [ ] **Step 2: Smoke test** — render the screen with a mock `detectImageStream` that yields `[meta, item×2, done]` and assert the screen reaches the review phase with two rows.

- [ ] **Step 3: Commit** `feat(mobile): detection screen with SSE wiring + crash-resume`.

### Task 10.6: Section 10 merge

```bash
cd api-service && pnpm test
cd ../mobile-app && pnpm lint && pnpm typecheck && pnpm test
git tag -a section-rn-10-detection -m "Section 10: detection screen + SSE wiring"
```

---

# Section 11 — Observability + EAS + Maestro + CI

**Goal:** Sentry + OpenTelemetry tracing on mobile, EAS Build/Update profiles, Maestro flows ported, GitHub Actions CI.

**Files (Section 11):**
- Create: `mobile-app/observability/sentry.ts`, `mobile-app/observability/otel.ts`, `mobile-app/eas.json`, `mobile-app/.maestro/*.yaml`, `.github/workflows/mobile.yml`
- Modify: `mobile-app/app/_layout.tsx`, `mobile-app/api/client.ts`, `mobile-app/app.json`

### Task 11.1: Sentry RN

- [ ] **Step 1: Write `mobile-app/observability/sentry.ts`**

```ts
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

export function initSentry(): void {
  const dsn = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn;
  if (!dsn) return;
  Sentry.init({
    dsn,
    enableNative: true,
    tracesSampleRate: 0.2,
    enableAutoPerformanceTracing: true,
    enableAppHangTracking: true,
    enableAutoSessionTracking: true,
  });
}

export const wrapApp = Sentry.wrap;
```

- [ ] **Step 2: Wire in `_layout.tsx`** — call `initSentry()` once at module load; export `default Sentry.wrap(RootLayout)`.

- [ ] **Step 3: Commit** `feat(mobile): Sentry RN init + wrap`.

### Task 11.2: OpenTelemetry on mobile

- [ ] **Step 1: Write `mobile-app/observability/otel.ts`**

```ts
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, context, propagation, SpanStatusCode } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import Constants from 'expo-constants';

let initialized = false;

export function initOtel(): void {
  if (initialized) return;
  const collector = (Constants.expoConfig?.extra as { otelCollectorUrl?: string } | undefined)
    ?.otelCollectorUrl;
  if (!collector) return;
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  const provider = new WebTracerProvider();
  provider.addSpanProcessor(
    new BatchSpanProcessor(new OTLPTraceExporter({ url: `${collector}/v1/traces` })),
  );
  provider.register();
  initialized = true;
}

export function withSpan<T>(
  name: string,
  fn: (ctx: { spanId: string }) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('mobile-app');
  const span = tracer.startSpan(name);
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const out = await fn({ spanId: span.spanContext().spanId });
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
```

- [ ] **Step 2: Replace `makeTraceparent` in `mobile-app/api/client.ts`** with one that reads from the active OTel context; if no context, fall back to the random one:

```ts
import { trace, context } from '@opentelemetry/api';

export function makeTraceparent(): string {
  const span = trace.getSpan(context.active());
  if (span) {
    const sc = span.spanContext();
    return `00-${sc.traceId}-${sc.spanId}-01`;
  }
  const hex = (n: number) => {
    let out = '';
    for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  };
  return `00-${hex(32)}-${hex(16)}-01`;
}
```

- [ ] **Step 3: Wrap detection in `withSpan('detect.stream')`** in `app/detection.tsx`.

- [ ] **Step 4: Commit** `feat(mobile): OTel JS SDK + traceparent propagation`.

### Task 11.3: EAS Build + Update profiles

- [ ] **Step 1: Write `mobile-app/eas.json`**

```json
{
  "cli": { "version": ">= 14.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "preview"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": { "simulator": true }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": { "production": {} },
  "update": {
    "preview": { "channel": "preview" },
    "production": { "channel": "production" }
  }
}
```

- [ ] **Step 2: Update `mobile-app/app.json`** with extra config, runtime version, and update URL placeholder

```json
"updates": { "url": "https://u.expo.dev/PROJECT_ID_PLACEHOLDER", "fallbackToCacheTimeout": 0 },
"runtimeVersion": { "policy": "appVersion" },
"extra": {
  "apiBaseUrl": "$API_BASE_URL",
  "apiKey": "$API_KEY",
  "sentryDsn": "$SENTRY_DSN",
  "otelCollectorUrl": "$OTEL_COLLECTOR_URL"
}
```

(`PROJECT_ID_PLACEHOLDER` is filled in once at first `eas init`.)

- [ ] **Step 3: Commit** `chore(mobile): EAS Build + Update profiles`.

### Task 11.4: Maestro flows

- [ ] **Step 1:** Audit existing `mobile-app/.maestro/` flows. Rewrite YAML to target the new screen text/testIDs.

- [ ] **Step 2:** Write three core flows:
  1. `home-empty.yaml` — boots, asserts empty state, taps capsule camera, lands on detection screen
  2. `multi-home.yaml` — opens settings, adds home "Cabin", switches active, confirms count badge updates
  3. `search.yaml` — adds an item via mock detection, returns to home, types "leather", asserts result count

- [ ] **Step 3: Commit** `test(mobile): Maestro flows for home/multi-home/search`.

### Task 11.5: GitHub Actions CI

**Files:**
- Create: `.github/workflows/mobile.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: mobile-ci

on:
  push:
    branches: [main]
    paths:
      - 'mobile-app/**'
      - 'api-service/openapi.json'
  pull_request:
    paths:
      - 'mobile-app/**'
      - 'api-service/openapi.json'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - name: Install mobile
        run: |
          cd mobile-app
          pnpm install --frozen-lockfile
      - name: Verify openapi.json is current
        run: |
          cd api-service
          pnpm install --frozen-lockfile
          pnpm export:openapi
          git diff --exit-code openapi.json || \
            (echo "openapi.json is stale; run 'pnpm export:openapi' in api-service" && exit 1)
      - name: Codegen mobile types
        run: |
          cd mobile-app
          pnpm codegen:api
      - name: Lint
        run: cd mobile-app && pnpm lint
      - name: Typecheck
        run: cd mobile-app && pnpm typecheck
      - name: Unit tests
        run: cd mobile-app && pnpm test
```

- [ ] **Step 2: Commit** `ci(mobile): lint + typecheck + tests + openapi-staleness gate`.

### Task 11.6: Section 11 merge

```bash
git tag -a section-rn-11-observability -m "Section 11: observability + EAS + Maestro + CI"
```

---

# Final smoke

After all 12 sections (0–11) merge:

- [ ] **Step 1: All checks green**

```bash
cd api-service && pnpm test
cd ../mobile-app && pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 2: Boot the app on iOS simulator**

```bash
cd api-service && pnpm dev   # terminal 1
cd mobile-app && pnpm start  # terminal 2
# tap the iOS simulator, capture a photo, verify items stream in
```

- [ ] **Step 3: Tag the release candidate**

```bash
git tag -a mobile-rn-rewrite-rc1 -m "RN rewrite candidate 1 — all sections green"
```

---

## Spec coverage check

| Spec section | Plan section(s) |
|---|---|
| 3 Architecture | All sections compose this |
| 4.1 Tech stack | 0, 1, 2, 3, 6, 8, 11 |
| 4.2 Directory layout | 0, 2, 3, 6, 7, 8, 9, 10, 11 |
| 4.3 Persistence schema (Drizzle SQLite + FTS5) | 2 |
| 4.4 Screens | 1, 8, 9, 10 |
| 4.5 State boundaries | 3, 8, 10 |
| 5.1 New SSE endpoint | 5 |
| 5.2 Response shape mapping | 4 (and 10.3 for the status route) |
| 5.3 OpenAPI codegen | 4 (export) + 6 (import) |
| 5.4 Temporal orchestration unchanged | implicitly preserved (no plan task touches `pipeline-service`) |
| 6 Observability (Sentry + OTel + RUM) | 11 |
| 7 Build & deploy (EAS) | 11 |
| 8 Migration plan | 0 (delete Flutter), then linear progress through 1–11 |
| 9 Testing strategy | every section ends green |
| 10 Risks & open questions | mitigations baked into 5 (phase-1 dribble) and section descriptions |
| Appendix A — Flutter delete list | 0 |
| Appendix B — Endpoints summary | 4, 5, 10.3 |
