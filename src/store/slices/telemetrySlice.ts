import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { CourierRun } from '../../services/courier';
import { HealthMap, PlotSnapshot, SensorReading, WeatherForecast } from '../../types';

interface TelemetryState {
  /** Latest reading per node id. */
  readings: Record<string, SensorReading>;
  /** Plot-level aggregate per plot id. */
  snapshots: Record<string, PlotSnapshot>;
  /** Interpolated health map per plot id. */
  maps: Record<string, HealthMap>;
  /** Recent plot-level history for trend charts, oldest first. */
  history: Record<string, SensorReading[]>;
  forecast: WeatherForecast | null;
  lastSyncAt: number | null;
  online: boolean;
  refreshing: boolean;
  /** Non-fatal message, e.g. serving cached data. */
  notice: string | null;
  /**
   * Last phone-as-courier pass. Deliberately not persisted, like everything
   * else in this slice — a courier result rehydrated next launch would claim a
   * walk-past that happened yesterday.
   */
  courier: CourierRun | null;
}

const HISTORY_CAP = 48;

const initialState: TelemetryState = {
  readings: {},
  snapshots: {},
  maps: {},
  history: {},
  forecast: null,
  lastSyncAt: null,
  online: true,
  refreshing: false,
  notice: null,
  courier: null,
};

const telemetrySlice = createSlice({
  name: 'telemetry',
  initialState,
  reducers: {
    setRefreshing: (state, action: PayloadAction<boolean>) => {
      state.refreshing = action.payload;
    },
    ingest: (
      state,
      action: PayloadAction<{
        readings: Record<string, SensorReading>;
        snapshot: PlotSnapshot | null;
        map: HealthMap | null;
        at: number;
      }>
    ) => {
      const { readings, snapshot, map, at } = action.payload;
      Object.assign(state.readings, readings);
      if (snapshot) {
        state.snapshots[snapshot.plotId] = snapshot;
        const series = state.history[snapshot.plotId] ?? [];
        series.push(snapshot.reading);
        // Bounded ring so a long session cannot grow state without limit.
        state.history[snapshot.plotId] = series.slice(-HISTORY_CAP);
      }
      if (map) state.maps[map.plotId] = map;
      state.lastSyncAt = at;
      state.refreshing = false;
    },
    seedHistory: (
      state,
      action: PayloadAction<{ plotId: string; series: SensorReading[] }>
    ) => {
      // Only seed once, so a back-fill never overwrites live samples.
      if (!state.history[action.payload.plotId]?.length) {
        state.history[action.payload.plotId] = action.payload.series.slice(-HISTORY_CAP);
      }
    },
    setForecast: (state, action: PayloadAction<WeatherForecast | null>) => {
      state.forecast = action.payload;
    },
    setOnline: (state, action: PayloadAction<boolean>) => {
      state.online = action.payload;
    },
    setNotice: (state, action: PayloadAction<string | null>) => {
      state.notice = action.payload;
    },
    setCourierRun: (state, action: PayloadAction<CourierRun>) => {
      state.courier = action.payload;
    },
  },
});

export const {
  setRefreshing,
  ingest,
  seedHistory,
  setForecast,
  setOnline,
  setNotice,
  setCourierRun,
} = telemetrySlice.actions;
export default telemetrySlice.reducer;
