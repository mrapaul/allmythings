# EAS setup

This file documents the one-shot setup an engineer needs to run before
`eas build` / `eas update` will work for this project.

## 1. Replace the project ID placeholder

`app.json` ships with a placeholder updates URL:

```json
"updates": {
  "url": "https://u.expo.dev/PROJECT_ID_PLACEHOLDER",
  "fallbackToCacheTimeout": 0
}
```

Run `eas init` from `mobile-app/` (after authenticating with `eas login`):

```bash
cd mobile-app
eas init
```

`eas init` writes the real EAS project ID into `app.json` (and `eas.json`'s
implicit project link). Commit the resulting diff.

## 2. Provide build-time secrets

The `extra` block in `app.json` references `$API_BASE_URL`, `$API_KEY`,
`$SENTRY_DSN`, and `$OTEL_COLLECTOR_URL`. EAS substitutes those from
project-scoped secrets. Set them once with:

```bash
eas secret:create --scope project --name API_BASE_URL --value 'https://api.example.com'
eas secret:create --scope project --name API_KEY --value '<key>'
eas secret:create --scope project --name SENTRY_DSN --value '<sentry dsn>'
eas secret:create --scope project --name OTEL_COLLECTOR_URL --value 'https://otel.example.com'
```

For local development each value falls back to a sensible default
(`http://localhost:14000`, no Sentry DSN, no OTel collector) so unit tests
and `expo start` work without secrets.

## 3. Build profiles (in `eas.json`)

| Profile     | Distribution | Channel    | Notes                              |
| ----------- | ------------ | ---------- | ---------------------------------- |
| development | internal     | preview    | dev client, hot reload             |
| preview     | internal     | preview    | iOS simulator build for stakeholders |
| production  | store        | production | autoIncrement build numbers        |

Update channels share names with build channels so `eas update --channel
preview` reaches preview builds and `--channel production` reaches store
builds.
