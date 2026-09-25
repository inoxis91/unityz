# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Guild Manager: a multi-tenant SaaS for World of Warcraft guilds (raid calendar/signups, rosters, fees ledger, craft requests, absences, Warcraft Logs analysis). Monorepo with two independent npm packages, `backend/` (Express 5 + TypeScript + raw `pg`) and `frontend/` (Angular 21, standalone components, signals). Deployed on Railway as a **single service**: the root `Dockerfile` builds the Angular app and copies it into `backend/public`, and in production Express serves it (see "SEO / prerendering" below).

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
- **Auth**: Passport with sessions stored in Postgres (`connect-pg-simple`, table `session` created by `initDb`; cookie `guild_manager_sid`; `secure` + `sameSite: 'none'` in prod; `SESSION_SECRET` is mandatory in prod, the server refuses to start without it). Battle.net (global `oauth.battle.net`, `wow.profile`) is the only login; the Bnet access token is stored on `users.access_token` and reused for Blizzard API calls (`services/blizzardService.ts`). Discord is `passport.authorize` for account linking only. In non-prod, `/api/mock-auth` (`routes/mockAuth.ts` + `lib/mockData.ts`) seeds mock guilds/users and logs in without Bnet.
- **Multi-tenancy**: everything is scoped by `req.user.active_guild_id` (set on `users`), not by URL. Queries must filter by `guild_id`. Middlewares in `middlewares/auth.ts`:
  - `requireActiveGuild`: 403 `NO_ACTIVE_GUILD`
  - `requirePaidGuild`: 402 `GUILD_UNPAID` when `guilds.subscription_expires_at` has passed
  - `hasRole([...])` / `isAdmin`, `canManageRosters`, `canManageEvents`, `canManageFees`. `admin` passes every role check.
