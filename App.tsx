import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyDirection } from './src/hooks/useLanguage';
import { Language } from './src/types';
import i18n from './src/i18n/i18n';
import { registerCalibration } from './src/config/calibration';
import { configureNotifications } from './src/services/notifications';
import { registerMasterAddress } from './src/services/hardware';
import { uploadQueued } from './src/services/courier';
import { pushFarmerWrites } from './src/services/sync';
import { uploadLastFlight } from './src/services/flightUpload';
import { ensureSignedIn } from './src/config/firebase';
import { getSession } from './src/utils/session';
import { createStore } from './src/store/store';
import { loadPersistedState } from './src/store/persist';
import { colors } from './src/theme';
import AppNavigator from './src/navigation/AppNavigator';
import { navRef, notifyRouteChange } from './src/navigation/navigationRef';
import { VoiceAssistantProvider } from './src/components/domain/VoiceAssistant';

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
      // Keep the layout direction in step with the saved language (Urdu is
      // right to left). A mismatch is fixed once, with one restart.
      if (language) {
        applyDirection(language as Language);
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
  // Telemetry has always had a real sender in uploadQueued, which touches only
  // telemetry. The farmer's other writes — alert acknowledgements, feedback,
  // scout observations, mission confirmations, community posts — used to have
  // none at all: they queued to the device and stayed there. pushFarmerWrites
  // is that missing sender.
  //
  // Both are safe to call unconditionally. Each no-ops when its backend is
  // unconfigured, so running entirely offline against the simulator is still a
  // supported way to use the app rather than a failure path.
  useEffect(() => {
    if (!store) return;
    void (async () => {
      // Firestore rules require an identity. Without this the reads and writes
      // below are rejected rather than merely empty, and an offline-first app
      // would look broken instead of quiet.
      await ensureSignedIn();
      await uploadQueued();
      const session = await getSession();
      await pushFarmerWrites(session?.phoneNumber ?? null);
      // A flight whose photos could not go up right after landing (the phone
      // was still on the drone's WiFi) goes now - only with consent.
      const st = store.getState();
      if (st.settings.sharePhotos === true) {
        const plot = st.farm.plots.find((p) => p.id === st.farm.selectedPlotId) ?? st.farm.plots[0];
        await uploadLastFlight({ plotId: plot?.id, crop: plot?.crop, stage: plot?.stage }).catch(() => undefined);
      }
    })();
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
          <NavigationContainer theme={navTheme} ref={navRef} onReady={notifyRouteChange} onStateChange={notifyRouteChange}>
            {/* Android is edge-to-edge from SDK 54 on, so expo-status-bar no
                longer takes backgroundColor — the bar sits over the app's own
                background, which `Screen` already paints with colors.bg. */}
            <StatusBar style="dark" />
            {/* The voice assistant sits above every screen. */}
            <VoiceAssistantProvider>
              <AppNavigator />
            </VoiceAssistantProvider>
          </NavigationContainer>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
