# mobile-app RN/Expo rewrite: dependency drift blocks native iOS install

**Status**: open · **Severity**: high (blocks `expo run:ios` end-to-end) · **Filed**: 2026-05-07

## Summary

The Flutter→RN/Expo rewrite (merged at `3bfb5fd6`) cannot be natively installed on iOS from a clean clone. The CI gate added at `6f212ab4` runs lint/typecheck/Vitest only — `pod install` and `xcodebuild` are macOS-only steps that never ran in CI, so a set of dep version mismatches against Expo SDK 54 shipped to `main` undetected.

`expo-doctor` reports **27 packages out of date** plus duplicate native modules.

## Reproduction

```bash
cd mobile-app
rm -rf node_modules ios
pnpm install
pnpm exec expo run:ios --device <your-iphone>
```

After commits `be36edba` (pnpm hoist) and `101eb62a` (worklets pin), `pod install` succeeds and `xcodebuild` reaches the C++ compile phase, then fails:

```
RNCSafeAreaViewShadowNode.cpp:19:12: error: no member named 'unit' in 'facebook::yoga::StyleLength'
```

## Root causes (in the order they surface)

1. **pnpm isolated linker hides RN native deps from autolinking** → fixed in `be36edba` (`nodeLinker: hoisted`).
2. **`react-native-worklets@0.8.3` resolved by pnpm but `react-native-reanimated@4.0.3` runtime validator demands `0.4.x`** → fixed in `101eb62a` (direct-dep pin to `~0.4.0`). Note: reanimated 4.0.3 has a packaging bug — its peer is `>= 0.4.0` (no upper bound), validator is strict to `0.4`.
3. **`react-native-safe-area-context@4.14.1` calls `facebook::yoga::StyleLength.unit()`, removed in the Yoga shipped with React Native 0.81** → not fixed; needs `~5.6.0` minimum.
4. **Expo SDK 54 expects 27 different package versions than what the rewrite pinned**, including major-version mismatches that imply API-breaking code changes:

   | package | rewrite has | SDK 54 wants | breaking change risk |
   |---|---|---|---|
   | `expo-router` | 5.0.7 | ~6.0.23 | **high** — file-system routing API changed |
   | `@sentry/react-native` | 6.22.0 | ~7.2.0 | medium — init API changed |
   | `expo-image` | 2.0.7 | ~3.0.11 | medium |
   | `expo-splash-screen` | 0.29.24 | ~31.0.13 | medium — version scheme reset |
   | `expo-sqlite` | 15.0.6 | ~16.0.10 | medium — affects `db/`, FTS5 setup |
   | `expo-image-picker` | 16.0.6 | ~17.0.11 | low |
   | `expo-image-manipulator` | 13.0.6 | ~14.0.8 | low |
   | `expo-blur` | 14.0.3 | ~15.0.8 | low |
   | `expo-haptics` | 14.0.1 | ~15.0.8 | low |
   | `expo-constants` | 17.0.8 | ~18.0.13 | low |
   | `expo-file-system` | 18.0.12 | ~19.0.22 | low |
   | `expo-font` | 13.0.4 | ~14.0.11 | low |
   | `expo-linear-gradient` | 14.0.2 | ~15.0.8 | low |
   | `expo-linking` | 7.0.5 | ~8.0.12 | low |
   | `expo-status-bar` | 2.0.1 | ~3.0.9 | low |
   | `expo-system-ui` | 4.0.9 | ~6.0.9 | low |
   | `react-native-safe-area-context` | 4.14.1 | ~5.6.0 | **high** — already crashing build |
   | `@shopify/flash-list` | 2.0.2 | 2.3.1 | minor |
   | `react` / `react-dom` | 19.0.0 | 19.1.0 | minor |
   | `react-native-keyboard-controller` | 1.15.2 | 1.18.5 | minor |
   | `react-native-reanimated` | 4.0.3 | ~4.1.1 | minor (also fixes the worklets validator bug) |
   | `react-native-screens` | 4.4.0 | ~4.16.0 | minor |
   | `react-native-svg` | 15.10.1 | 15.12.1 | minor |
   | `react-native-worklets` | 0.4.2 | 0.5.1 | minor (would supersede `101eb62a`) |
   | `@types/react` | 19.0.14 | ~19.1.10 | dev |
   | `typescript` | 5.7.3 | ~5.9.2 | dev |

5. **Duplicate native modules** at install time (`expo-constants`, `expo-file-system`, `expo-font`) — symptom of the version drift, will resolve once aligned.

## Proposed fix path

Single comprehensive PR on a feature branch (do **not** keep iterating one-version-at-a-time on `main`):

1. `pnpm exec expo install --fix` — bumps all 27 deps to SDK 54-canonical versions in one shot.
2. Drop the `react-native-worklets` direct-dep pin (`101eb62a`) — `expo install --fix` will set `0.5.1` which is what `reanimated@4.1.1` wants. Keep the pnpm hoist (`be36edba`); that's pnpm-config, unrelated to dep versions.
3. Address API breakages, expected to need code changes in:
   - `app/` (expo-router 5→6 routing)
   - `observability/sentry.ts` or wherever `Sentry.init` is called (@sentry/react-native 6→7)
   - `db/` (expo-sqlite 15→16, FTS5 init may need adjustment)
   - Image-handling components (expo-image 2→3, expo-image-picker 16→17, expo-image-manipulator 13→14)
4. Re-run unit tests until green.
5. Run `pnpm exec expo run:ios --device <name>` end-to-end at least once before merging — add a macOS-only CI job to prevent regression.

Estimated effort: 1-3 hours focused work plus build/test cycles.

## Stopgaps already on main (do not revert)

- `be36edba` — `nodeLinker: hoisted` in `pnpm-workspace.yaml`. Required regardless of versions; pnpm + RN autolinking always needs this.
- `101eb62a` — `react-native-worklets ~0.4.0` direct-dep pin. Will be superseded by `expo install --fix` (which moves to `0.5.1`); harmless until then.

## CI gap

`6f212ab4` (`ci(mobile): lint + typecheck + tests + openapi-staleness gate`) does not run `pod install` or `xcodebuild`. Add a macos-latest job that runs at minimum:
- `pnpm install --frozen-lockfile`
- `pnpm exec expo prebuild --platform ios --no-install`
- `pnpm exec expo-doctor` (or `npx expo install --check`)
- `cd ios && pod install --repo-update`

`xcodebuild` for compilation is slow; gating on prebuild + `expo-doctor` would catch all 5 issues above.
