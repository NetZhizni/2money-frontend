import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import type { FirebaseWebConfig } from './config/serverConfig'

// Firebase is used ONLY for Authentication (Google sign-in) — Firestore is
// gone, replaced by the Express/PostgreSQL API (see src/api/http.ts) plus
// the Dexie-backed offline-first sync layer (see src/db/schema.ts, sync.ts).
//
// Unlike the rest of this file's previous shape, the web config is no
// longer a build-time constant: it comes from whatever server the user
// pointed this device at (GET /api/config/public — see
// src/config/serverConfig.ts, stores/server.ts). So there's nothing to
// initialize at module-eval time anymore — `initFirebaseApp` below is
// called once stores/server.ts has actually fetched (or loaded from cache)
// a config to initialize with.
export const googleProvider = new GoogleAuthProvider()

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null

/**
 * Idempotent within a page load: switching to a genuinely different server
 * always goes through stores/server.ts's `switchTo`, which reloads the page
 * (see its doc comment) rather than hot-swapping a live app to a different
 * Firebase project — re-deriving every singleton from scratch on reload is
 * far simpler and safer. The `deleteApp` guard below is just defensive
 * (HMR in dev, a caller re-running init with the very same config).
 */
export async function initFirebaseApp(config: FirebaseWebConfig): Promise<Auth> {
  if (firebaseApp) await deleteApp(firebaseApp)
  firebaseApp = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  })
  firebaseAuth = getAuth(firebaseApp)
  return firebaseAuth
}

/** Throws if called before initFirebaseApp — every real call site (stores/auth.ts's remote-mode path) only ever runs after stores/server.ts has initialized it. */
export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) throw new Error('[firebase] getFirebaseAuth() called before initFirebaseApp()')
  return firebaseAuth
}

/** Non-throwing variant for call sites that must also tolerate local mode (no server configured, Firebase never initialized) — see src/api/http.ts. */
export function getFirebaseAuthOrNull(): Auth | null {
  return firebaseAuth
}
