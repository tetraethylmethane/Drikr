import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n from './src/i18n/i18n';
import { registerCalibration } from './src/config/calibration';
import { configureNotifications } from './src/services/notifications';
import { registerMasterAddress } from './src/services/hardware';
import { uploadQueued } from './src/services/courier';
import { createStore } from './src/store/store';
import { loadPersistedState } from './src/store/persist';
import { colors } from './src/theme';
import AppNavigator from './src/navigation/AppNavigator';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.brand,
  },
};

type Store = ReturnType<typeof createStore>;

/**
 * App root.
 *
 * Persisted state is loaded *before* the store is created so the first render already
 * has the farmer's plots, alerts and language — mounting with defaults and then
 * rehydrating would flash the demo farm and reset the UI language for a moment.
 */
export default function App() {
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const persisted = await loadPersistedState();
      if (cancelled) return;

      // Language is restored before the first paint.
      const language = (persisted?.settings as { language?: string } | undefined)?.language;
      if (language && language !== i18n.language) {
        await i18n.changeLanguage(language);
      }

      // Push persisted settings into the non-React modules that need them
      // before the first render, so the very first telemetry tick already uses
      // the paired master and the farmer's probe calibration rather than
      // defaults it would then have to correct.
      const settings = persisted?.settings as
        | { masterAddress?: string | null; calibration?: Record<string, never> }
        | undefined;
      registerMasterAddress(settings?.masterAddress ?? null);
      if (settings?.calibration) registerCalibration(settings.calibration);

      configureNotifications();
      setStore(createStore(persisted));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Flush anything queued while offline, once at launch.
  //
  // This used to call `drainOutbox(async () => false)` with the comment that a
  // rejecting sender keeps items queued. It does not: drainOutbox counts every
  // refusal as a failed attempt and drops an item at eight, so the farmer's own
  // alert feedback and community posts were being discarded after eight app
  // launches — exactly the training signal the comment claimed to protect.
  //
  // Telemetry now has a real sender, and uploadQueued touches only telemetry.
  // The farmer's other writes stay queued, untouched and un-penalised, until a
  // backend for them exists.
  useEffect(() => {
    if (!store) return;
    void uploadQueued();
  }, [store]);

  if (!store) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Provider store={store}>
          <NavigationContainer theme={navTheme}>
            {/* Android is edge-to-edge from SDK 54 on, so expo-status-bar no
                longer takes backgroundColor — the bar sits over the app's own
                background, which `Screen` already paints with colors.bg. */}
            <StatusBar style="dark" />
            <AppNavigator />
          </NavigationContainer>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
