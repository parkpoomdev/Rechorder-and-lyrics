import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const rawDatabaseURL =
  import.meta.env.VITE_FIREBASE_DATABASE_URL ||
  (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined);
const databaseURL = rawDatabaseURL ? rawDatabaseURL.replace(/\/+$/, "") : undefined;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId,
  databaseURL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

if (!databaseURL) {
  console.error("Firebase Realtime Database URL is missing. Set VITE_FIREBASE_DATABASE_URL in .env.local");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = databaseURL ? getDatabase(app, databaseURL) : getDatabase(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider };
