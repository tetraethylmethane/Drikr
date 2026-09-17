import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { assessPlot, PlotAssessment } from '../services/decisionEngine';
import { generateAlerts } from '../services/alertEngine';
import { buildHealthMap } from '../services/healthMap';
import { notifyAlert } from '../services/notifications';
import { cacheGet, cacheSet, isOnline } from '../services/offline';
import {
  buildSnapshot,
  fetchHistory,
  fetchLatestReadings,
  refreshNodes,
  telemetrySource,
} from '../services/telemetry';
import { fetchForecast } from '../services/weather';
import { addAlerts, markNotified } from '../store/slices/alertsSlice';
import { setNodes } from '../store/slices/farmSlice';
import {
  ingest,
  seedHistory,
  setForecast,
  setHardwareUnreachable,
  setOnline,
  setRefreshing,
} from '../store/slices/telemetrySlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { HealthMap, Plot, PlotSnapshot, SensorReading, WeatherForecast } from '../types';
import { useCourier } from './useCourier';

/**
 * Drives the whole data pipeline for the selected plot.
 *
 * One hook owns the loop so the sequence is guaranteed in order —
 * readings -> aggregate -> health map -> risk scoring -> alerts -> notifications —
 * and every screen reads the result from the store rather than re-deriving it.
 * Mounting this in more than one place would double-poll, so it is mounted once,
 * at the navigator level.
 */

const WEATHER_TTL_MS = 30 * 60_000;
const CONNECTIVITY_CHECK_MS = 60_000;

export function useTelemetryEngine() {
  const dispatch = useAppDispatch();
  const { plots, nodes, selectedPlotId } = useAppSelector((s) => s.farm);
  const alerts = useAppSelector((s) => s.alerts.items);
  const notified = useAppSelector((s) => s.alerts.notified);
  const forecast = useAppSelector((s) => s.telemetry.forecast);
  const { refreshSeconds, confidenceThreshold, mutedDomains, notificationsEnabled } =
    useAppSelector((s) => s.settings);

  const plot = useMemo(
    () => plots.find((p) => p.id === selectedPlotId) ?? plots[0] ?? null,
    [plots, selectedPlotId]
  );

  /**
   * Everything the tick reads lives in a ref.
   *
   * `tick` must stay referentially stable: the poll interval depends on it, and
   * node state is refreshed every 60s, so if `nodes` were a dependency the interval
   * would be torn down and rebuilt each minute — which silently capped the refresh
   * interval at 60s no matter what the farmer chose in settings.
   */
  const stateRef = useRef({
    alerts,
    notified,
    confidenceThreshold,
    mutedDomains,
    notificationsEnabled,
    nodes,
    forecast,
  });
  stateRef.current = {
    alerts,
    notified,
    confidenceThreshold,
    mutedDomains,
    notificationsEnabled,
    nodes,
    forecast,
  };

  const tick = useCallback(
    async (plotArg: Plot | null) => {
      if (!plotArg) return;
      const at = Date.now();
      const plotNodes = stateRef.current.nodes.filter((n) => n.plotId === plotArg.id);
      if (plotNodes.length === 0) return;

      const readings = await fetchLatestReadings(plotArg, plotNodes, at);

      // Hardware mode with nothing coming back is a reportable state, not a
      // slow start. Flagged rather than left to look like "still connecting".
      if (telemetrySource() === 'hardware') {
        dispatch(setHardwareUnreachable(Object.keys(readings).length === 0));
      }

      const snapshot = buildSnapshot(plotArg, plotNodes, readings, at);
      const map = buildHealthMap(plotArg, plotNodes, readings, at);

      dispatch(ingest({ readings, snapshot, map, at }));

      if (!snapshot) return;

      // Risk scoring uses the plot aggregate plus its recent history for trends.
      const assessment = assessPlot(
        {
          plot: plotArg,
          reading: snapshot.reading,
          nodesOnline: snapshot.nodesOnline,
          nodesTotal: snapshot.nodesTotal,
          calibrationAgeDays: plotNodes.reduce((m, n) => Math.max(m, n.daysSinceCalibration), 0),
          forecast: stateRef.current.forecast,
        },
        stateRef.current.confidenceThreshold
      );

      const fresh = generateAlerts({
        plot: plotArg,
        assessment,
        map,
        existing: stateRef.current.alerts,
        confidenceThreshold: stateRef.current.confidenceThreshold,
        mutedDomains: stateRef.current.mutedDomains,
        now: at,
      });

      if (fresh.length > 0) {
        dispatch(addAlerts(fresh));
        if (stateRef.current.notificationsEnabled) {
          const seen = new Set(stateRef.current.notified);
          const toNotify = fresh.filter((a) => !seen.has(a.id));
          for (const a of toNotify) await notifyAlert(a);
          if (toNotify.length) dispatch(markNotified(toNotify.map((a) => a.id)));
        }
      }
    },
    // Only `dispatch` — every other input is read from stateRef, keeping this stable.
    [dispatch]
  );

  // --- Back-fill history so trend charts are not empty on first launch ---------
  useEffect(() => {
    if (!plot) return;
    const plotNodes = stateRef.current.nodes.filter((n) => n.plotId === plot.id);
    if (plotNodes.length === 0) return;
    const series = fetchHistory(plot, plotNodes[0], Date.now(), 24, 30 * 60_000);
    dispatch(seedHistory({ plotId: plot.id, series }));
  }, [plot?.id, dispatch]);

  // --- Poll loop --------------------------------------------------------------
  useEffect(() => {
    if (!plot) return;
    let cancelled = false;

    const run = () => {
      if (!cancelled) void tick(plot);
    };

    run();
    const id = setInterval(run, Math.max(5, refreshSeconds) * 1000);

    // Pause while backgrounded — a field device should not burn battery polling
    // a screen nobody is looking at — and refresh immediately on return.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') run();
    });

    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
    };
  }, [plot?.id, refreshSeconds, tick]);

  // --- Node health ------------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      dispatch(setNodes(refreshNodes(stateRef.current.nodes)));
    }, 60_000);
    return () => clearInterval(id);
  }, [dispatch]);

  // --- Weather, cached so it survives going offline ---------------------------
  useEffect(() => {
    if (!plot) return;
    let cancelled = false;

    const load = async () => {
      const key = `weather:${plot.centroid.lat.toFixed(3)},${plot.centroid.lon.toFixed(3)}`;
      const cached = await cacheGet<WeatherForecast>(key);
      if (cached && !cancelled) dispatch(setForecast(cached.value));
      if (cached && !cached.stale) return;
      try {
        const fresh = await fetchForecast(plot.centroid);
        if (cancelled) return;
        dispatch(setForecast(fresh));
        await cacheSet(key, fresh, WEATHER_TTL_MS);
      } catch {
        // Keep the cached forecast; climate risk degrades to sensor-only scoring.
      }
    };

    void load();
    const id = setInterval(load, WEATHER_TTL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [plot?.centroid.lat, plot?.centroid.lon, dispatch]);

  // --- Phone-as-courier -------------------------------------------------------
  // Mounted here because this hook is already the one guaranteed-single owner of
  // a polling loop. The returned callback is the manual "Sync now".
  const syncCourier = useCourier();

  // --- Connectivity -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const online = await isOnline();
      if (!cancelled) dispatch(setOnline(online));
    };
    void check();
    const id = setInterval(check, CONNECTIVITY_CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [dispatch]);

  const refresh = useCallback(async () => {
    dispatch(setRefreshing(true));
    await tick(plot);
    dispatch(setRefreshing(false));
  }, [dispatch, tick, plot]);

  return { plot, refresh, syncCourier };
}

/** Read-only view of the current plot's derived state, for screens. */
export function usePlotState(plotId?: string | null): {
  plot: Plot | null;
  snapshot: PlotSnapshot | null;
  map: HealthMap | null;
  history: SensorReading[];
  assessment: PlotAssessment | null;
  forecast: WeatherForecast | null;
} {
  const { plots, nodes, selectedPlotId } = useAppSelector((s) => s.farm);
  const { snapshots, maps, history, forecast } = useAppSelector((s) => s.telemetry);
  const confidenceThreshold = useAppSelector((s) => s.settings.confidenceThreshold);

  const id = plotId ?? selectedPlotId;
  const plot = useMemo(() => plots.find((p) => p.id === id) ?? plots[0] ?? null, [plots, id]);
  const snapshot = plot ? (snapshots[plot.id] ?? null) : null;
  const map = plot ? (maps[plot.id] ?? null) : null;
  const series = plot ? (history[plot.id] ?? []) : [];

  const assessment = useMemo(() => {
    if (!plot || !snapshot) return null;
    const plotNodes = nodes.filter((n) => n.plotId === plot.id);
    return assessPlot(
      {
        plot,
        reading: snapshot.reading,
        history: series,
        nodesOnline: snapshot.nodesOnline,
        nodesTotal: snapshot.nodesTotal,
        calibrationAgeDays: plotNodes.reduce((m, n) => Math.max(m, n.daysSinceCalibration), 0),
        forecast,
      },
      confidenceThreshold
    );
  }, [plot, snapshot, series, nodes, forecast, confidenceThreshold]);

  return { plot, snapshot, map, history: series, assessment, forecast };
}
