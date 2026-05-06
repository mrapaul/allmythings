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
