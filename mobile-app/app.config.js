// Dynamic Expo config. Keeps every static value from app.json and injects the
// runtime endpoints from the environment, so one project can target localhost
// (iOS Simulator) or a LAN IP (physical device on the same Wi-Fi) without
// editing committed files.
//
//   API_BASE_URL   Backend base URL. Defaults to the dev machine's LAN IP so a
//                  physical iPhone can reach the api-service. Override per-run,
//                  e.g. API_BASE_URL=http://localhost:14000 for the Simulator.
//   API_KEY        Bearer/api key for the backend (dev backend accepts any).
//   SENTRY_DSN, OTEL_COLLECTOR_URL  Optional observability endpoints.

// NOTE: this default is baked into release-style builds at build time and
// caused the silent-shutter incident when the Mac's DHCP lease moved
// (.14 → .90 → 2.42): every request hung against a dead IP. Keep it current with
// `ipconfig getifaddr en0`, or better, pass API_BASE_URL explicitly.
// mDNS discovery normally papers over this, but only when the server's
// Bonjour advertisement is actually working.
const DEFAULT_LAN_API = 'http://192.168.2.42:14000';

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.API_BASE_URL || DEFAULT_LAN_API,
    apiKey: process.env.API_KEY || 'dev',
    sentryDsn: process.env.SENTRY_DSN || '',
    otelCollectorUrl: process.env.OTEL_COLLECTOR_URL || '',
  },
});
