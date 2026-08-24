# 2Money — frontend

Family finance tracker (Vue 3 + TypeScript + Vite). Ported from the FinTrack
prototype, with Firestore replaced end-to-end by the `backend/` Express/
PostgreSQL API — Firebase is used **only** for Google sign-in now.

## Stack

- **Vue 3** (`<script setup>`) + **Vue Router** + **Pinia** (setup stores, one per entity).
- **Dexie (IndexedDB)** — the full local mirror of every entity (`src/db/schema.ts`), not just a cache: every read/write in the app goes through Dexie, never directly through the network. This is what makes the app offline-first.
- **`src/db/sync.ts`** — the sync engine: pushes a Dexie-backed outbox of pending writes to the API, pulls deltas (`?since=`) back into Dexie, runs on login, on regaining connectivity, and every 30s while online.
- **vite-plugin-pwa** — offline app-shell (service worker); the data layer's offline story is the sync engine above, not the SW.
- **firebase/auth** only (no `firebase/firestore` anywhere) for Google sign-in.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in your Firebase web-app config (Authentication -> Google must be enabled)
npm run dev                        # http://localhost:8099, proxies /api -> http://localhost:3100 (see vite.config.ts)
```

The backend must be running and migrated first (see `../backend/README.md`) — the very first Google sign-in against an empty `users` table becomes the family's owner.

## Offline-first, in short

- Every entity store (`stores/accounts.ts`, `categories.ts`, `transactions.ts`, `budgets.ts`, `templates.ts`) is a thin wrapper around `src/db/useSyncedCollection.ts`: a Dexie `liveQuery` view (reactive, works across tabs) plus `put`/`removeLocal`, which write to Dexie immediately and queue the same change into `db.outbox` for the API.
- A write never waits on the network — it's visible in the UI (Dexie) instantly, and syncs whenever the sync engine next gets a chance to push.
- `stores/allAccounts.ts` / `views/TotalBalanceView.vue` read the *whole* `accounts`/`transactions` Dexie tables (own + every other family member's, see `pullAllAccounts`/`pullAllTransactions` in `src/db/sync.ts`) — this app's trust model is full financial transparency within the family.
- `stores/admin.ts` (owner-only, `/admin` route) is the one exception that talks to the API directly with no offline story — user management needs the server's immediate validation and isn't meaningful to queue offline.

## What's gone from the FinTrack prototype

- `firebase/firestore`, `firestore.rules`, the Firestore `allowlist` doc — replaced by the backend's `users` table (see `../backend/README.md`'s "Authorization model").
- Quasar (the previous, unrelated `frontend/` prototype used it) — this app uses FinTrack's own hand-built component set (`components/common/*`) instead.
