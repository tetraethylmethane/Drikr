import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * The app's navigator, reachable from outside any screen - the voice
 * assistant lives above the screens and has to move between them.
 */
export const navRef = createNavigationContainerRef<any>();

type Listener = (route: string | null) => void;
const listeners = new Set<Listener>();

/** Passed to NavigationContainer's onReady and onStateChange. */
export function notifyRouteChange(): void {
  const name = navRef.isReady() ? navRef.getCurrentRoute()?.name ?? null : null;
  listeners.forEach((l) => l(name));
}

export function onRouteChange(l: Listener): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

const TABS = new Set(['HomeTab', 'FieldsTab', 'AlertsTab', 'ProfileTab']);

/** Go to any screen by name, tabs included. */
export function goTo(screen: string, params?: object): void {
  if (!navRef.isReady()) return;
  if (TABS.has(screen)) navRef.navigate('MainTabs', { screen, params });
  else navRef.navigate(screen, params);
}
