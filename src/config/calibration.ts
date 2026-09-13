import { SensorMetric } from '../types';

/**
 * ADS1115 analog channel calibration.
 *
 * The slave nodes report A0-A3 as raw volts and apply no scaling of their own, so
 * every analog channel needs a curve here before its number means anything.
 *
 * Channels default to `fitted: false`. That is deliberate: an ADS1115 with no probe
 * attached still reports a floating voltage, and passing that through as "soil
 * moisture 0.4%" would be inventing data. An unfitted channel is dropped from the
 * reading entirely, so the UI shows "no sensor" rather than a plausible-looking lie.
 *
 * To bring a probe online: set `fitted: true`, pick the metric, and give two
 * calibration points. Nothing else in the app needs changing.
 */

export interface AnalogChannel {
  /** Which app metric this channel feeds. */
  metric: SensorMetric;
  /** False until a real probe is wired and calibrated. */
  fitted: boolean;
  label: string;
  /**
   * Two-point linear calibration: (volts, value) pairs.
   * For a capacitive moisture probe these are the readings in air and in water —
   * note `dry` is usually the HIGHER voltage, so the slope is negative.
   */
  points: { at: [number, number]; to: [number, number] };
  /** Clamp after conversion, so a noisy probe cannot produce an absurd value. */
  range: [number, number];
  unit: string;
}

export type AnalogChannelKey = 'a0' | 'a1' | 'a2' | 'a3';

/**
 * Per-channel defaults.
 *
 * The intended build is a capacitive soil-moisture probe and a pH board, which is
 * why those two are pre-wired with typical curves — but both stay `fitted: false`
 * until the hardware is actually attached and checked against a reference.
 */
export const ANALOG_CHANNELS: Record<AnalogChannelKey, AnalogChannel> = {
  a0: {
    metric: 'soilMoisture',
    fitted: false,
    label: 'Soil moisture (capacitive)',
    // Typical capacitive probe on 3.3 V: ~2.8 V dry air, ~1.2 V in water.
    points: { at: [2.8, 1.2], to: [0, 100] },
    range: [0, 100],
    unit: '%',
  },
  a1: {
    metric: 'ph',
    fitted: false,
    label: 'Soil pH',
    // Typical analog pH board: 2.5 V at pH 7, ~0.06 V per pH unit.
    points: { at: [2.5, 3.1], to: [7, 4] },
    range: [3, 10],
    unit: '',
  },
  a2: {
    metric: 'ec',
    fitted: false,
    label: 'Soil EC',
    points: { at: [0, 3.3], to: [0, 4] },
    range: [0, 5],
    unit: 'dS/m',
  },
  a3: {
    metric: 'nitrogen',
    fitted: false,
    label: 'Soil nitrogen',
    points: { at: [0, 3.3], to: [0, 400] },
    range: [0, 500],
    unit: 'ppm',
  },
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Convert a channel's volts to its metric value via two-point linear interpolation.
 * Returns null when the channel has no probe fitted, which callers must treat as
 * "no reading" rather than zero.
 */
export function convertAnalog(key: AnalogChannelKey, volts: number): number | null {
  const ch = ANALOG_CHANNELS[key];
  if (!ch.fitted) return null;
  if (!Number.isFinite(volts)) return null;

  const [v1, v2] = ch.points.at;
  const [o1, o2] = ch.points.to;
  if (v2 === v1) return null;

  const value = o1 + ((volts - v1) * (o2 - o1)) / (v2 - v1);
  return Math.round(clamp(value, ch.range[0], ch.range[1]) * 100) / 100;
}

/** Channels with a probe actually attached. */
export function fittedChannels(): AnalogChannelKey[] {
  return (Object.keys(ANALOG_CHANNELS) as AnalogChannelKey[]).filter(
    (k) => ANALOG_CHANNELS[k].fitted
  );
}

/**
 * BME680 gas resistance (kOhm) -> an approximate VOC index the pest model can use.
 *
 * Gas resistance falls as VOC concentration rises, so this is inverse. It is a
 * relative index, NOT a calibrated ppb figure: the BME680 needs a burn-in and a
 * per-sensor baseline for absolute numbers. The pest assessment only uses VOC as
 * a lift above baseline, so a relative index is sufficient — but do not present
 * this as a laboratory measurement.
 */
export function gasResistanceToVocIndex(kOhm: number): number | null {
  if (!Number.isFinite(kOhm) || kOhm <= 0) return null;
  // ~50 kOhm clean air -> low index; falling resistance -> rising index.
  const CLEAN_AIR_KOHM = 50;
  const index = (CLEAN_AIR_KOHM / kOhm) * 150;
  return Math.round(clamp(index, 0, 900));
}
