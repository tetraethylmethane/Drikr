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
  /** Battery volts. Only meaningful when hasVbat is true. */
  vbat: number;
  hasVbat: boolean;
  /** LoRa RSSI of the last report, dBm. */
  rssi: number;
  reports: number;
  /** A relay command is queued, waiting for this node's next wake. */
  pendingCmd: boolean;
  /** Milliseconds until the node is next expected to report. */
  nextInMs: number;
  /** The push interval the master is currently handing out. */
  intervalMs: number;
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

/**
 * Sentinel for a field the hardware does not report.
 * Negative is used rather than 0 because 0 is a legitimate reading for battery
 * and signal, and rather than null so SensorNode stays a plain numeric type.
 */
export const UNKNOWN_METRIC = -1;

export function isKnown(value: number): boolean {
  return value >= 0;
}

/**
 * Li-ion state of charge from terminal voltage.
 *
 * Deliberately crude. A single cell sits at 4.2 V full and 3.0 V empty, but the
 * discharge curve is flat across the middle, so voltage is a poor fuel gauge.
 * This is piecewise rather than linear to avoid the usual lie of reporting 50%
 * for most of the discharge and then falling off a cliff. It is good enough to
 * answer "does this node need attention soon", which is all the UI claims.
 */
export function liIonPercent(volts: number): number {
  if (!Number.isFinite(volts) || volts <= 0) return UNKNOWN_METRIC;
  const points: Array<[number, number]> = [
    [3.0, 0], [3.5, 10], [3.7, 35], [3.85, 60], [4.0, 80], [4.2, 100],
  ];
  if (volts <= points[0][0]) return 0;
  if (volts >= points[points.length - 1][0]) return 100;
  for (let i = 1; i < points.length; i++) {
    const [v1, p1] = points[i - 1];
    const [v2, p2] = points[i];
    if (volts <= v2) {
      return Math.round(p1 + ((volts - v1) * (p2 - p1)) / (v2 - v1));
    }
  }
  return UNKNOWN_METRIC;
}

/**
 * LoRa RSSI to a 0-100 bar. -40 dBm is effectively touching, -120 dBm is the
 * noise floor at SF7.
 */
export function rssiToPercent(rssi: number): number {
  const clamped = Math.max(-120, Math.min(-40, rssi));
  return Math.round(((clamped + 120) / 80) * 100);
}

/**
 * Address entered or discovered during in-app setup.
 *
 * Takes precedence over API_BASE_URL from .env, because a farmer pairing
 * hardware in a field cannot edit a build-time file, and a router may hand the
 * master a different address after a reboot. Pushed in from the store at
 * startup, since this module is not React.
 */
let pairedAddress: string | null = null;

export function registerMasterAddress(address: string | null): void {
  pairedAddress = address && address.trim().length > 0 ? address.trim() : null;
}

/** Whether any master address is configured at all, from either source. */
export function hasMasterAddress(): boolean {
  return Boolean(pairedAddress || env.apiBaseUrl);
}

export function masterBaseUrl(): string {
  const raw = pairedAddress || env.apiBaseUrl;
  if (!raw) return '';
  // Accept "drikr.local", "192.168.1.50" or a full URL - a farmer typing an
  // address off a label will not include a scheme.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

function baseUrl(): string {
  return masterBaseUrl();
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

  // Soil temperature is not measured by any node in this build, so it stays
  // absent rather than being borrowed from air temperature - they diverge by
  // several degrees and the irrigation model would act on the wrong one.

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
    // Battery is real when a divider is fitted, and genuinely unknown when it
    // is not - a node without one reports hasVbat false rather than 0 V, so the
    // UI shows a dash instead of a fake flat battery.
    batteryPct: node.hasVbat ? liIonPercent(node.vbat) : UNKNOWN_METRIC,
    // RSSI is real in v2. Mapped to 0-100 for the existing signal display.
    signalPct: Number.isFinite(node.rssi) && node.rssi !== 0 ? rssiToPercent(node.rssi) : UNKNOWN_METRIC,
    lastSeenAt: Date.now() - (node.ageMs ?? 0),
    // No calibration date is tracked on-device; 0 would imply "just calibrated".
    daysSinceCalibration: UNKNOWN_METRIC,
    hasBiosensor: false,
  };
}

/**
 * Fallback staleness window, used only before the master has told us its push
 * interval.
 *
 * 15 s was correct when the master polled every second. Nodes now sleep between
 * readings, so a 4-minute-old value is normal and healthy - judging it against a
 * 15 s window would mark every node stale forever.
 */
export const HARDWARE_STALE_AFTER_MS = 12 * 60_000;

/**
 * How old a reading may be before the UI calls it stale: about two and a half
 * missed slots. Derived from the master's own interval so raising the interval
 * cannot silently mark every node stale.
 */
export function staleAfterMs(intervalMs?: number): number {
  if (!intervalMs || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return HARDWARE_STALE_AFTER_MS;
  }
  return Math.round(intervalMs * 2.5);
}
