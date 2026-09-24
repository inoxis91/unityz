# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Guild Manager: a multi-tenant SaaS for World of Warcraft guilds (raid calendar/signups, rosters, fees ledger, craft requests, absences, Warcraft Logs analysis). Monorepo with two independent npm packages, `backend/` (Express 5 + TypeScript + raw `pg`) and `frontend/` (Angular 21, standalone components, signals). Deployed on Railway as a **single service**: the root `Dockerfile` builds the Angular app and copies it into `backend/public`, and in production Express serves it with an SPA fallback.

## Commands

```bash
# Full local stack (Postgres on :5433, Adminer on :8085, backend :3000, frontend :4200)
docker compose up --build -d
docker compose down && docker compose up --build   # when changes aren't picked up (esp. frontend)

# Without Docker (needs a Postgres reachable via DATABASE_URL in backend/.env)
npm run setup        # installs backend + frontend deps
npm run dev          # runs both concurrently

# Backend (cd backend)
npm run dev          # ts-node-dev --transpile-only (no type checking!)
npm run build        # tsc — the only type check for the backend
npx tsc --noEmit     # type-check without emitting

# Frontend (cd frontend)
npm start            # ng serve --host 0.0.0.0
npm run build        # production build (budgets: 1MB warn / 2MB error initial; 20kB/30kB per component style)
npm test             # ng test (Vitest via @angular/build:unit-test)
npx ng test --include src/app/services/auth.spec.ts   # single spec file
npx prettier --write <file>                            # printWidth 100, singleQuote
npm run lint:css     # Stylelint: bans hex/named colors and font sizes < 0.75rem in src/app
npm run e2e          # Playwright + axe contrast checks (light, dark, dark mobile); needs the stack running
```

There are no backend tests and no backend linter. CI (`.github/workflows/ci.yml`) runs Stylelint, unit tests and the build for the frontend, `tsc` for the backend, then the Playwright accessibility suite against Postgres + backend + `ng serve`. `backend/test-wcl.ts` / `backend/fetch-report.ts` are ad-hoc WCL API scripts (`npx ts-node <file>` from `backend/`), not part of the app.

## Backend architecture

