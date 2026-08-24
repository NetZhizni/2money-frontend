import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Firebase is used ONLY for Authentication (Google sign-in) — Firestore is
// gone, replaced by the Express/PostgreSQL API (see src/api/http.ts) plus
// the Dexie-backed offline-first sync layer (see src/db/schema.ts, sync.ts).
export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
