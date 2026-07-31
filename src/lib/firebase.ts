import { initializeApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);

let messagingPromise: Promise<Messaging | null> | null = null;

export function getFirebaseMessaging() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (typeof window === "undefined") return null;
      const ok = await isSupported();
      if (!ok) return null;
      return getMessaging(firebaseApp);
    })();
  }
  return messagingPromise;
}

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;