- **Roles**: per guild, in `guild_members (user_id, guild_id, role, rank)`; `role` ∈ `admin | raid_leader | treasurer | event_manager | member`, `rank` is the in-game guild rank (the frontend treats ≤2 as GM/officer; Stripe routes require it). `req.user.role` / `req.user.rank` and `/api/users/me` are resolved for the active guild (`UserService.getWithActiveGuildRole`, used by passport `deserializeUser`); the legacy `users.role` / `users.rank` columns are no longer read. `UserService.fetchGuildCharacters` upserts the membership, sets `admin` when the user owns the guild master character and demotes a former admin otherwise. Removing a member (`DELETE /users/:id`) only removes them from the active guild.
- **Subscriptions**: `guilds.subscription_tier` (`none|free|medium|pro`) and `subscription_expires_at` (the only thing `requirePaidGuild` checks), exposed by `routes/stripe.ts` with the logic in `services/billingService.ts`. Stripe prices come from a catalog found or created by `lookup_key` (`guild_manager_<tier>_monthly`); the SDK uses API `dahlia` (period end lives on subscription items, an invoice's subscription on `parent.subscription_details`). The 30-day free trial is once per guild (`free_trial_used_at`, also set by any paid activation). A guild with a running subscription changes plan via `change-plan` (prorated, `always_invoice` + `pending_if_incomplete`), never a second Checkout. Access is only extended by a paid invoice; a failed renewal (`past_due`) keeps access for `PAST_DUE_GRACE_DAYS` and shows managers a banner linking to Stripe's hosted invoice. The webhook verifies signatures against `req.rawBody`, which is captured by the `express.json({ verify })` hook in `index.ts`; keep that hook. `STRIPE_WEBHOOK_SECRET` is empty locally, so use `stripe listen` to receive webhooks in dev. Tier quotas (free: 1 roster / 3 events per month, medium: 2 / 6, pro: unlimited) live in `services/tierLimits.ts`, are checked in the same transaction as the insert with the guild row locked, and are mirrored in `frontend/src/app/constants/tiers.ts`.
- **Side channels**: `lib/discord.ts` (discord.js bot; per-guild channel IDs live on the `guilds` row), `lib/cron.ts` (node-cron, Europe/Paris: daily event reminders, fee reminders on the 15th and last 5 days of the month), nodemailer for support (`routes/support.ts`), Warcraft Logs v2 GraphQL (client credentials). The raid event "Logs & Analyses" tab (`GET /events/:id/logs-analysis`) is built by `services/wclReportService.ts` (report code from `events.logs`, batched per-fight tables, consumables detected from the report's ability icons except the season's combat potion IDs, cached per report+locale) and scored by `services/raidMvpScoring.ts` (pure MVP formula: role-relative criteria and weights, wipe-cascade death rule; the frontend explains it, so keep `logs.criterion.*` i18n in sync). Character performance (dashboard) lives in `services/wclCharacterService.ts`: the current season's raid and Mythic+ zones are detected from WCL `worldData` (no zone IDs to bump each patch; `FALLBACK_SEASON` is only used if detection fails or keys are missing), boss/dungeon names come localized from WCL (`fr.` subdomain), results are cached in memory (`lib/ttlCache.ts`). All WCL calls go through `lib/wclClient.ts`, which maps failures to `HttpError` 502 `WCL_UNAVAILABLE` (404 `WCL_NOT_FOUND` for a missing/private resource) so a WCL 401 is never mistaken for an expired Blizzard token. Every integration no-ops with a warning when its env vars are missing. See `backend/.env.example`; Stripe also needs `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`.
- **Guild membership is proven by Blizzard, never by the client**: selecting a guild (`POST /users/active-guild`) and every character import (`/users/import-characters`, `/characters/import`) go through `UserService.findGuildCharacters`, which checks each character's guild with the Blizzard API and stores Blizzard's class/level. Nothing is written (active guild, `guild_members`, characters) before that check; a failure is 403 `NOT_A_GUILD_MEMBER`. Routes that return guild rows select explicit columns (Stripe ids never reach the browser).
- **Regions (EU + US)**: `lib/regions.ts` is the single source (`WOW_REGIONS`, time zone per region, virtual guild ids). One OAuth token works in every region; `BlizzardService.getAccountCharacters` reads the account profile in each region (404 = no license there). A guild is identified by `(blizzard_id, region)` (unique constraint): never look a guild up by `blizzard_id` alone, and pass the guild's region to every `BlizzardService` call. Blizzard strings are requested in `fr_FR` whatever the region (class names are French everywhere). Events are stored in guild wall time: compare them to `NOW() AT TIME ZONE ${sqlRegionTimeZone('g.region')}`, and daily reminders run at 10:00 local time per region. `/api/users/me` exposes `active_guild_region`, used by the frontend for Raider.io / Warcraft Logs links (`services/character-utils.ts`).
- **Guild help (Entraide)**: `routes/guildHelp.ts` → `services/guildHelpService.ts`, tables `help_posts` (request/offer, `capacity` = max active pairs), `help_applications`, `help_pairs`. Accepting an application creates a pair that lives independently of its post (closing a post never ends pairs); one active pair per (helper, helped) per guild (partial unique index). Capacity and state checks lock the post `FOR UPDATE`; the 5-open-posts quota uses an advisory lock. Authors decide; admins and officers (`isGuildModerator`, rank ≤ 2) can close posts and end pairs. Discord (`services/guildHelpNotifier.ts`, after commit, fire-and-forget): DM to the author on each application, DM to the accepted applicant, new posts in `guilds.discord_help_channel_id`; member text is escaped (no markdown, no `@everyone`).
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
- Shared UI kit: buttons, cards, tabs, fields, badges, KPI tiles, empty/loading states and modals are global `.ui-*` classes in `src/styles.css`, and every connected page starts with `<app-page-header>` (`shared/ui/page-header`). See the "UI kit" section of `docs/design-tokens.md`. Routes are lazy (`loadComponent`) and admin tabs are `@defer`red, so keep new screens out of the initial bundle.

## SEO / prerendering

- Public pages are prerendered at build time (`outputMode: 'static'`, `src/main.server.ts`, `app.routes.server.ts`): `/` (fr), `/en`, `/terms`, `/privacy`. Every other route is client-rendered from `index.csr.html`. There is no Node SSR server.
- Express (`backend/src/index.ts`) serves each prerendered page from its `index.html`, the app routes (`APP_ROUTE_ROOTS`) from `index.csr.html`, and answers **404** for anything else (Angular shows `not-found`). A new public page or app route must be added to `app.routes.ts`, `app.routes.server.ts` (if prerendered), `PRERENDERED_ROUTES` / `APP_ROUTE_ROOTS`, and `public/sitemap.xml` / `robots.txt`.
- Code that runs on a prerendered page must not touch browser globals at construction (`localStorage`, `navigator`, `matchMedia`, timers that never settle): guard with `isPlatformBrowser` or `afterNextRender`. Hydration is on (`provideClientHydration`), so the first client render must match the prerendered DOM.
- The landing's language comes from the URL (`data.locale` on the route), not from the stored preference. `SeoService.apply()` sets title, description, canonical, hreflang (x-default = `/en`), Open Graph and `noindex`. Preview images and PNG icons are generated by `node scripts/social-images.mjs`.

## Conventions

- Commit messages use Conventional Commits with a scope, e.g. `fix(composition): ...`, `style(dashboard): ...`.
- Existing code comments and logs are a mix of French and English; logs are prefixed with a `[Tag]`, e.g. `[Auth]` or `[Cron]`.

## Quality bar for every change

These rules apply to every task, not only when asked.

### UI (any screen or component touched)

- **Polished design**: the screen must look like a finished product, not a form. Follow the patterns of the most recent reworks (`dashboard/parses`, `event-details/raid-lineup`, `event-details/mplus-groups`): cards with `--ui-surface` and a subtle radial gradient, clear hierarchy (title, KPI tiles, actions), useful empty states, badges and icons (`assets/icons/`), consistent 12–22px radii.
- **Light and dark themes**: colors only from the tokens in `src/styles.css` (see `docs/design-tokens.md`). Never use `--ui-shade-rgb` / `--ui-highlight-rgb` for shadows (they flip in dark mode): use `rgba(15, 23, 42, x)` like the existing components. `npm run lint:css` must pass.
- **Responsive**: works from 360px to desktop, no horizontal scroll. Breakpoints used in the app: 1100px, 820px, 640px. On mobile: stacked layout, full-width buttons in a grid, modals become bottom sheets, and drag & drop needs a tap alternative (`cdkDragStartDelay` touch + action sheet).
- **Animations for dynamism**: staggered entrance (`animation-delay: calc(var(--i) * 50ms)`), hover lift, pop on status badges, transitions on bars and counters, `animate.leave` for removals. Always add a `@media (prefers-reduced-motion: reduce)` block that disables them. When a class toggles an `animation`, put it on an inner element, not the host that already has an entrance animation (it would replay).
- **Accessibility**: `:focus-visible` outlines, `aria-label` on icon buttons, `aria-pressed` on toggles, Escape closes modals, cards operable with Enter/Space.
- **UX**: optimistic updates with rollback + toast on error (see `raid-lineup` / `mplus-groups` `commit()`), no action that needs a page refresh to show its result, confirmation (`ConfirmService`) before destructive actions. Look for relevant features to add and propose them.

### Code quality

- Angular: standalone components, `input()` / `output()` / `computed()` / `linkedSignal()`, `ChangeDetectionStrategy.OnPush`, never mutate an `@Input` object. Pure logic (calculations, formatting) goes into a `*-utils.ts` file with its own spec. Split large screens into subcomponents, and use `@defer` for heavy screens that are not visible on load.
- Backend: every query on a guild's data is scoped by `req.user.active_guild_id` (check this on the routes you touch and report the ones that aren't), Zod validation on params/body, `HttpError` with an explicit `code`, and `withTransaction` (`lib/db.ts`) + `FOR UPDATE` when an invariant spans several rows.
- i18n keys in **both** locales, remove the keys that become unused, no dead code left behind.
- Before finishing: `npm test`, `npm run lint:css`, `npx prettier --write` on the touched files (only the ones that were already clean, to avoid noise), `npx tsc --noEmit` in `backend/`, `npm run build` (budgets). Add or update unit tests, and the Playwright axe suite (`e2e/`) when a new screen or state is added.

### Visual verification with the Chrome extension (mandatory for UI changes)

- The stack is usually already running (backend :3000 via `npm run dev`, frontend :4200, Postgres :5433). Log in with the dev mock login on `/login` ("Connexion rapide", profile "GM - Guilde Pro" = `mock_user_6`, admin of the Pro guild), then finish `/select-guild` if asked. A backend restart drops the session.
- Create test data through the app's API (`fetch` with `credentials: 'include'` from the page), not directly in the database.
- Check the real screen: initial render, every interaction (clicks, drag & drop, modals, errors), light **and** dark themes (`document.documentElement.setAttribute('data-theme', ...)`), and mobile. Resizing the window has no effect: to test mobile, render the page in a same-origin `<iframe width=390>`.
- Wait for animations to finish before judging a screenshot (the first frames are semi-transparent). Screenshots are downscaled: compute click coordinates from `getBoundingClientRect()` × (screenshot width / `innerWidth`). `ng serve` live reload wipes any state injected into the page.
- If screenshots keep timing out on a tab, open a new tab rather than retrying.
