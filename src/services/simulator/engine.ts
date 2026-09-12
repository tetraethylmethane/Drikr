import { cropProfile } from '../../config/agronomy';
import { GridRef, Plot, SensorNode, SensorReading } from '../../types';

/**
 * Field telemetry simulator.
 *
 * The hardware in the deck's BOM (4 sensor nodes + BME688 + SPCE biosensor) is not
 * wired to this build, so the app runs on a physics-flavoured simulation instead of
 * random numbers. It is deterministic for a given (nodeId, timestamp): the same
 * moment always produces the same reading, so a demo can be replayed and the health
 * map does not flicker between renders.
 *
 * Swapping in real hardware means changing the source in `telemetry.ts` only —
 * nothing here leaks into the UI.
 */

/** Hash-based PRNG: stable across runs, unlike Math.random. */
function hash(...parts: Array<string | number>): number {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 0..1
  return ((h >>> 0) % 100000) / 100000;
}

/** Signed noise in [-amp, amp]. */
function noise(amp: number, ...parts: Array<string | number>): number {
  return (hash(...parts) * 2 - 1) * amp;
}

/** Smooth value that drifts over `periodMs` rather than jumping each tick. */
function drift(amp: number, at: number, periodMs: number, ...parts: Array<string | number>): number {
  const bucket = Math.floor(at / periodMs);
  const frac = (at % periodMs) / periodMs;
  const a = noise(amp, ...parts, bucket);
  const b = noise(amp, ...parts, bucket + 1);
  // cosine ease between successive buckets
  const t = (1 - Math.cos(frac * Math.PI)) / 2;
  return a + (b - a) * t;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function hourOfDay(at: number): number {
  const d = new Date(at);
  return d.getHours() + d.getMinutes() / 60;
}

/** Daylight fraction 0..1, peaking around 13:00. */
function solar(at: number): number {
  const h = hourOfDay(at);
  if (h < 6 || h > 18.5) return 0;
  return Math.max(0, Math.sin(((h - 6) / 12.5) * Math.PI));
}

/**
 * Scenario knobs for one plot. Registered per plot via `registerSimProfiles`, so
 * different fields tell different stories rather than sharing one global bias.
 * Values around 1.0 are strong, 0.2 is mild; moisture/nutrient biases are signed
 * (negative = drier / more depleted).
 */
export interface SimProfile {
  pestPressure: number;
  moistureBias: number;
  nutrientBias: number;
  seed: string;
}

export const DEFAULT_SIM_PROFILE: SimProfile = {
  pestPressure: 0.72,
  moistureBias: -0.18,
  nutrientBias: -0.22,
  seed: 'drikr-h043',
};

/**
 * Registered scenarios. Plots a farmer adds themselves fall back to the neutral
 * default rather than inheriting a scripted demo state.
 */
const PROFILES: Record<string, SimProfile> = {};

export function registerSimProfiles(profiles: Record<string, SimProfile>): void {
  Object.assign(PROFILES, profiles);
}

export function simProfileFor(plotId: string): SimProfile {
  return PROFILES[plotId] ?? DEFAULT_SIM_PROFILE;
}

/**
 * Per-cell terrain factor: low ground holds water, a corner of the field runs dry.
 * This is what makes the health map show a coherent hot-spot instead of noise.
 */
function terrain(plot: Plot, ref: GridRef): { wet: number; fert: number; pest: number } {
  const { rows, cols } = plot.grid;
  const ny = rows > 1 ? ref.row / (rows - 1) : 0.5;
  const nx = cols > 1 ? ref.col / (cols - 1) : 0.5;

  // Stable per-plot hot-spot centre.
  const hx = 0.3 + hash(plot.id, 'hx') * 0.45;
  const hy = 0.28 + hash(plot.id, 'hy') * 0.45;
  const dist = Math.hypot(nx - hx, ny - hy);
  // Gaussian bump around the hot-spot.
  const bump = Math.exp(-(dist * dist) / 0.045);

  // A dry ridge along one edge.
  const ridge = Math.max(0, 1 - Math.hypot(nx - 1, ny - 0) / 0.9);

  return {
    wet: -10 * ridge + 6 * Math.exp(-((ny - 0.85) ** 2) / 0.08) + noise(1.6, plot.id, ref.row, ref.col, 'w'),
    fert: -18 * bump * 0.35 - 8 * ridge + noise(6, plot.id, ref.row, ref.col, 'f'),
    pest: bump,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round(v: number, dp = 1): number {
  const m = Math.pow(10, dp);
  return Math.round(v * m) / m;
}

/**
 * Generate the reading a node would report at `at`.
 * Pure: same inputs always give the same output.
 */
export function simulateReading(
  plot: Plot,
  node: SensorNode,
  at: number,
  profile: SimProfile = simProfileFor(plot.id)
): SensorReading {
  const crop = cropProfile(plot.crop);
  const s = solar(at);
  const terr = terrain(plot, node.gridRef);
  const seed = `${profile.seed}:${node.id}`;

  // --- Weather-driven baselines -------------------------------------------------
  // Seasonal mean plus a diurnal swing; nights bottom out a few hours after dusk.
  const seasonal = 26 + drift(3.5, at, 5 * DAY, seed, 'season');
  const airTemp = seasonal + s * 7.5 - (1 - s) * 3.2 + drift(1.1, at, 3 * HOUR, seed, 'at');

  // Humidity is inversely coupled to temperature, with a dawn peak.
  const humidity = clamp(
    92 - (airTemp - 20) * 2.6 + (1 - s) * 8 + drift(4, at, 4 * HOUR, seed, 'rh'),
    22,
    99
  );

  // Rain arrives in bursts a few times a week.
  const rainGate = hash(seed, 'rain', Math.floor(at / (12 * HOUR)));
  const rainfall = rainGate > 0.86 ? round(clamp(drift(9, at, 2 * HOUR, seed, 'rf') + 5, 0, 22), 1) : 0;

  const windSpeed = clamp(6 + s * 5 + drift(5.5, at, 3 * HOUR, seed, 'wind') + (rainfall > 0 ? 7 : 0), 0, 42);

  // --- Soil ---------------------------------------------------------------------
  // Soil temperature lags air temperature by ~3h and swings less.
  const laggedSolar = solar(at - 3 * HOUR);
  const soilTemp = seasonal * 0.92 + laggedSolar * 4.2 + drift(0.7, at, 6 * HOUR, seed, 'st');

  // Moisture: evapotranspiration decay, rain recharge, irrigation every ~4 days.
  const moistureBand = crop.bands.soilMoisture?.ideal ?? [40, 70];
  const midMoisture = (moistureBand[0] + moistureBand[1]) / 2;
  const irrigationPhase = ((at / DAY) % 4) / 4; // 0 just irrigated -> 1 driest
  const depletion = irrigationPhase * 16 * (1 + s * 0.35);
  const soilMoisture = clamp(
    midMoisture +
      profile.moistureBias * 14 +
      terr.wet -
      depletion +
      rainfall * 0.9 +
      drift(2.2, at, 6 * HOUR, seed, 'sm'),
    8,
    96
  );

  const ph = clamp(6.6 + terr.fert * 0.012 + drift(0.18, at, 2 * DAY, seed, 'ph'), 4.4, 8.8);
  const ec = clamp(0.85 + drift(0.35, at, DAY, seed, 'ec') + (soilMoisture < 30 ? 0.5 : 0), 0.1, 3.4);

  // --- Nutrients ----------------------------------------------------------------
  // Crop uptake draws NPK down through the season; terrain sets the spatial pattern.
  const daysAfterSowing = Math.max(
    0,
    (at - new Date(plot.sowingDate).getTime()) / DAY
  );
  const uptake = clamp(daysAfterSowing / Math.max(1, crop.stageDays.maturity), 0, 1);
  const nitrogen = clamp(
    crop.targetNpk.n * (1 + profile.nutrientBias * 0.55) - uptake * 70 + terr.fert + drift(6, at, DAY, seed, 'n'),
    35,
    420
  );
  const phosphorus = clamp(
    crop.targetNpk.p * (1 + profile.nutrientBias * 0.3) - uptake * 12 + terr.fert * 0.25 + drift(2.5, at, DAY, seed, 'p'),
    8,
    120
  );
  const potassium = clamp(
    crop.targetNpk.k * (1 + profile.nutrientBias * 0.3) - uptake * 30 + terr.fert * 0.5 + drift(5, at, DAY, seed, 'k'),
    25,
    320
  );

  // --- Canopy / pest ------------------------------------------------------------
  // Leaf wetness from dew and rain; long wet periods drive disease risk.
  const dew = humidity > 88 && s < 0.15 ? 45 + (humidity - 88) * 3.2 : 0;
  const leafWetness = clamp(Math.max(dew, rainfall > 0 ? 78 : 0) + drift(6, at, 2 * HOUR, seed, 'lw'), 0, 100);

  const light = Math.round(s * (78000 + drift(9000, at, 2 * HOUR, seed, 'lux')) * (rainfall > 0 ? 0.35 : 1));

  // VOC from the BME688: stressed/chewed plants emit green-leaf volatiles.
  const voc = clamp(
    120 + terr.pest * 240 * profile.pestPressure + uptake * 30 + drift(28, at, 5 * HOUR, seed, 'voc'),
    40,
    900
  );

  // Composite pest pressure: warmth + humidity + VOC + accumulated season pressure.
  const warmth = clamp((airTemp - crop.pestBaseTemp) / 22, 0, 1.25);
  const humidFactor = clamp((humidity - 50) / 40, 0, 1);
  const seasonPressure = clamp(uptake * 1.15, 0, 1);
  const pestActivity = clamp(
    (warmth * 34 + humidFactor * 24 + (voc - 120) / 6.2 + seasonPressure * 22) *
      (0.55 + profile.pestPressure * 0.75) *
      (0.75 + terr.pest * 0.75) +
      drift(5, at, 4 * HOUR, seed, 'pest'),
    0,
    100
  );

  const reading: SensorReading = {
    nodeId: node.id,
    plotId: plot.id,
    gridRef: node.gridRef,
    at,
    airTemp: round(airTemp),
    humidity: round(humidity),
    soilMoisture: round(soilMoisture),
    soilTemp: round(soilTemp),
    ph: round(ph, 2),
    ec: round(ec, 2),
    nitrogen: Math.round(nitrogen),
    phosphorus: Math.round(phosphorus),
    potassium: Math.round(potassium),
    leafWetness: round(leafWetness),
    light,
    rainfall: round(rainfall),
    windSpeed: round(windSpeed),
    voc: Math.round(voc),
    pestActivity: round(pestActivity),
  };

  if (node.hasBiosensor) {
    // SPCE + potentiostat: current rises with pathogen load on the electrode.
    const diseaseDrive = clamp(leafWetness / 100 * 0.6 + humidFactor * 0.4, 0, 1);
    reading.biosensorNa = Math.round(
      clamp(18 + diseaseDrive * 95 * (0.6 + terr.pest) + drift(6, at, 6 * HOUR, seed, 'bio'), 5, 240)
    );
  }

  return reading;
}

/** Back-fill a time series for trend charts, oldest first. */
export function simulateHistory(
  plot: Plot,
  node: SensorNode,
  endAt: number,
  points: number,
  stepMs: number,
  profile: SimProfile = simProfileFor(plot.id)
): SensorReading[] {
  const out: SensorReading[] = [];
  for (let i = points - 1; i >= 0; i--) {
    out.push(simulateReading(plot, node, endAt - i * stepMs, profile));
  }
  return out;
}

/** Node health also degrades over time — battery drain and calibration drift. */
export function simulateNodeState(node: SensorNode, at: number): SensorNode {
  const daysDeployed = clamp((at - node.lastSeenAt) / DAY, 0, 1);
  // Solar-assisted battery: recovers during the day, drains at night.
  const s = solar(at);
  const battery = clamp(node.batteryPct + s * 3 - 1.5 + noise(1.5, node.id, Math.floor(at / HOUR)), 8, 100);
  const signal = clamp(node.signalPct + drift(9, at, 2 * HOUR, node.id, 'sig'), 12, 100);
  const status: SensorNode['status'] =
    battery < 15 || signal < 20 ? 'degraded' : daysDeployed > 0.9 ? 'offline' : 'online';
  return {
    ...node,
    batteryPct: Math.round(battery),
    signalPct: Math.round(signal),
    status,
    lastSeenAt: at,
  };
}
