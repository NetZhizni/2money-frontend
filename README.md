# Stork — frontend

Family finance tracker (Vue 3 + TypeScript + Vite). Ported from an earlier
prototype, with Firestore replaced end-to-end by the `2money-backend` Express/
PostgreSQL API — Firebase is used **only** for Google sign-in now.

The build itself carries no Firebase project, no backend URL, and no other
per-deployment secret: which server (if any) a device talks to is chosen
inside the app itself (see "Connecting to a server" below), so one static
build/Docker image works for anyone self-hosting it.

## Stack

- **Vue 3** (`<script setup>`) + **Vue Router** + **Pinia** (setup stores, one per entity).
- **Dexie (IndexedDB)** — the full local mirror of every entity (`src/db/schema.ts`), not just a cache: every read/write in the app goes through Dexie, never directly through the network. This is what makes the app offline-first.
- **`src/db/sync/`** — the sync engine, imported as one module (`db/sync`, see its `index.ts`): `outbox.ts` pushes a Dexie-backed outbox of pending writes to the API, `pull.ts` pulls deltas (`?since=`) back into Dexie, `orchestrator.ts` decides when (on sign-in, on coming back to the app, on regaining connectivity, shortly after a local change, and on a timer that runs every 15s while there's activity and backs off to 1min — only while the app is visible), `issues.ts` keeps the changes the server refused, `clock.ts` stamps changes on the server's clock and `lock.ts` keeps two tabs from running the same job. A no-op in local mode (see below) — every push/pull bails out early via `hasConfiguredServer()` (`src/config/serverConfig.ts`).
- **vite-plugin-pwa** — offline app-shell (service worker); the data layer's offline story is the sync engine above, not the SW.
- **firebase/auth** only (no `firebase/firestore` anywhere) for Google sign-in — lazily initialized at runtime (`src/firebase.ts`) once a server's config is known, rather than from a build-time project.

## Setup

```bash
npm install
npm run dev   # http://localhost:8099, proxies /api -> http://localhost:3100 (see vite.config.ts)
```

The backend must be running and migrated first (see `../2money-backend/README.md`,
including its `FIREBASE_WEB_*` config) — the very first Google sign-in
against an empty `users` table becomes the family's owner. On first launch
the app itself asks for the backend's URL (see below); in dev, connecting to
`http://localhost:8099` (this same origin — Vite's proxy forwards `/api` to
the backend) works out of the box.

## Connecting to a server

There's no `.env.local` Firebase config to fill in anymore. Instead, on
first launch `views/ServerSetupView.vue` asks for a server URL:

- Enter a server's address (e.g. `https://money.example.com`, or this
  origin itself in a bundled single-domain deployment) — the app fetches
  `GET {url}/api/config/public` (`src/config/serverConfig.ts`), which hands
  back that server's Firebase web config and whether it supports receipt
  scanning (`GEMINI_API_KEY` configured — see `../2money-backend/README.md`), then
  signs in with Google against that project.
- Or pick **"work offline, without a server"** — see below.

The chosen server is remembered (`localStorage`, plus its config cached for
offline boot) until changed in Settings → Server, which always wipes this
device's local Dexie cache and reloads before connecting elsewhere — a
different server means a different `users` table and usually a different
Firebase project, so there's no partial migration, only "start over as a
new device" (any still-unsynced local write gets one best-effort push to
the outgoing server first).

## Local (fully offline) mode

