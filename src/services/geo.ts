import { GeoAnchor, GeoPoint, GridRef, Plot, PlotGeoref } from '../types';

/**
 * Georeferencing: turning the app's normalised field drawing into real coordinates.
 *
 * Everything spatial in the app lives in normalised 0..1 space — the boundary
 * polygon, the health-map grid, node positions. That is all a screen needs. A
 * drone needs latitude and longitude, and a `centroid` alone cannot supply them:
 * without knowing which way the field is turned or how big it is on the ground,
 * grid cell 3,5 could be north or east of the centre.
 *
 * Two ground anchors fix that. The farmer picks two corners on the drawing and
 * stands at each one while the phone takes a GPS fix. Two points give origin,
 * bearing and scale — a similarity transform — which is exactly enough and no
 * more. A third point would let us solve for shear as well, but a hand-drawn
 * boundary does not have trustworthy shear to solve for, so fitting it would be
 * fitting noise.
 *
 * Why two corners and not four: each extra corner is another walk to the far end
 * of a field, and the error that matters here is GPS error, which averaging four
 * noisy corners does not remove — it is dominated by how far apart the anchors
 * are. Two distant corners beat four close ones.
 */

/** Metres per degree of latitude. Constant enough at field scale. */
const M_PER_DEG_LAT = 111_320;

const SQM_PER_ACRE = 4046.8564224;

/**
 * Minimum separation between the two anchors, in metres.
 *
 * Phone GPS is good to roughly 3-5 m. The anchors define the field's bearing, and
 * bearing error scales as (GPS error / separation) — so two corners 10 m apart
 * carry up to ~30 degrees of bearing error, which would rotate every waypoint
 * off the field. At 40 m the same GPS error is worth about 7 degrees.
 */
export const MIN_ANCHOR_SEPARATION_M = 25;

/** Metres per degree of longitude at a given latitude. Shrinks toward the poles. */
function mPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Great-circle-free distance, fine over a field. */
export function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const north = (b.lat - a.lat) * M_PER_DEG_LAT;
  const east = (b.lon - a.lon) * mPerDegLon((a.lat + b.lat) / 2);
  return Math.hypot(north, east);
}

interface Transform {
  /** Rotation from normalised space to compass space, radians. */
  theta: number;
  /** Metres per unit of normalised distance. */
  scale: number;
  origin: GeoAnchor;
}

/**
 * Solve the similarity transform from the two anchors.
 *
 * Normalised y runs *downward* (it is screen space, and the boundary polygon is
 * drawn with it), while north runs upward, so the y axis is flipped on the way
 * in. Getting that wrong mirrors the field, which is the failure mode that looks
 * plausible on screen and puts the drone on the neighbour's plot.
 */
function solve(georef: PlotGeoref): Transform | null {
  const [a, b] = georef.anchors;

  const dx = b.x - a.x;
  const dy = -(b.y - a.y);
  const normLen = Math.hypot(dx, dy);
  if (normLen < 1e-6) return null;

  const north = (b.lat - a.lat) * M_PER_DEG_LAT;
  const east = (b.lon - a.lon) * mPerDegLon((a.lat + b.lat) / 2);
  const groundLen = Math.hypot(north, east);
  if (groundLen < 1e-6) return null;

  return {
    theta: Math.atan2(north, east) - Math.atan2(dy, dx),
    scale: groundLen / normLen,
    origin: a,
  };
}

/** Normalised point -> real coordinates. Null when the plot is not georeferenced. */
export function normalisedToGeo(
  georef: PlotGeoref | null | undefined,
  x: number,
  y: number
): GeoPoint | null {
  if (!georef) return null;
  const tf = solve(georef);
  if (!tf) return null;

  const ux = x - tf.origin.x;
  const uy = -(y - tf.origin.y);

  const cos = Math.cos(tf.theta);
  const sin = Math.sin(tf.theta);
  const east = (ux * cos - uy * sin) * tf.scale;
  const north = (ux * sin + uy * cos) * tf.scale;

  const lat = tf.origin.lat + north / M_PER_DEG_LAT;
  const lon = tf.origin.lon + east / mPerDegLon(tf.origin.lat);
  return { lat, lon };
}

