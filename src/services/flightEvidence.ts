import env from '../config/env';
import { GeoPoint } from '../types';
import NativeDroneLink from '../../modules/drone-link';

/**
 * What a drone flight actually saw, per waypoint.
 *
 * Three sources, none of which knows about the others:
 *
 *   - the drone's GPS track, logged on this phone: the drone's own position,
 *     tagged with the waypoint it is holding at (phone clock, `time_ms`);
 *   - the hover photos: 720p frames kept once a second during those
 *     holds, same clock;
 *   - the AS7343 pod's spectral log: its own uptime clock, placed on wall time
 *     at download (see `fetchPodLog`).
 *
 * They are joined by TIME: each waypoint's hold is a time window in the GPS
 * track, and the pod rows and photos inside that window belong to it. The pod
 * needs no GPS and no setup before a flight for this to work.
 *
 * The phone has to be on the drone's WiFi to reach the bridge and on
 * Drikr_Pod to reach the pod, so the two downloads happen one after the other
 * and are cached here in between. Photos are pulled into memory while the
 * bridge is reachable, because their URLs stop working once the phone moves
 * to the pod's network.
 */

// --- Types ------------------------------------------------------------------

export interface TrackRow {
  timeMs: number;
  lat: number;
  lon: number;
  altitudeM: number;
  hover: boolean;
  waypoint: number;
}

export interface PhotoRow {
  timeMs: number;
  waypoint: number;
  lat: number;
  lon: number;
  file: string;
  /** data: URI once downloaded, so it survives leaving the drone WiFi. */
  dataUri?: string;
}

export interface PodRow {
  /** Wall time, placed from the pod's uptime at download. */
  timeMs: number;
  saturated: boolean;
  /** Raw counts in wavelength order, clear channel last. */
  raw: number[];
  ndviRaw: number;
  redEdgeRaw: number;
}

export interface PodLog {
  rows: PodRow[];
  bands: string[];
  /** Rows from an earlier power-up: they cannot be placed in time. */
  skippedOtherBoot: number;
}

export interface WaypointEvidence {
  waypoint: number;
  position: GeoPoint;
  holdStartMs: number;
  holdEndMs: number;
  photo?: PhotoRow;
  photoCount: number;
  /** Pod readings inside the hold; 0 means the pod saw nothing here. */
  samples: number;
  saturatedSamples: number;
  meanRaw?: number[];
  ndviRaw?: number;
  redEdgeRaw?: number;
  /**
   * Red-edge index compared with the rest of THIS flight. Only relative: the
   * pod has no sunlight reference, so absolute values move with the clouds.
   */
  flag: 'lower' | 'normal' | 'no-data';
}

export interface FlightEvidence {
  waypoints: WaypointEvidence[];
  /** Median red-edge index across waypoints, the baseline for `flag`. */
  medianRedEdge?: number;
  bands: string[];
}

// --- Tuning -----------------------------------------------------------------

/**
 * Trimmed off each end of a hold before matching pod rows. Covers the drone
 * still settling, and the phone and pod clocks disagreeing by up to about
 * a second, which is what makes a time join safe without syncing them.
 */
const HOLD_MARGIN_MS = 1000;

/** A hold shorter than this after trimming is too short to trust. */
const MIN_HOLD_MS = 1500;

/** Gaps shorter than this inside one waypoint's hover rows are the same hold. */
const HOLD_GAP_MS = 3000;

/**
 * How far below the flight's median red-edge index a waypoint must fall to be
 * flagged. Red-edge falls when chlorophyll does, which is an early sign of
 * stress - but of any stress, not specifically disease, so the flag says
 * "look here", never a diagnosis.
 */
const LOWER_BY = 0.05;

// --- CSV --------------------------------------------------------------------

