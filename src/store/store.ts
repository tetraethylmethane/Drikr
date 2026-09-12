import { combineReducers, configureStore } from '@reduxjs/toolkit';
import alertsReducer from './slices/alertsSlice';
import chatReducer from './slices/chatSlice';
import communityReducer from './slices/communitySlice';
import droneReducer from './slices/droneSlice';
import farmReducer from './slices/farmSlice';
import settingsReducer from './slices/settingsSlice';
import telemetryReducer from './slices/telemetrySlice';
import userReducer from './slices/userSlice';
import { persistMiddleware } from './persist';

/**
 * Language lives only in `settings`. It used to be duplicated in a `language` slice
 * alongside i18next's own state, which meant two sources of truth that could drift;
 * `useLanguage` is now the single way to change it.
 *
 * The reducers are combined explicitly rather than passed as a map so that
 * `preloadedState` gets the exact combined shape — passing a map leaves RTK unable
 * to infer it once a partial rehydrated state is supplied.
 */
const rootReducer = combineReducers({
  farm: farmReducer,
  telemetry: telemetryReducer,
  alerts: alertsReducer,
  drone: droneReducer,
  settings: settingsReducer,
  chat: chatReducer,
  community: communityReducer,
  user: userReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export function createStore(preloadedState?: Record<string, unknown>) {
  return configureStore({
    reducer: rootReducer,
    // `loadPersistedState` only ever returns known slices, so this narrows an
    // already-validated shape rather than trusting arbitrary stored input.
    preloadedState: preloadedState as Partial<RootState> | undefined,
    middleware: (getDefault) =>
      getDefault({
        // Readings and forecasts are plain serialisable objects, but the live
        // telemetry maps are large — running the deep checks on every tick is a
        // measurable cost in dev with nothing to catch.
        serializableCheck: { ignoredPaths: ['telemetry.maps', 'telemetry.history'] },
        immutableCheck: { ignoredPaths: ['telemetry.maps', 'telemetry.history'] },
      }).concat(persistMiddleware),
  });
}

export const store = createStore();

export type AppDispatch = typeof store.dispatch;
