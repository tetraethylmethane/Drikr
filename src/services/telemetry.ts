import { hasTelemetryBackend } from '../config/env';
import { Plot, PlotSnapshot, SensorNode, SensorReading } from '../types';
import { assessPlot } from './decisionEngine';
import {
  registerSimProfiles,
  simulateHistory,
  simulateNodeState,
  simulateReading,
} from './simulator/engine';
import { SEED_SIM_PROFILES } from './simulator/seed';
import apiClient from './api';

/**
 * Single seam between the app and field telemetry.
 *
 * Today it resolves to the simulator. When a Drikr gateway is reachable
 * (API_BASE_URL set), the same functions fetch real node data instead, so no screen
 * needs to know which source is live. `telemetrySource()` is surfaced in the UI so
 * a demo never misrepresents simulated data as real hardware.
 */

// Register the demo scenarios once, so simulateReading resolves each plot's own.
registerSimProfiles(SEED_SIM_PROFILES);

export type TelemetrySource = 'hardware' | 'simulated';

export function telemetrySource(): TelemetrySource {
  return hasTelemetryBackend() ? 'hardware' : 'simulated';
}

const HISTORY_POINTS = 24;
const HISTORY_STEP_MS = 30 * 60_000;

async function fetchRemoteReadings(plotId: string): Promise<Record<string, SensorReading> | null> {
  try {
    const res = await apiClient.get(`/telemetry/plots/${plotId}/latest`, { timeout: 8000 });
    const rows = res.data?.readings;
    if (!Array.isArray(rows)) return null;
    const out: Record<string, SensorReading> = {};
    for (const r of rows as SensorReading[]) out[r.nodeId] = r;
    return out;
  } catch {
    // Low-connectivity is expected in the field: fall through to the simulator so
    // the farmer still sees the last coherent picture rather than an empty screen.
    return null;
  }
}

export async function fetchLatestReadings(
  plot: Plot,
  nodes: SensorNode[],
  at: number = Date.now()
): Promise<Record<string, SensorReading>> {
  if (hasTelemetryBackend()) {
    const remote = await fetchRemoteReadings(plot.id);
    if (remote) return remote;
  }
  const out: Record<string, SensorReading> = {};
  for (const node of nodes) {
    if (node.status === 'offline') continue;
    out[node.id] = simulateReading(plot, node, at);
  }
  return out;
}

export function fetchHistory(
  plot: Plot,
  node: SensorNode,
  at: number = Date.now(),
  points = HISTORY_POINTS,
  stepMs = HISTORY_STEP_MS
): SensorReading[] {
  return simulateHistory(plot, node, at, points, stepMs);
}

export function refreshNodes(nodes: SensorNode[], at: number = Date.now()): SensorNode[] {
  if (hasTelemetryBackend()) return nodes;
  return nodes.map((n) => simulateNodeState(n, at));
}

/**
 * Plot-level average across reporting nodes.
 * The headline tiles show the field average, not a single node, so one dry corner
 * does not read as the whole field being dry.
 */
export function aggregateReading(
  plot: Plot,
  readings: SensorReading[],
  at: number = Date.now()
): SensorReading | null {
  if (readings.length === 0) return null;
  const n = readings.length;
  const avg = (pick: (r: SensorReading) => number) =>
    Math.round((readings.reduce((s, r) => s + pick(r), 0) / n) * 100) / 100;

  const bio = readings.map((r) => r.biosensorNa).filter((v): v is number => typeof v === 'number');

  return {
    nodeId: 'plot-aggregate',
    plotId: plot.id,
    gridRef: { row: -1, col: -1 },
    at,
    airTemp: avg((r) => r.airTemp),
    humidity: avg((r) => r.humidity),
    soilMoisture: avg((r) => r.soilMoisture),
    soilTemp: avg((r) => r.soilTemp),
    ph: avg((r) => r.ph),
    ec: avg((r) => r.ec),
    nitrogen: Math.round(avg((r) => r.nitrogen)),
    phosphorus: Math.round(avg((r) => r.phosphorus)),
    potassium: Math.round(avg((r) => r.potassium)),
    leafWetness: avg((r) => r.leafWetness),
    light: Math.round(avg((r) => r.light)),
    rainfall: avg((r) => r.rainfall),
    windSpeed: avg((r) => r.windSpeed),
    voc: Math.round(avg((r) => r.voc)),
    // Pest pressure uses the worst node, not the mean: an outbreak starts local.
    pestActivity: Math.max(...readings.map((r) => r.pestActivity)),
    biosensorNa: bio.length ? Math.round(bio.reduce((a, b) => a + b, 0) / bio.length) : undefined,
  };
}

export function buildSnapshot(
  plot: Plot,
  nodes: SensorNode[],
  readings: Record<string, SensorReading>,
  at: number = Date.now()
): PlotSnapshot | null {
  const plotNodes = nodes.filter((n) => n.plotId === plot.id);
  const list = plotNodes.map((n) => readings[n.id]).filter(Boolean);
  const reading = aggregateReading(plot, list, at);
  if (!reading) return null;

  const worstCalibration = plotNodes.reduce((m, n) => Math.max(m, n.daysSinceCalibration), 0);
  const assessment = assessPlot({
    plot,
    reading,
    nodesOnline: list.length,
    nodesTotal: plotNodes.length,
    calibrationAgeDays: worstCalibration,
  });

  return {
    plotId: plot.id,
    at,
    reading,
    nodesOnline: list.length,
    nodesTotal: plotNodes.length,
    healthIndex: assessment.healthIndex,
    risk: assessment.risk,
  };
}
