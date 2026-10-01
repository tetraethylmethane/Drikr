import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Language, RiskDomain } from '../../types';

interface SettingsState {
  language: Language;
  /**
   * Minimum model confidence before a risk becomes an alert. The deck's stated
   * mitigation for false alerts; exposed to the farmer because trust is personal —
   * someone burned by a bad warning can raise the bar.
   */
  confidenceThreshold: number;
  mutedDomains: RiskDomain[];
  notificationsEnabled: boolean;
  voiceEnabled: boolean;
  /** Speak recommendations aloud automatically — for low literacy users. */
  autoSpeak: boolean;
  /** Live telemetry poll interval, seconds. Longer saves battery and data. */
  refreshSeconds: number;
  /** Require explicit confirmation before any autonomous spray. */
  requireDroneConfirmation: boolean;
  units: 'metric';
  onboarded: boolean;
  /**
   * Home as one sentence and four buttons (default) rather than the full
   * dashboard. Optional because state saved before this existed has no value;
   * anything but `false` means simple.
   */
  simpleHome?: boolean;
  /** What it costs this farmer to carry one quintal one km to a mandi, round trip. */
  transportCostPerQKm?: number;
  /** When the farmer agreed to the privacy notice (DPDP Act). */
  privacyAcceptedAt?: number;
  /** Up to three numbers that get urgent alerts as SMS from this phone. Empty = off. */
  smsNumbers?: string[];
  /** The first-launch language screen has been answered. */
  languageChosen?: boolean;
  /** Guided setup after sign-up has been finished (or skipped). */
  setupDone?: boolean;
  /**
   * Consent to upload drone photos to train the crop AI. Undefined = not asked
   * yet; nothing is uploaded until this is explicitly true.
   */
  sharePhotos?: boolean;
  /** Screens whose spoken guide has already played once. */
  guidedScreens?: string[];

  /**
   * Address of the sensor master, as entered or discovered during setup.
   *
   * Persisted separately from API_BASE_URL in .env: a farmer pairing hardware in
   * the field cannot edit a build-time file, and their router may hand the master
   * a different address after a reboot.
   */
  masterAddress: string | null;
  /** True once hardware pairing has completed at least once. */
  sensorsPaired: boolean;

  /**
   * Farmer-recorded calibration for the analog channels, keyed by channel.
   *
   * Overrides the defaults in config/calibration.ts. Persisted because a probe
   * calibration is physical work the farmer did with a glass of water — losing it
   * on restart would mean doing it again, and stale curves silently produce wrong
   * soil readings.
   */
  calibration: Record<string, { fitted: boolean; points: { at: [number, number]; to: [number, number] } }>;
}

const initialState: SettingsState = {
  language: 'en',
  confidenceThreshold: 0.55,
  mutedDomains: [],
  notificationsEnabled: true,
  voiceEnabled: true,
  // Voice first: the home summary and answers are read aloud unless turned off.
  autoSpeak: true,
  refreshSeconds: 20,
  requireDroneConfirmation: true,
  units: 'metric',
  onboarded: false,
  simpleHome: true,
  masterAddress: null,
  sensorsPaired: false,
  calibration: {},
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setLanguage: (state, action: PayloadAction<Language>) => {
      state.language = action.payload;
    },
    setConfidenceThreshold: (state, action: PayloadAction<number>) => {
      state.confidenceThreshold = Math.min(0.95, Math.max(0.3, action.payload));
    },
    toggleMutedDomain: (state, action: PayloadAction<RiskDomain>) => {
      const i = state.mutedDomains.indexOf(action.payload);
      if (i >= 0) state.mutedDomains.splice(i, 1);
      else state.mutedDomains.push(action.payload);
    },
    setNotificationsEnabled: (state, action: PayloadAction<boolean>) => {
      state.notificationsEnabled = action.payload;
    },
    setVoiceEnabled: (state, action: PayloadAction<boolean>) => {
      state.voiceEnabled = action.payload;
    },
    setAutoSpeak: (state, action: PayloadAction<boolean>) => {
      state.autoSpeak = action.payload;
    },
    setRefreshSeconds: (state, action: PayloadAction<number>) => {
      state.refreshSeconds = Math.min(300, Math.max(5, action.payload));
    },
    setRequireDroneConfirmation: (state, action: PayloadAction<boolean>) => {
      state.requireDroneConfirmation = action.payload;
    },
    setOnboarded: (state, action: PayloadAction<boolean>) => {
      state.onboarded = action.payload;
    },
    setTransportCost: (state, action: PayloadAction<number>) => {
      state.transportCostPerQKm = action.payload;
    },
    setPrivacyAccepted: (state, action: PayloadAction<number>) => {
      state.privacyAcceptedAt = action.payload;
    },
    setLanguageChosen: (state, action: PayloadAction<boolean>) => {
      state.languageChosen = action.payload;
    },
    setSetupDone: (state, action: PayloadAction<boolean>) => {
      state.setupDone = action.payload;
    },
    setSharePhotos: (state, action: PayloadAction<boolean>) => {
      state.sharePhotos = action.payload;
    },
    markGuided: (state, action: PayloadAction<string>) => {
      const seen = state.guidedScreens ?? [];
      if (!seen.includes(action.payload)) state.guidedScreens = [...seen, action.payload];
    },
    setSmsNumbers: (state, action: PayloadAction<string[]>) => {
      state.smsNumbers = action.payload.slice(0, 3);
    },
    setSimpleHome: (state, action: PayloadAction<boolean>) => {
      state.simpleHome = action.payload;
    },
    setMasterAddress: (state, action: PayloadAction<string | null>) => {
      state.masterAddress = action.payload;
    },
    setSensorsPaired: (state, action: PayloadAction<boolean>) => {
      state.sensorsPaired = action.payload;
    },
    setChannelCalibration: (
      state,
      action: PayloadAction<{
        channel: string;
        fitted: boolean;
        points: { at: [number, number]; to: [number, number] };
      }>
    ) => {
      const { channel, fitted, points } = action.payload;
      state.calibration[channel] = { fitted, points };
    },
    clearChannelCalibration: (state, action: PayloadAction<string>) => {
      delete state.calibration[action.payload];
    },
  },
});

export const {
  setMasterAddress,
  setSensorsPaired,
  setChannelCalibration,
  clearChannelCalibration,
  setLanguage,
  setConfidenceThreshold,
  toggleMutedDomain,
  setNotificationsEnabled,
  setVoiceEnabled,
  setAutoSpeak,
  setRefreshSeconds,
  setRequireDroneConfirmation,
  setOnboarded,
  setSimpleHome,
  setTransportCost,
  setPrivacyAccepted,
  setSmsNumbers,
  setLanguageChosen,
  setSetupDone,
  setSharePhotos,
  markGuided,
} = settingsSlice.actions;
export default settingsSlice.reducer;
