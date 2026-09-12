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
}

const initialState: SettingsState = {
  language: 'en',
  confidenceThreshold: 0.55,
  mutedDomains: [],
  notificationsEnabled: true,
  voiceEnabled: true,
  autoSpeak: false,
  refreshSeconds: 20,
  requireDroneConfirmation: true,
  units: 'metric',
  onboarded: false,
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
  },
});

export const {
  setLanguage,
  setConfidenceThreshold,
  toggleMutedDomain,
  setNotificationsEnabled,
  setVoiceEnabled,
  setAutoSpeak,
  setRefreshSeconds,
  setRequireDroneConfirmation,
  setOnboarded,
} = settingsSlice.actions;
export default settingsSlice.reducer;
