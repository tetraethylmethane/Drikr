import env from '../config/env';
import {
  ANALOG_CHANNELS,
  AnalogChannelKey,
  convertAnalog,
  gasResistanceToVocIndex,
} from '../config/calibration';
import { GridRef, Plot, SensorNode, SensorReading } from '../types';

/**
 * Client for the Drikr sensor Master.
 *
 * The Master is an ESP32 that polls the LoRa slave nodes and exposes them over
 * HTTP. It runs in station mode on the farm WiFi, so the phone can read sensors
 * while staying on the internet (weather, mandi prices and account sync all need
 * it). If the Master fails to join, its firmware falls back to its own access
 * point at 192.168.1.1.
 *
 *   GET /api/status  identity + which network mode came up
 *   GET /api/nodes   [{ id, online, ageMs, hasBme280, ..., temp, hum, a0..a3 }]
 *   GET /set_out     relay control
 *
 * React Native's fetch is not subject to CORS, so no server-side headers are
 * needed for any of this.
 */

/** One node exactly as the Master serialises it. */
export interface MasterNode {
  id: string;
  online: boolean;
  everSeen: boolean;
  ageMs: number;
  hasBme280: boolean;
  hasBme680: boolean;
  hasBh1750: boolean;
  hasAds1115: boolean;
  temp: number;
  hum: number;
  pres: number;
  gas: number;
  lux: number;
  a0: number;
  a1: number;
  a2: number;
  a3: number;
  out1: boolean;
  out2: boolean;
}

export interface MasterStatus {
  device: string;
  protocol: number;
  mode: 'station' | 'accessPoint';
  ip: string;
  loraReady: boolean;
  nodeCount: number;
  uptimeMs: number;
  lastAnyRxMs: number;
}

const DEFAULT_TIMEOUT_MS = 6000;

function baseUrl(): string {
  return env.apiBaseUrl.replace(/\/+$/, '');
}

async function get<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirm the configured address is actually a Drikr master.
 * Without this a stale API_BASE_URL pointing at some other device on the LAN
 * could have its JSON silently interpreted as field readings.
 */
export async function fetchStatus(): Promise<MasterStatus | null> {
  try {
    const s = await get<MasterStatus>('/api/status', 4000);
    return s?.device === 'drikr-master' ? s : null;
  } catch {
    return null;
  }
}

export async function fetchNodes(): Promise<MasterNode[] | null> {
  try {
    const rows = await get<MasterNode[]>('/api/nodes');
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/** Switch a relay on a slave. `node` is the Master's own id, e.g. "S1". */
export async function setOutput(node: string, output: 1 | 2, on: boolean): Promise<boolean> {
  try {
    await get<unknown>(`/set_out?Node=${encodeURIComponent(node)}&Out=${output}&Val=${on ? 't' : 'f'}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Map a Master node onto the app's SensorReading.
 *
 * Only fields the hardware genuinely measures are set. Everything else is left
 * `undefined` rather than defaulted to 0 — the presence flags and the calibration
 * config are the source of truth for what is real, and a fabricated zero would
 * feed straight into the risk engine as if it were a measurement.
 */
export function mapNodeToReading(
  node: MasterNode,
  plotId: string,
  gridRef: GridRef,
  at: number = Date.now()
): Partial<SensorReading> & { nodeId: string; plotId: string; gridRef: GridRef; at: number } {
  const reading: Partial<SensorReading> & {
    nodeId: string;
    plotId: string;
    gridRef: GridRef;
    at: number;
  } = {
    nodeId: `${plotId}-${node.id}`,
    plotId,
    gridRef,
    at: at - (node.ageMs ?? 0),
  };

  // BME280 or BME680 — either supplies air temperature and humidity.
  if (node.hasBme280 || node.hasBme680) {
    reading.airTemp = node.temp;
    reading.humidity = node.hum;
  }

  // Gas resistance is BME680 only, and becomes a relative VOC index.
  if (node.hasBme680) {
    const voc = gasResistanceToVocIndex(node.gas);
    if (voc != null) reading.voc = voc;
  }

  if (node.hasBh1750) {
    reading.light = Math.round(node.lux);
  }

  // Analog channels: only those with a calibrated probe fitted.
  if (node.hasAds1115) {
    const raw: Record<AnalogChannelKey, number> = {
      a0: node.a0,
      a1: node.a1,
      a2: node.a2,
      a3: node.a3,
    };
    (Object.keys(raw) as AnalogChannelKey[]).forEach((key) => {
      const value = convertAnalog(key, raw[key]);
      if (value == null) return;
      (reading as Record<string, unknown>)[ANALOG_CHANNELS[key].metric] = value;
    });
  }

  return reading;
}

/** Map the Master's node ids onto grid positions within a plot. */
export function gridRefForNode(plot: Plot, index: number, total: number): GridRef {
  const { rows, cols } = plot.grid;
  if (total <= 1) return { row: Math.floor(rows / 2), col: Math.floor(cols / 2) };
  // Spread nodes across the field diagonally so interpolation has spatial spread.
  const frac = (index + 0.5) / total;
  return {
    row: Math.min(rows - 1, Math.floor(frac * rows)),
    col: Math.min(cols - 1, Math.floor((1 - frac) * cols)),
  };
}

/** Hardware node descriptor, for the Sensor Nodes screen. */
export function mapNodeToSensorNode(node: MasterNode, plot: Plot, gridRef: GridRef): SensorNode {
  const stale = !node.online;
  return {
    id: `${plot.id}-${node.id}`,
    plotId: plot.id,
    label: node.id,
    gridRef,
    status: node.online ? 'online' : node.everSeen ? 'degraded' : 'offline',
    // The slaves report no battery or RSSI over this protocol, so these are not
    // invented: 100 means "unknown, mains/USB assumed" and is labelled as such
    // in the UI rather than shown as a measured percentage.
    batteryPct: 100,
    signalPct: node.online ? 100 : 0,
    lastSeenAt: Date.now() - (node.ageMs ?? 0),
    daysSinceCalibration: 0,
    hasBiosensor: false,
  };
}

export const HARDWARE_STALE_AFTER_MS = 15000;