- **Entry point** `backend/src/index.ts`: session/passport setup, route mounting, the Battle.net/Discord OAuth routes, `/api/auth/logout`, and `/api/users/me` (which enriches the user with the active guild's subscription/fee state) are defined inline here, not in `routes/`.
- **Layering**: `routes/*.ts` (Express routers) → `services/*.ts` (static-method classes, e.g. `RosterService.getAll`) → `pool` from `lib/db.ts`. Some routes still query `pool` directly. Raw parameterized SQL everywhere; no ORM.
- **Schema/migrations**: there is no migration tool. `initDb()` in `lib/db.ts` runs on every boot and is the source of truth for the schema: `CREATE TABLE IF NOT EXISTS` plus idempotent `DO $$ ... IF NOT EXISTS (information_schema.columns ...) ALTER TABLE ... $$` blocks. New columns must be added both to the `CREATE TABLE` and as an idempotent `ALTER` block so existing prod databases migrate.
- **Validation**: Zod schemas in `schemas/` wrap `{ body, query, params }` and are applied with `validate(schema)` from `middlewares/validate.ts`.
- **Errors**: handlers `next(error)` into `middlewares/errorHandler.ts`. It maps an Axios 401 (expired Blizzard token) to HTTP 401 so the frontend can trigger Bnet re-auth. JSON error shape: `{ status: 'error', message, code? }`.
- **Auth**: Passport with sessions (cookie `guild_manager_sid`; `secure` + `sameSite: 'none'` in prod). Battle.net (EU, `wow.profile`) is the only login; the Bnet access token is stored on `users.access_token` and reused for Blizzard API calls (`services/blizzardService.ts`). Discord is `passport.authorize` for account linking only. In non-prod, `/api/mock-auth` (`routes/mockAuth.ts` + `lib/mockData.ts`) seeds mock guilds/users and logs in without Bnet.
- **Multi-tenancy**: everything is scoped by `req.user.active_guild_id` (set on `users`), not by URL. Queries must filter by `guild_id`. Middlewares in `middlewares/auth.ts`:
  - `requireActiveGuild`: 403 `NO_ACTIVE_GUILD`
  - `requirePaidGuild`: 402 `GUILD_UNPAID` when `guilds.subscription_expires_at` has passed
  - `hasRole([...])` / `isAdmin`, `canManageRosters`, `canManageEvents`, `canManageFees`. `admin` passes every role check.
- **Roles**: `users.role` ∈ `admin | raid_leader | treasurer | event_manager | member` is a single column per user (not per guild). `UserService.fetchGuildCharacters` sets `admin` automatically when the user owns the guild master character and demotes a former admin otherwise. `users.rank` is the in-game guild rank (the frontend treats ≤2 as GM/officer).
- **Subscriptions**: `guilds.subscription_tier` (`none|free|medium|pro`) and `subscription_expires_at`, managed by `routes/stripe.ts`. The webhook verifies signatures against `req.rawBody`, which is captured by the `express.json({ verify })` hook in `index.ts`; keep that hook. Tier limits are enforced inline in routes (e.g. max 2 rosters below `pro`).
- **Side channels**: `lib/discord.ts` (discord.js bot; per-guild channel IDs live on the `guilds` row), `lib/cron.ts` (node-cron, Europe/Paris: daily event reminders, fee reminders on the 15th and last 5 days of the month), nodemailer for support (`routes/support.ts`), `services/wclService.ts` (Warcraft Logs v2 GraphQL, client credentials: event report analysis). Character performance (dashboard) lives in `services/wclCharacterService.ts`: the current season's raid and Mythic+ zones are detected from WCL `worldData` (no zone IDs to bump each patch; `FALLBACK_SEASON` is only used if detection fails or keys are missing), boss/dungeon names come localized from WCL (`fr.` subdomain), results are cached in memory (`lib/ttlCache.ts`). All WCL calls go through `lib/wclClient.ts`, which maps failures to `HttpError` 502 `WCL_UNAVAILABLE` so a WCL 401 is never mistaken for an expired Blizzard token. Every integration no-ops with a warning when its env vars are missing. See `backend/.env.example`; Stripe also needs `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`.
- **Discord i18n**: bot messages go through `t()` in `backend/src/lib/i18n.ts` (fr/en, keyed by `guilds.discord_locale`).

## Frontend architecture

- Standalone components only (`components/<name>/<name>.{ts,html,css}`), no NgModules. Files don't use the `.component` suffix (`fees.ts`, class `FeesComponent`). State lives in `providedIn: 'root'` services under `services/` using Angular signals (`signal`/`computed`) populated via `tap` on `HttpClient` observables.
- Every HTTP call passes `{ withCredentials: true }` (session cookie). Base URL is `environment.apiUrl`: `http://localhost:3000/api` in dev, `/api` in prod (same origin).
- `AuthService` (`services/auth.ts`) holds `currentUser` and mirrors the backend's permission logic as computed signals (`canManageRosters`, `canManageEvents`, `canManageFees`, `canAccessAdmin`). Keep them in sync with `backend/src/middlewares/auth.ts`. Route guards live in `guards/`.
- Onboarding flow: login (Bnet) → `/select-guild` (sets active guild, imports characters) → `/payment` if the guild is unpaid → app.
- UI strings go through `I18nService.t('key')` (`services/i18n.ts`, fr/en dictionaries in one file). Add keys to **both** locales. `LOCALE_ID` is `fr`.
- WoW domain constants (classes, specs, icons) live in `constants/wow.ts`; class icons are in `public/assets/icons/class/`.
- Theming: `ThemeService` sets `<html data-theme="light|dark">` (explicit choice in localStorage, otherwise the OS preference; `index.html` applies it before first paint). All colors in `src/app/**/*.css` must come from the tokens in `src/styles.css` (`--ui-*`, `--color-<class>*`, `--wcl-*`); see `docs/design-tokens.md`. Landing, login, select-guild, payment, navbar and the support widget are dark by design and exempt.
- Component styles are emulated (no `ViewEncapsulation.None`): shared UI goes into its own component (e.g. `event-details/raid-buffs`) rather than leaking global selectors.

## Conventions

- Commit messages use Conventional Commits with a scope, e.g. `fix(composition): ...`, `style(dashboard): ...`.
- Existing code comments and logs are a mix of French and English; logs are prefixed with a `[Tag]`, e.g. `[Auth]` or `[Cron]`.
