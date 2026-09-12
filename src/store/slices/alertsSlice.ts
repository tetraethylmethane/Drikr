import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Alert, AlertFeedback } from '../../types';

interface AlertsState {
  items: Alert[];
  /** Ids already pushed as a notification, so a re-render cannot re-notify. */
  notified: string[];
}

const CAP = 120;

const initialState: AlertsState = {
  items: [],
  notified: [],
};

const alertsSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    addAlerts: (state, action: PayloadAction<Alert[]>) => {
      const existing = new Set(state.items.map((a) => a.id));
      const fresh = action.payload.filter((a) => !existing.has(a.id));
      state.items = [...fresh, ...state.items].slice(0, CAP);
    },
    markNotified: (state, action: PayloadAction<string[]>) => {
      state.notified = Array.from(new Set([...state.notified, ...action.payload])).slice(-CAP);
    },
    acknowledgeAlert: (state, action: PayloadAction<string>) => {
      const a = state.items.find((x) => x.id === action.payload);
      if (a && a.status === 'new') a.status = 'acknowledged';
    },
    resolveAlert: (state, action: PayloadAction<string>) => {
      const a = state.items.find((x) => x.id === action.payload);
      if (a) a.status = 'resolved';
    },
    dismissAlert: (state, action: PayloadAction<string>) => {
      const a = state.items.find((x) => x.id === action.payload);
      if (a) a.status = 'dismissed';
    },
    /** Farmer confirmation — the feedback loop back into the model. */
    submitFeedback: (
      state,
      action: PayloadAction<{ alertId: string; feedback: AlertFeedback }>
    ) => {
      const a = state.items.find((x) => x.id === action.payload.alertId);
      if (a) {
        a.feedback = action.payload.feedback;
        // Saying an alert was wrong dismisses it; confirming it keeps it actionable.
        if (!action.payload.feedback.wasAccurate) a.status = 'dismissed';
        else if (a.status === 'new') a.status = 'acknowledged';
      }
    },
    clearAlerts: (state) => {
      state.items = [];
      state.notified = [];
    },
  },
});

export const {
  addAlerts,
  markNotified,
  acknowledgeAlert,
  resolveAlert,
  dismissAlert,
  submitFeedback,
  clearAlerts,
} = alertsSlice.actions;
export default alertsSlice.reducer;