/** The bridge and the pod both write plain CSV: no quoting, no embedded commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

const num = (v: string | undefined): number => (v === undefined || v === '' ? NaN : Number(v));

export function parseTrack(text: string): TrackRow[] {
  return parseCsv(text)
    .map((r) => ({
      timeMs: num(r.time_ms),
      lat: num(r.latitude),
      lon: num(r.longitude),
      altitudeM: num(r.altitude_m),
      hover: r.hover === '1',
      waypoint: num(r.waypoint) || 0,
    }))
    .filter((r) => Number.isFinite(r.timeMs));
}

export function parsePhotoIndex(text: string): PhotoRow[] {
  return parseCsv(text)
    .map((r) => ({
      timeMs: num(r.time_ms),
      waypoint: num(r.waypoint) || 0,
      lat: num(r.latitude),
      lon: num(r.longitude),
      file: r.file,
    }))
    .filter((r) => Number.isFinite(r.timeMs) && Boolean(r.file));
}

/**
 * Place pod rows on wall time.
 *
 * The pod reports its boot counter and uptime as the response starts; the
 * phone notes its own clock at that moment. A row logged `uptime - upMs` ago
 * therefore happened at `phoneNow - (uptime - upMs)`.
 */
export function parsePodLog(text: string, podBoot: number, podUptimeMs: number, phoneNowMs: number): PodLog {
  const rows = parseCsv(text);
  if (rows.length === 0) return { rows: [], bands: [], skippedOtherBoot: 0 };

  const bandKeys = Object.keys(rows[0]).filter((k) => /^(F\d|FZ|FY|FXL|NIR|VIS)/.test(k));
  let skipped = 0;
  const out: PodRow[] = [];

  for (const r of rows) {
    if (num(r.boot) !== podBoot) {
      skipped++;
      continue;
    }
    const upMs = num(r.up_ms);
    if (!Number.isFinite(upMs) || upMs > podUptimeMs) continue;
    out.push({
      timeMs: phoneNowMs - (podUptimeMs - upMs),
      saturated: r.saturated === '1',
      raw: bandKeys.map((k) => num(r[k])),
      ndviRaw: num(r.ndvi_raw),
      redEdgeRaw: num(r.red_edge_raw),
    });
  }
  return { rows: out, bands: bandKeys, skippedOtherBoot: skipped };
}

// --- The join ---------------------------------------------------------------

const median = (xs: number[]): number | undefined => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Hold windows: runs of hovering rows at one waypoint. If the drone passed
 * the same point twice, the longest run wins - that is the deliberate hold.
 */
export function holdWindows(track: TrackRow[]): Map<number, { start: number; end: number; rows: TrackRow[] }> {
  const sorted = [...track].sort((a, b) => a.timeMs - b.timeMs);
  const best = new Map<number, { start: number; end: number; rows: TrackRow[] }>();
  let run: { wp: number; rows: TrackRow[] } | null = null;

  const close = () => {
    if (!run || run.rows.length === 0) return;
    const start = run.rows[0].timeMs;
    const end = run.rows[run.rows.length - 1].timeMs;
    const prev = best.get(run.wp);
    if (!prev || end - start > prev.end - prev.start) best.set(run.wp, { start, end, rows: run.rows });
  };

  for (const r of sorted) {
    const holding = r.hover && r.waypoint > 0;
    const last = run?.rows[run.rows.length - 1];
    if (holding && run && run.wp === r.waypoint && last && r.timeMs - last.timeMs <= HOLD_GAP_MS) {
      run.rows.push(r);
      continue;
    }
    close();
    run = holding ? { wp: r.waypoint, rows: [r] } : null;
  }
  close();
  return best;
}

export function joinFlight(track: TrackRow[], photos: PhotoRow[], pod: PodLog | null): FlightEvidence {
  const windows = holdWindows(track);
  const out: WaypointEvidence[] = [];

  for (const [wp, w] of [...windows.entries()].sort((a, b) => a[0] - b[0])) {
    const position = {
      lat: mean(w.rows.map((r) => r.lat)),
      lon: mean(w.rows.map((r) => r.lon)),
    };

    // Photos are tagged by the bridge directly; pick the middle of the hold,
    // when the drone has settled.
    const shots = photos.filter((p) => p.waypoint === wp).sort((a, b) => a.timeMs - b.timeMs);
    const photo = shots.length ? shots[Math.floor(shots.length / 2)] : undefined;

    let start = w.start + HOLD_MARGIN_MS;
    let end = w.end - HOLD_MARGIN_MS;
    if (end - start < MIN_HOLD_MS) {
      start = w.start;
      end = w.end;
    }

    const rows = (pod?.rows ?? []).filter((r) => r.timeMs >= start && r.timeMs <= end);
    const usable = rows.filter((r) => !r.saturated);
    const ev: WaypointEvidence = {
      waypoint: wp,
      position,
      holdStartMs: w.start,
      holdEndMs: w.end,
      photo,
      photoCount: shots.length,
      samples: rows.length,
      saturatedSamples: rows.length - usable.length,
      flag: 'no-data',
    };
    if (usable.length > 0) {
      ev.meanRaw = usable[0].raw.map((_, i) => mean(usable.map((r) => r.raw[i])));
      ev.ndviRaw = mean(usable.map((r) => r.ndviRaw));
      ev.redEdgeRaw = mean(usable.map((r) => r.redEdgeRaw));
    }
    out.push(ev);
  }

  const medianRedEdge = median(out.filter((e) => e.redEdgeRaw !== undefined).map((e) => e.redEdgeRaw!));
  for (const e of out) {
    if (e.redEdgeRaw === undefined || medianRedEdge === undefined) continue;
    e.flag = e.redEdgeRaw < medianRedEdge - LOWER_BY ? 'lower' : 'normal';
  }

  return { waypoints: out, medianRedEdge, bands: pod?.bands ?? [] };
}

