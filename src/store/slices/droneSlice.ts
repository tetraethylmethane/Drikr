import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DroneMission } from '../../types';

interface DroneState {
  missions: DroneMission[];
  /**
   * The farmer's last statement about flight conditions, per plot.
   *
   * Persisted with the rest of this slice, which is only safe because every
   * reader checks `FARMER_CHECK_TTL_MS` against `at`. A rehydrated clearance
   * from yesterday must never count — see droneFlightCheck.
   */
  farmerChecks: Record<string, { at: number; safe: boolean }>;
}

const CAP = 60;

const initialState: DroneState = {
  missions: [],
  farmerChecks: {},
};

const droneSlice = createSlice({
  name: 'drone',
  initialState,
  reducers: {
    /** The farmer reports what the weather is actually doing where they stand. */
    recordFarmerFlightCheck: (
      state,
      action: PayloadAction<{ plotId: string; safe: boolean; at: number }>
    ) => {
      if (!state.farmerChecks) state.farmerChecks = {};
      state.farmerChecks[action.payload.plotId] = {
        at: action.payload.at,
        safe: action.payload.safe,
      };
    },
    proposeMissionAction: (state, action: PayloadAction<DroneMission>) => {
      // One open proposal per plot+type, so repeated taps cannot stack missions.
      const duplicate = state.missions.find(
        (m) =>
          m.plotId === action.payload.plotId &&
          m.type === action.payload.type &&
          (m.status === 'proposed' || m.status === 'scheduled' || m.status === 'in_flight')
      );
      if (duplicate) return;
      state.missions = [action.payload, ...state.missions].slice(0, CAP);
    },
    confirmMission: (state, action: PayloadAction<string>) => {
      const m = state.missions.find((x) => x.id === action.payload);
      if (m && m.status === 'proposed') m.status = 'scheduled';
    },
    rescheduleMission: (state, action: PayloadAction<{ id: string; at: number }>) => {
      const m = state.missions.find((x) => x.id === action.payload.id);
      if (m && (m.status === 'proposed' || m.status === 'scheduled' || m.status === 'blocked')) {
        m.scheduledAt = action.payload.at;
        if (m.status === 'blocked') {
          m.status = 'proposed';
          m.blockedReason = undefined;
        }
      }
    },
    abortMission: (state, action: PayloadAction<string>) => {
      const m = state.missions.find((x) => x.id === action.payload);
      if (m && m.status !== 'completed') m.status = 'aborted';
    },
    /** Applied by the mission ticker as scheduled flights progress. */
    syncMission: (state, action: PayloadAction<DroneMission>) => {
      const i = state.missions.findIndex((x) => x.id === action.payload.id);
      if (i >= 0) state.missions[i] = action.payload;
    },
    clearMissions: (state) => {
      state.missions = [];
    },
  },
});

export const {
  proposeMissionAction,
  recordFarmerFlightCheck,
  confirmMission,
  rescheduleMission,
  abortMission,
  syncMission,
  clearMissions,
} = droneSlice.actions;
export default droneSlice.reducer;
