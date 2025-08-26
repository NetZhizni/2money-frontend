import * as firebaseApp from 'firebase/app'
import * as firebaseAuth from 'firebase/auth'
import { GoogleAuthProvider, getAuth } from 'firebase/auth'

const provider = new GoogleAuthProvider()

provider.setCustomParameters({
  prompt: 'select_account',
})

const firebaseConfig = {
  apiKey: "AIzaSyBZ6ja4bbVEGhjZm53YGKWgAjntGKrYKp0",
  authDomain: "to-my-money.firebaseapp.com",
  projectId: "to-my-money",
  storageBucket: "to-my-money.firebasestorage.app",
  messagingSenderId: "407668681415",
  appId: "1:407668681415:web:371bfa440ef09698e06ce2",
  measurementId: "G-3H8VLR22V3"
}

const app = firebaseApp.initializeApp(firebaseConfig)
const auth = getAuth(app)

export { firebaseAuth, auth, provider }
