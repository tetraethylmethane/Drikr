import { cellHealthIndex } from './decisionEngine';
import { GridRef, HealthCell, HealthMap, Plot, SensorNode, SensorReading } from '../types';

/**
 * Builds the Field Health Map from a handful of node readings.
 *
 * Four nodes cannot measure 64 grid cells, so cell values are interpolated with
 * inverse-distance weighting (IDW) — the standard approach for sparse in-field
 * sensor networks. Each interpolated cell is then scored by the same decision
 * engine the headline uses, which is why the map's hot-spot and the Home screen's
 * alert always agree.
 *
 * `power` controls locality: higher makes each node's influence tighter, so the map
 * shows distinct zones rather than a smooth wash.
 */

const IDW_POWER = 2.4;

function distance(a: GridRef, b: GridRef): number {
  return Math.hypot(a.row - b.row, a.col - b.col);
}

/** Numeric fields that can be spatially interpolated. */
const INTERPOLATED: Array<keyof SensorReading> = [
  'airTemp',
  'humidity',
  'soilMoisture',
  'soilTemp',
  'ph',
  'ec',
  'nitrogen',
  'phosphorus',
  'potassium',
  'leafWetness',
  'light',
  'rainfall',
  'windSpeed',
  'voc',
  'pestActivity',
];

function interpolateAt(
  ref: GridRef,
  samples: Array<{ gridRef: GridRef; reading: SensorReading }>
): SensorReading {
  if (samples.length === 0) throw new Error('interpolateAt requires at least one sample');

  // Sitting on a node means using its reading directly.
  const exact = samples.find((s) => distance(s.gridRef, ref) < 0.001);
  if (exact) return { ...exact.reading, gridRef: ref };

  const weights = samples.map((s) => 1 / Math.pow(distance(s.gridRef, ref), IDW_POWER));
  const total = weights.reduce((a, b) => a + b, 0);

  const base = samples[0].reading;
  const out: SensorReading = { ...base, gridRef: ref };

  for (const field of INTERPOLATED) {
    let acc = 0;
    samples.forEach((s, i) => {
      acc += (s.reading[field] as number) * weights[i];
    });
    (out[field] as number) = Math.round((acc / total) * 100) / 100;
  }

  // Biosensor is only present on some nodes — interpolate across those alone.
  const bioSamples = samples
    .map((s, i) => ({ v: s.reading.biosensorNa, w: weights[i] }))
    .filter((s): s is { v: number; w: number } => typeof s.v === 'number');
  if (bioSamples.length > 0) {
    const bw = bioSamples.reduce((a, b) => a + b.w, 0);
    out.biosensorNa = Math.round(bioSamples.reduce((a, b) => a + b.v * b.w, 0) / bw);
  } else {
    delete out.biosensorNa;
  }

  return out;
}

export function buildHealthMap(
  plot: Plot,
  nodes: SensorNode[],
  readings: Record<string, SensorReading>,
  at: number
): HealthMap {
  const samples = nodes
    .filter((n) => n.status !== 'offline' && readings[n.id])
    .map((n) => ({ gridRef: n.gridRef, reading: readings[n.id] }));

  const { rows, cols } = plot.grid;

  if (samples.length === 0) {
    return { plotId: plot.id, at, rows, cols, cells: [], worst: null, meanHealth: 0 };
  }

  const cells: HealthCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ref = { row, col };
      const reading = interpolateAt(ref, samples);
      const { healthIndex, risk } = cellHealthIndex(plot, reading);
      cells.push({ gridRef: ref, healthIndex, risk, reading });
    }
  }

  const worst = cells.reduce<HealthCell | null>(
    (m, c) => (m === null || c.healthIndex < m.healthIndex ? c : m),
    null
  );
  const meanHealth = Math.round(cells.reduce((s, c) => s + c.healthIndex, 0) / cells.length);

  return { plotId: plot.id, at, rows, cols, cells, worst, meanHealth };
}

export function cellAt(map: HealthMap | null, ref: GridRef): HealthCell | null {
  if (!map) return null;
  return map.cells.find((c) => c.gridRef.row === ref.row && c.gridRef.col === ref.col) ?? null;
}

/** Cells at or below a health threshold — the spray target set for a mission. */
export function riskCells(map: HealthMap | null, maxHealthIndex = 55): GridRef[] {
  if (!map) return [];
  return map.cells.filter((c) => c.healthIndex <= maxHealthIndex).map((c) => c.gridRef);
}

/** Share of the plot flagged at risk, used to size the spray payload. */
export function affectedFraction(map: HealthMap | null, maxHealthIndex = 55): number {
  if (!map || map.cells.length === 0) return 0;
  return riskCells(map, maxHealthIndex).length / map.cells.length;
}

/**
 * Point-in-polygon test against the plot boundary in normalised space, so grid cells
 * outside an irregular field are not painted.
 */
export function isInsideBoundary(plot: Plot, x: number, y: number): boolean {
  const pts = plot.boundary;
  if (pts.length < 3) return true;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
