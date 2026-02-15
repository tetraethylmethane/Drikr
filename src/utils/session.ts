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