Skipping server setup runs the app entirely on-device: a synthetic single-
user profile (`stores/auth.ts`'s `LOCAL_PROFILE`), no Firebase, no network
calls at all, no sync, no receipt scanning (that's a backend call) — just
Dexie. Everything else (accounts, categories, transactions, budgets,
recurring templates, CSV/JSON export) works the same as in server mode. A
server can be connected later from Settings without losing the offline
data already there other than the same wipe described above (export a
backup first — Settings → Data → Export JSON).

## Offline-first, in short

- Every entity store (`stores/accounts.ts`, `categories.ts`, `tags.ts`, `transactions.ts`, `budgets.ts`, `templates.ts`, `receipts.ts`) is a thin wrapper around `src/db/useSyncedCollection.ts`: a Dexie `liveQuery` view (reactive, works across tabs) plus `put`/`removeLocal`, which write to Dexie immediately and queue the same change into `db.outbox` for the API.
- A write never waits on the network — it's visible in the UI (Dexie) instantly, and syncs whenever the sync engine next gets a chance to push.
- Every pull asks for the family-wide view (`pullEntity(entity, { scope: 'all' })` in `src/db/sync/pull.ts`), so Dexie holds every family member's rows, not just your own. `stores/allAccounts.ts` (and `allTemplates.ts`, `allBudgets.ts`, `allReceipts.ts`) read those whole tables — for cross-profile transfers and account labels — while the profile-scoped stores (accounts, transactions, budgets, receipts) show whoever "View as" (`stores/viewAs.ts`) points at, including "everyone" for the combined family view. This app's trust model is full financial transparency within the family.
- Recurring templates (`stores/templates.ts`, `src/db/recurring.ts`) are booked on-device: on app start every due occurrence becomes an operation, except for templates set to "confirm each payment", whose due occurrences wait on the Recurring page (`views/RecurringView.vue`, Settings → Recurring payments) to be booked or skipped.
- `stores/admin.ts` (owner-only, `/admin` route) is the one exception that talks to the API directly with no offline story — user management needs the server's immediate validation and isn't meaningful to queue offline. Unreachable in local mode (see `router/index.ts`'s guard).

## Android (Google Play) via TWA

The app is already a fully installable PWA (manifest + service worker +
maskable icons), so the path to Google Play is to wrap it in a **Trusted Web
Activity** rather than rewrite anything — a TWA renders the site in real
Chrome, so IndexedDB/Dexie sync, `getUserMedia` receipt capture, and
clipboard paste all keep working unchanged. No Capacitor/Cordova needed
unless native-only features (biometric app-lock, OS push notifications,
home-screen widgets) get planned later — those layer on top of the same Vue
code without a rewrite either.

**Prerequisite: pick one canonical HTTPS domain first.** The repo currently
has two live deploy targets — Firebase Hosting (`storknest.web.app`,
auto-deployed by `.github/workflows/firebase-hosting-merge.yml`) and the
self-hosted Docker/nginx image (`fin2.leleka.pp.ua`, see `allowedHosts` in
`vite.config.ts`). Whichever one is chosen becomes the app's permanent
identity in Play Console (Digital Asset Links + package name), so it isn't
meant to change post-launch.

Once a domain is picked:

1. **Generate the Android package** — easiest via [PWABuilder](https://www.pwabuilder.com)
   (paste the site URL, no local Android SDK/JDK needed; it can generate a
   signing key for you) or, if a local Android toolchain is available,
   `npx @bubblewrap/cli init --manifest=https://<domain>/manifest.webmanifest`.
2. **Host Digital Asset Links** at `https://<domain>/.well-known/assetlinks.json`
   with the SHA-256 fingerprint PWABuilder/Bubblewrap prints for the signing
   key — see `public/.well-known/assetlinks.json` in this repo, which both
   deploy targets already serve correctly as a static file (nginx's
   `try_files` and Firebase Hosting's exact-file match both take priority
   over the SPA catch-all rewrite, so no server config changes are needed).
   Without this file matching, the TWA falls back to showing a browser
   address bar instead of a full-screen app.
3. **Play Console setup**: privacy policy URL, the Data Safety form (this app
   collects financial data + Google account info, and shares data across
   family members — answer accordingly), Play App Signing enrollment.
4. **Content updates ship as normal web deploys** — no store review needed
   unless the native shell itself (icons, manifest identity, asset links)
   changes.

## What's gone from the original prototype

- `firebase/firestore`, `firestore.rules`, the Firestore `allowlist` doc — replaced by the backend's `users` table (see `../2money-backend/README.md`'s "Authorization model").
- Quasar (the previous, unrelated `frontend/` prototype used it) — this app uses its own hand-built component set (`components/common/*`) instead.
