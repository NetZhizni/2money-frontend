# 2Money — frontend

Family finance tracker (Vue 3 + TypeScript + Vite). Ported from the FinTrack
prototype, with Firestore replaced end-to-end by the `backend/` Express/
PostgreSQL API — Firebase is used **only** for Google sign-in now.

The build itself carries no Firebase project, no backend URL, and no other
per-deployment secret: which server (if any) a device talks to is chosen
inside the app itself (see "Connecting to a server" below), so one static
build/Docker image works for anyone self-hosting it.

## Stack

- **Vue 3** (`<script setup>`) + **Vue Router** + **Pinia** (setup stores, one per entity).
- **Dexie (IndexedDB)** — the full local mirror of every entity (`src/db/schema.ts`), not just a cache: every read/write in the app goes through Dexie, never directly through the network. This is what makes the app offline-first.
- **`src/db/sync.ts`** — the sync engine: pushes a Dexie-backed outbox of pending writes to the API, pulls deltas (`?since=`) back into Dexie, runs on login, on regaining connectivity, and every 1min while online. A no-op in local mode (see below) — every push/pull function bails out early via `hasConfiguredServer()` (`src/config/serverConfig.ts`).
- **vite-plugin-pwa** — offline app-shell (service worker); the data layer's offline story is the sync engine above, not the SW.
- **firebase/auth** only (no `firebase/firestore` anywhere) for Google sign-in — lazily initialized at runtime (`src/firebase.ts`) once a server's config is known, rather than from a build-time project.

## Setup

```bash
npm install
npm run dev   # http://localhost:8099, proxies /api -> http://localhost:3100 (see vite.config.ts)
```

The backend must be running and migrated first (see `../backend/README.md`,
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
  scanning (`GEMINI_API_KEY` configured — see `../backend/README.md`), then
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

- Every entity store (`stores/accounts.ts`, `categories.ts`, `transactions.ts`, `budgets.ts`, `templates.ts`) is a thin wrapper around `src/db/useSyncedCollection.ts`: a Dexie `liveQuery` view (reactive, works across tabs) plus `put`/`removeLocal`, which write to Dexie immediately and queue the same change into `db.outbox` for the API.
- A write never waits on the network — it's visible in the UI (Dexie) instantly, and syncs whenever the sync engine next gets a chance to push.
- `stores/allAccounts.ts` / `views/TotalBalanceView.vue` read the *whole* `accounts`/`transactions` Dexie tables (own + every other family member's, see `pullAllAccounts`/`pullAllTransactions` in `src/db/sync.ts`) — this app's trust model is full financial transparency within the family.
- `stores/admin.ts` (owner-only, `/admin` route) is the one exception that talks to the API directly with no offline story — user management needs the server's immediate validation and isn't meaningful to queue offline. Unreachable in local mode (see `router/index.ts`'s guard).

## What's gone from the FinTrack prototype

- `firebase/firestore`, `firestore.rules`, the Firestore `allowlist` doc — replaced by the backend's `users` table (see `../backend/README.md`'s "Authorization model").
- Quasar (the previous, unrelated `frontend/` prototype used it) — this app uses FinTrack's own hand-built component set (`components/common/*`) instead.
