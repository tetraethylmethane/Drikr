import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, signInAnonymously, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import CryptoJS from 'crypto-js';
import env from './env';

// Import getReactNativePersistence - for Firebase v9+, this should be available
// If not available, we'll handle it gracefully
let getReactNativePersistence: any = null;
try {
  const authModule = require('firebase/auth');
  getReactNativePersistence = authModule.getReactNativePersistence;
} catch (e) {
  // If not found in main module, try react-native submodule
  try {
    getReactNativePersistence = require('firebase/auth/react-native').getReactNativePersistence;
  } catch (e2) {
    console.warn('getReactNativePersistence not found, auth persistence may not work');
  }
}

/**
 * Firebase Configuration
 * 
 * Setup Instructions:
 * 1. Create a Firebase project at https://console.firebase.google.com
 * 2. Enable Phone Authentication in Authentication > Sign-in method
 * 3. Enable Firestore Database in Firestore Database
 * 4. Get your Firebase config from Project Settings > General > Your apps
 * 5. Add the config values to your .env file as EXPO_PUBLIC_* variables
 *    or replace the values below directly
 * 
 * For production, use environment variables:
 * EXPO_PUBLIC_FIREBASE_API_KEY=...
 * EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
 * EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
 * EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
 * EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
 * EXPO_PUBLIC_FIREBASE_APP_ID=...
 */
const firebaseConfig = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.firebase.projectId,
  storageBucket: env.firebase.storageBucket,
  messagingSenderId: env.firebase.messagingSenderId,
  appId: env.firebase.appId,
  measurementId: env.firebase.measurementId,
};

// Initialize Firebase
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Firebase Auth with AsyncStorage persistence for React Native
let auth: Auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  // For React Native, use initializeAuth with AsyncStorage
  try {
    if (getReactNativePersistence) {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(ReactNativeAsyncStorage),
      });
    } else {
      // Fallback if getReactNativePersistence is not available
      auth = getAuth(app);
    }
  } catch (error: any) {
    // If auth is already initialized, get the existing instance
    if (error?.code === 'auth/already-initialized') {
      auth = getAuth(app);
    } else {
      // Fallback to regular getAuth if there's any other error
      auth = getAuth(app);
    }
  }
}

export { auth };
export const db: Firestore = getFirestore(app);

/**
 * Make sure there is a Firebase identity before touching Firestore.
 *
 * Login is phone + PIN and deliberately not Firebase Auth — phone auth needs
 * billing, and a PIN works with no signal once the account exists. The cost was
 * that `request.auth` was always null, so every security rule written against
 * it denied, and the only workable rules were "open to the whole internet".
 *
 * Anonymous auth closes that without changing how a farmer signs in. It is free,
 * needs no Blaze plan, and the session persists in AsyncStorage, so this is one
 * network call on first launch and nothing afterwards.
 *
 * What it does and does not buy, stated plainly:
 *   - it proves a caller is running this app, which keeps anonymous scanners
 *     out of the database entirely;
 *   - it does NOT prove which farmer is calling. The uid is random. Ownership
 *     comes from binding that uid to the phone document on first write, which
 *     the rules then check on everything underneath it.
 *
 * Failure is non-fatal on purpose: the app is offline-first, and a farmer with
 * no signal must still reach every local screen.
 */
export async function ensureSignedIn(): Promise<string | null> {
  try {
    if (auth.currentUser) return auth.currentUser.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch {
    return null;
  }
}

/** The current Firebase uid, or null. Never triggers a sign-in. */
export function currentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

/**
 * A short-lived Firebase ID token, which drikr.vercel.app verifies before it
 * accepts a photo upload: only this app's signed-in users can write there.
 */
export async function idToken(): Promise<string | null> {
  try {
    await ensureSignedIn();
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

// Export firebaseConfig for use in components like FirebaseRecaptchaVerifierModal
export { firebaseConfig };

export type { FirebaseApp };

/**
 * PIN Security Utilities
 * These functions handle secure PIN hashing and verification
 */

/**
 * Hash a PIN using SHA256
 * @param pin - The PIN string to hash (4-6 digits)
 * @returns Hashed PIN string
 */
export const hashPIN = (pin: string): string => {
  return CryptoJS.SHA256(pin).toString();
};

/**
 * Verify if a PIN matches the stored hash
 * @param pin - The PIN to verify
 * @param storedHash - The stored hashed PIN
 * @returns boolean indicating if PIN matches
 */
export const verifyPIN = (pin: string, storedHash: string): boolean => {
  const inputHash = hashPIN(pin);
  return inputHash === storedHash;
};

/**
 * Validate PIN format
 * @param pin - The PIN to validate
 * @returns boolean indicating if PIN is valid (4-6 numeric digits)
 */
export const validatePINFormat = (pin: string): boolean => {
  // Must be numeric and between 4-6 digits
  const pinRegex = /^\d{4,6}$/;
  return pinRegex.test(pin);
};

export default app;