/** Grid cell centre -> real coordinates. The cell centre is what a drone flies to. */
export function gridRefToGeo(
  plot: Plot,
  georef: PlotGeoref | null | undefined,
  ref: GridRef
): GeoPoint | null {
  const x = (ref.col + 0.5) / plot.grid.cols;
  const y = (ref.row + 0.5) / plot.grid.rows;
  return normalisedToGeo(georef, x, y);
}

export interface GeorefCheck {
  ok: boolean;
  /** Distance between the two anchors on the ground. */
  separationM: number;
  /** Field area the transform implies, from the boundary polygon. */
  impliedAcres: number | null;
  /**
   * How far the implied area is from the acreage the farmer entered, as a ratio.
   * 1 means they agree.
   */
  areaRatio: number | null;
  problems: string[];
  warnings: string[];
}

/** Polygon area in normalised units, by the shoelace formula. */
function normalisedArea(plot: Plot): number {
  const p = plot.boundary;
  if (p.length < 3) return 0;
  let acc = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    acc += p[j].x * p[i].y - p[i].x * p[j].y;
  }
  return Math.abs(acc / 2);
}

/**
 * Sanity-check a georeference before anything flies on it.
 *
 * The cheap, powerful check is area: the transform implies a field size, and the
 * farmer already told us the acreage. If those disagree by more than about half,
 * the most likely cause is that the second GPS fix was taken at the wrong corner
 * — which produces a transform that looks entirely reasonable on screen and is
 * badly wrong on the ground. Catching it here is much better than catching it
 * from a drone over someone else's field.
 */
export function checkGeoref(plot: Plot, georef: PlotGeoref | null | undefined): GeorefCheck {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!georef) {
    return {
      ok: false,
      separationM: 0,
      impliedAcres: null,
      areaRatio: null,
      problems: ['This field has not been georeferenced yet.'],
      warnings,
    };
  }

  const [a, b] = georef.anchors;
  const separationM = metresBetween({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });
  const tf = solve(georef);

  if (!tf) {
    problems.push('The two anchor points are in the same place. Pick two different corners.');
  }
  if (separationM < MIN_ANCHOR_SEPARATION_M) {
    problems.push(
      `The anchors are only ${Math.round(separationM)} m apart. Use two far-apart corners — diagonally opposite is best — or the field's direction cannot be worked out reliably.`
    );
  }

  const worstAccuracy = Math.max(a.accuracyM ?? 0, b.accuracyM ?? 0);
  if (worstAccuracy > 15) {
    warnings.push(
      `GPS accuracy was only ±${Math.round(worstAccuracy)} m. Re-take the fixes under open sky for a tighter result.`
    );
  }

  let impliedAcres: number | null = null;
  let areaRatio: number | null = null;
  if (tf) {
    const sqm = normalisedArea(plot) * tf.scale * tf.scale;
    impliedAcres = Math.round((sqm / SQM_PER_ACRE) * 100) / 100;
    if (plot.areaAcres > 0) {
      areaRatio = impliedAcres / plot.areaAcres;
      if (areaRatio > 1.5 || areaRatio < 0.67) {
        problems.push(
          `This works out to ${impliedAcres} acre but the field is recorded as ${plot.areaAcres} acre. Check that each GPS fix was taken at the corner you tapped.`
        );
      } else if (areaRatio > 1.2 || areaRatio < 0.83) {
        warnings.push(
          `This works out to ${impliedAcres} acre against the ${plot.areaAcres} acre recorded — close, but worth a second look.`
        );
      }
    }
  }

  return { ok: problems.length === 0, separationM, impliedAcres, areaRatio, problems, warnings };
}

/** Degrees, minutes, seconds — how a farmer reads a coordinate off a phone. */
export function formatGeo(p: GeoPoint): string {
  return `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
}
