import AsyncStorage from '@react-native-async-storage/async-storage';
import { Middleware } from '@reduxjs/toolkit';

/**
 * Minimal state persistence.
 *
 * redux-persist is not a dependency, and pulling it in for this would be
 * disproportionate: only a few slices need to survive a restart, and a farmer's
 * plots, alerts and settings must never be lost just because the app was closed.
 *
 * Live telemetry is deliberately *not* persisted — a stale reading rehydrated as
 * current would be worse than showing nothing while the first poll lands.
 */

const KEY = 'drikr:state:v1';
const WRITE_DEBOUNCE_MS = 900;

/** Slices worth keeping across launches. */
const PERSISTED = ['farm', 'alerts', 'drone', 'settings', 'community', 'user'] as const;

export type PersistedSlice = (typeof PERSISTED)[number];

export async function loadPersistedState(): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Only hand back known slices, so an old payload cannot inject stray keys.
    const out: Record<string, unknown> = {};
    for (const slice of PERSISTED) {
      if (parsed[slice] !== undefined) out[slice] = parsed[slice];
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

export async function clearPersistedState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Debounced writer: telemetry ticks must not cause a disk write each second. */
export const persistMiddleware: Middleware = (store) => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (next) => (action) => {
    const result = next(action);

    const type = (action as { type?: string })?.type ?? '';
    // Telemetry churn is high-frequency and not persisted; skip it entirely.
    if (type.startsWith('telemetry/') || type.startsWith('chat/')) return result;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        const state = store.getState() as Record<string, unknown>;
        const snapshot: Record<string, unknown> = {};
        for (const slice of PERSISTED) snapshot[slice] = state[slice];
        AsyncStorage.setItem(KEY, JSON.stringify(snapshot)).catch(() => undefined);
      } catch {
        /* ignore */
      }
    }, WRITE_DEBOUNCE_MS);

    return result;
  };
};
