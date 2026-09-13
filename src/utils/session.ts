import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserSession {
  phoneNumber: string;
  sessionToken: string;
  loggedIn: boolean;
}

/**
 * Get the current user session from AsyncStorage
 * @returns UserSession object or null if not logged in
 */
export const getSession = async (): Promise<UserSession | null> => {
  try {
    const sessionData = await AsyncStorage.getItem('userSession');
    if (sessionData) {
      return JSON.parse(sessionData);
    }
    return null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

/**
 * Set the user session in AsyncStorage
 * @param session - UserSession object to store
 */
export const setSession = async (session: UserSession): Promise<void> => {
  try {
    await AsyncStorage.setItem('userSession', JSON.stringify(session));
  } catch (error) {
    console.error('Error setting session:', error);
  }
};

/**
 * Clear the user session from AsyncStorage (logout)
 */
export const clearSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem('userSession');
  } catch (error) {
    console.error('Error clearing session:', error);
  }
};

/**
 * Check if user is currently logged in
 * @returns boolean indicating if user is logged in
 */
export const isLoggedIn = async (): Promise<boolean> => {
  const session = await getSession();
  return session?.loggedIn === true;
};

/**
 * Local PIN credentials.
 *
 * The account of record lives in Firestore, but requiring it to sign in makes the
 * whole app unusable whenever Firestore is unreachable — a dead network, or, as
 * happened here, a project where the Firestore API was never enabled. Everything
 * else in Drikr runs backend-free, so auth should too.
 *
 * A locally stored credential lets a farmer create a PIN and get in with no
 * connectivity, and lets them sign in again later on the same device. The hash is
 * the same SHA-256 value that would go to Firestore.
 *
 * This does keep a PIN hash on the device. For a 4-6 digit PIN that hash is
 * brute-forceable by anyone with the unlocked phone — but the session token stored
 * beside it already grants access, so it is not a new exposure. It is a deliberate
 * trade for working offline, and it is why the PIN gates app access only, never a
 * financial action.
 */

const CREDENTIAL_PREFIX = 'drikr:pin:';

export interface LocalCredential {
  phoneNumber: string;
  pinHash: string;
  createdAt: number;
  /** False until the account has been mirrored to Firestore. */
  synced: boolean;
}

export const saveLocalCredential = async (
  phoneNumber: string,
  pinHash: string,
  synced = false
): Promise<void> => {
  try {
    const cred: LocalCredential = { phoneNumber, pinHash, createdAt: Date.now(), synced };
    await AsyncStorage.setItem(CREDENTIAL_PREFIX + phoneNumber, JSON.stringify(cred));
  } catch {
    /* a failed write must not block sign-in */
  }
};

export const getLocalCredential = async (phoneNumber: string): Promise<LocalCredential | null> => {
  try {
    const raw = await AsyncStorage.getItem(CREDENTIAL_PREFIX + phoneNumber);
    return raw ? (JSON.parse(raw) as LocalCredential) : null;
  } catch {
    return null;
  }
};

export const markCredentialSynced = async (phoneNumber: string): Promise<void> => {
  const cred = await getLocalCredential(phoneNumber);
  if (cred) await saveLocalCredential(phoneNumber, cred.pinHash, true);
};
