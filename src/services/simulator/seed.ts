import { Plot, SensorNode } from '../../types';
import { SimProfile } from './engine';

/**
 * Demo farm used until a farmer registers their own plots.
 *
 * Plot A3 is the one shown in the deck mockups (maize, Fall Armyworm risk), so the
 * default app state reproduces that screen on first launch.
 */

const DAY = 86_400_000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString();
}

export const SEED_PLOTS: Plot[] = [
  {
    id: 'plot-a3',
    name: 'Plot A3',
    crop: 'maize',
    areaAcres: 2.4,
    sowingDate: daysAgo(58),
    stage: 'flowering',
    boundary: [
      { x: 0.5, y: 0.04 },
      { x: 0.94, y: 0.38 },
      { x: 0.82, y: 0.92 },
      { x: 0.24, y: 0.96 },
      { x: 0.05, y: 0.44 },
    ],
    centroid: { lat: 11.0168, lon: 76.9558 },
    grid: { rows: 8, cols: 8 },
    soilType: 'Red sandy loam',
    irrigationType: 'drip',
  },
  {
    id: 'plot-b1',
    name: 'Plot B1',
    crop: 'rice',
    areaAcres: 3.1,
    sowingDate: daysAgo(41),
    stage: 'vegetative',
    boundary: [
      { x: 0.12, y: 0.1 },
      { x: 0.88, y: 0.08 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.92 },
    ],
    centroid: { lat: 11.0231, lon: 76.9701 },
    grid: { rows: 7, cols: 7 },
    soilType: 'Clay loam',
    irrigationType: 'flood',
  },
  {
    id: 'plot-c2',
    name: 'Plot C2',
    crop: 'cotton',
    areaAcres: 1.6,
    sowingDate: daysAgo(88),
    stage: 'fruiting',
    boundary: [
      { x: 0.2, y: 0.06 },
      { x: 0.92, y: 0.22 },
      { x: 0.76, y: 0.94 },
      { x: 0.08, y: 0.7 },
    ],
    centroid: { lat: 11.0042, lon: 76.9412 },
    grid: { rows: 6, cols: 6 },
    soilType: 'Black cotton soil',
    irrigationType: 'sprinkler',
  },
];

/** Four nodes per plot, matching the BOM's "Sensors (nodes, 4 units)". */
export function seedNodesForPlot(plot: Plot): SensorNode[] {
  const { rows, cols } = plot.grid;
  const positions = [
    { row: Math.floor(rows * 0.2), col: Math.floor(cols * 0.25) },
    { row: Math.floor(rows * 0.25), col: Math.floor(cols * 0.75) },
    { row: Math.floor(rows * 0.75), col: Math.floor(cols * 0.3) },
    { row: Math.floor(rows * 0.7), col: Math.floor(cols * 0.8) },
  ];
  const now = Date.now();
  return positions.map((gridRef, i) => ({
    id: `${plot.id}-n${i + 1}`,
    plotId: plot.id,
    label: `Node ${i + 1}`,
    gridRef,
    status: 'online' as const,
    batteryPct: [88, 74, 62, 41][i],
    signalPct: [92, 78, 66, 54][i],
    lastSeenAt: now,
    daysSinceCalibration: [6, 12, 21, 34][i],
    // One node per plot carries the electrochemical disease biosensor.
    hasBiosensor: i === 0,
  }));
}

export const SEED_NODES: SensorNode[] = SEED_PLOTS.flatMap(seedNodesForPlot);

/**
 * Per-plot scenarios.
 *
 * A single global pest-pressure knob made every plot tell the same story, and none
 * of them reproduced the deck's headline screen. Each plot now runs a distinct,
 * agronomically coherent scenario so the demo exercises different branches of the
 * engine rather than the same one three times:
 *
 *  - A3 reproduces the mockup: Fall Armyworm pressure, low soil moisture, low
 *    nitrogen — the state behind "Pest Activity Detected in Plot A3". Tuned so the
 *    pest score holds 62-70 across all 24 hours (the alert is there whenever the
 *    app is opened) while the worst node peaks at ~93, short of the 100 ceiling,
 *    since a value pinned exactly at the cap reads as fabricated.
 *  - B1 is rice run wet, so it exercises waterlogging and disease-infection risk
 *    (the opposite irrigation failure) instead of drought.
 *  - C2 is a healthy cotton plot, so "all clear" is also on screen somewhere and
 *    the app is not just a wall of red.
 */
export const SEED_SIM_PROFILES: Record<string, SimProfile> = {
  'plot-a3': { pestPressure: 0.85, moistureBias: -0.62, nutrientBias: -0.52, seed: 'drikr-a3' },
  'plot-b1': { pestPressure: 0.45, moistureBias: 0.72, nutrientBias: -0.15, seed: 'drikr-b1' },
  'plot-c2': { pestPressure: 0.22, moistureBias: 0.05, nutrientBias: 0.12, seed: 'drikr-c2' },
};