// --- Fetching ---------------------------------------------------------------

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Survives leaving and re-entering the Drone screen while the phone moves to
// the plant sensor's WiFi.
let cachedTrack: TrackRow[] | null = null;
let cachedPhotos: PhotoRow[] | null = null;
let cachedPod: PodLog | null = null;

export const cachedEvidence = () => ({ track: cachedTrack, photos: cachedPhotos, pod: cachedPod });

/**
 * The drone's GPS track and hover photos, as the phone link recorded them in
 * app storage during the flight: no WiFi needed, works after landing.
 */
export async function fetchDroneData(): Promise<{ track: TrackRow[]; photos: PhotoRow[] }> {
  return readPhoneData();
}

function readPhoneData(): { track: TrackRow[]; photos: PhotoRow[] } {
  if (!NativeDroneLink) throw new Error('This build has no phone drone link.');
  const log = NativeDroneLink.readFlightLog();
  if (!log) throw new Error('No flight recorded on this phone yet. Connect to the drone and fly first.');
  const track = parseTrack(log);
  const index = NativeDroneLink.readPhotoIndex();
  const photos = index ? parsePhotoIndex(index) : [];

  const picks = joinFlight(track, photos, null).waypoints.map((w) => w.photo).filter(Boolean) as PhotoRow[];
  for (const p of picks) {
    const b64 = NativeDroneLink.readPhotoBase64(p.file);
    if (b64) p.dataUri = `data:image/jpeg;base64,${b64}`;
  }
  cachedTrack = track;
  cachedPhotos = photos;
  return { track, photos };
}

/**
 * Pull the AS7343 log from the pod. Must run while the phone is on Drikr_Pod,
 * and before the pod is switched off: its rows are only placeable in time
 * within the power-up that recorded them.
 */
export async function fetchPodLog(): Promise<PodLog> {
  // Drikr_Pod has no internet, so Android sends traffic for it over mobile
  // data unless the app is pinned to WiFi for the download.
  const pinned = NativeDroneLink?.bindProcessToWifi(true) ?? false;
  try {
    return await downloadPodLog();
  } finally {
    if (pinned) NativeDroneLink?.bindProcessToWifi(false);
  }
}

async function downloadPodLog(): Promise<PodLog> {
  const base = env.podUrl.replace(/\/$/, '');
  const sentAt = Date.now();
  const res = await fetchWithTimeout(`${base}/api/log.csv`, 60000);
  // The pod stamps its uptime as the response starts; the midpoint of send and
  // headers-received is the best estimate of when that was on this clock.
  const phoneNow = Math.round((sentAt + Date.now()) / 2);
  if (!res.ok) throw new Error('The pod did not answer. Is the phone on the Drikr_Pod WiFi?');

  const boot = Number(res.headers.get('X-Pod-Boot'));
  const uptime = Number(res.headers.get('X-Pod-Uptime-Ms'));
  if (!Number.isFinite(boot) || !Number.isFinite(uptime)) {
    throw new Error('The pod firmware is too old: it does not report its clock. Reflash it.');
  }

  const log = parsePodLog(await res.text(), boot, uptime, phoneNow);
  cachedPod = log;
  return log;
}

export function clearEvidenceCache(): void {
  cachedTrack = null;
  cachedPhotos = null;
  cachedPod = null;
}
