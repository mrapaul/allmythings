import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/**
 * Initialize Sentry for React Native. Reads the DSN from
 * `Constants.expoConfig.extra.sentryDsn` (populated from `app.json` at build
 * time and overridable per environment via EAS secrets / `.env`).
 *
 * Safe to call multiple times — Sentry's own SDK guards against re-init.
 * No-op when no DSN is configured (local dev / tests).
 */
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

/**
 * Wraps the root component so Sentry can attach error boundaries and
 * navigation/perf instrumentation. Re-exported as `wrapApp` so callers get a
 * stable name regardless of Sentry SDK shape.
 */
export const wrapApp = Sentry.wrap;
