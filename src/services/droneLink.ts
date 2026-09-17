import env, { hasDroneLink } from '../config/env';
import { DroneMission, GeoPoint, Plot } from '../types';
import { checkGeoref, formatGeo, gridRefToGeo } from './geo';

/**
 * The seam between a mission and an actual aircraft.
 *
 * There is exactly one reason this interface exists: which drone we can command
 * is genuinely unknown, and the app must not wait to find out. The DR-DG600C on
 * the bench is a 249 g consumer camera drone with closed firmware and a
 * proprietary app, so it can only be flown by hand-entering waypoints. Whether
 * its WiFi protocol turns out to be reverse-engineerable is an open question,
 * and an ArduPilot airframe is the fallback. All three are transports for the
 * same waypoint list.
 *
 * So: missions are planned against grid cells, georeferencing turns those into
 * coordinates, and a `DroneLink` carries them to something that flies. Swapping
 * transport touches one file and no screen.
 *
 * What this deliberately does NOT do is fly the aircraft. No link here holds a
 * control loop. Uploading a waypoint list to a flight controller that already
 * knows how to follow one is a safe operation; streaming stick commands from a
 * phone over WiFi to keep an aircraft airborne is not, and is not something to
 * build behind an abstraction.
 */

export interface Waypoint {
  /** 1-based, as a farmer would count them off a screen. */
  index: number;
  lat: number;
  lon: number;
  /** Metres above the launch point. */
  altitudeM: number;
  /** Seconds to hold at the point — a photograph needs the aircraft still. */
  holdSeconds: number;
  /** Cruise speed to this point, m/s. */
  speedMs: number;
  /** Which grid cell this came from, for tracing a waypoint back to its evidence. */
  gridRef: { row: number; col: number };
}

/**
 * Hard limits of the Lewei HY waypoint frame, from the decoded field widths.
 *
 * The index occupies 5 bits, altitude 12 bits in 0.1 m, speed 7 bits in 0.1 m/s
 * and stay time 8 bits in seconds. These are not policy choices we can relax —
 * a value past them does not fit in the packet.
 */
export const MAX_WAYPOINTS = 32;
export const MAX_ALTITUDE_M = 409.5;
export const MAX_SPEED_MS = 12.7;
export const MAX_STAY_S = 255;

export interface FlightPlan {
  missionId: string;
  plotId: string;
  plotName: string;
  waypoints: Waypoint[];
  /** Home/launch point: the first anchor, which is a corner the farmer stood on. */
  home: GeoPoint | null;
  /** Target cells that did not fit inside MAX_WAYPOINTS. */
  droppedCells: number;
  /** Anything that makes this plan untrustworthy. Non-empty means do not fly. */
  problems: string[];
  warnings: string[];
}

/** Inspection altitude, metres above launch. */
const INSPECT_ALTITUDE_M = 12;
/** Spray altitude — low, because drift rises steeply with height. */
const SPRAY_ALTITUDE_M = 3;

/**
 * Cruise speeds, m/s. Slow: the camera has to resolve a lesion, and the aircraft
 * has to settle before each hold.
 */
const INSPECT_SPEED_MS = 2;
const SPRAY_SPEED_MS = 3;

/**
 * Turn a mission's target cells into a flight plan.
 *
 * Returns a plan with `problems` populated rather than throwing or returning
 * null, because the farmer needs to be told *why* their field cannot be flown —
 * "not georeferenced yet" is a fixable thing they can act on, and a silent empty
 * list is not.
 */
export function buildFlightPlan(mission: DroneMission, plot: Plot): FlightPlan {
  const check = checkGeoref(plot, plot.georef);
  const problems = [...check.problems];
  const warnings = [...check.warnings];

  const altitudeM = mission.type === 'spray' ? SPRAY_ALTITUDE_M : INSPECT_ALTITUDE_M;
  // A survey holds longer than an inspection: it is the only look this field
  // gets, the photograph is the measurement, and a blurred frame means flying
  // the whole thing again.
  const holdSeconds = mission.type === 'spray' ? 0 : mission.type === 'survey' ? 6 : 4;
  const speedMs = mission.type === 'spray' ? SPRAY_SPEED_MS : INSPECT_SPEED_MS;

  const waypoints: Waypoint[] = [];
  if (check.ok) {
    mission.targetCells.forEach((ref) => {
      const p = gridRefToGeo(plot, plot.georef, ref);
      if (!p) return;
      waypoints.push({
        index: waypoints.length + 1,
        lat: p.lat,
        lon: p.lon,
        altitudeM,
        holdSeconds,
        speedMs,
        gridRef: ref,
      });
    });
  }

  /**
   * The protocol carries 32 waypoints, and a spray mission is not capped the way
   * inspections (12) and surveys (9) are — a 10x10 grid badly affected can flag
   * a hundred cells.
   *
   * Trimmed rather than refused, because a partial spray of the worst 32 cells
   * is genuinely useful, and refusing would leave the farmer with nothing. But
   * it is a WARNING and not silent: cells dropped here are crop that stays
   * untreated while the app reports the mission complete, which is exactly the
   * kind of quiet gap that loses trust.
   */
  let dropped = 0;
  if (waypoints.length > MAX_WAYPOINTS) {
    dropped = waypoints.length - MAX_WAYPOINTS;
    waypoints.length = MAX_WAYPOINTS;
    warnings.push(
      `Only ${MAX_WAYPOINTS} waypoints fit in one flight, so ${dropped} more cell(s) are not included. Fly a second mission to cover them.`
    );
  }

  if (altitudeM > MAX_ALTITUDE_M) {
    problems.push(`Altitude ${altitudeM} m is past the ${MAX_ALTITUDE_M} m the aircraft accepts.`);
  }

  if (check.ok && waypoints.length === 0) {
    problems.push('This mission has no target cells, so there is nothing to fly to.');
  }

  const a = plot.georef?.anchors[0];
  return {
    missionId: mission.id,
    plotId: plot.id,
    plotName: plot.name,
    waypoints,
    droppedCells: dropped,
    home: a ? { lat: a.lat, lon: a.lon } : null,
    problems,
    warnings,
  };
}

// --- Links ------------------------------------------------------------------

export type LinkKind = 'manual' | 'besta' | 'mavlink';

export interface LinkStatus {
  connected: boolean;
  /** Free text for the UI: "Not connected", "Waypoint 3 of 8", a failure reason. */
  detail: string;
  batteryPct?: number;
  /** 0..100, from the aircraft's own mission progress when it reports one. */
  progressPct?: number;
}

export interface DroneLink {
  kind: LinkKind;
  /** Shown as the transport's name in the UI. */
  label: string;
  /**
   * Whether this link can put the aircraft in the air by itself. False means the
   * app can only produce instructions for a person to carry out, and the UI must
   * say so rather than showing a Fly button that does nothing.
   */
  canCommand: boolean;
  status(): Promise<LinkStatus>;
  /** Push the plan to the aircraft. Returns false if it did not take. */
  upload(plan: FlightPlan): Promise<boolean>;
  /** Begin the uploaded mission. */
  start(): Promise<boolean>;
  /** Stop and return home. */
  abort(): Promise<boolean>;
}

/**
 * The link for a drone we cannot command: the app computes the waypoints and the
 * farmer types them into the manufacturer's own app.
 *
 * This is not a stub. It is the only link that works with the drone actually on
 * the bench, and for a rented drone — which is how most Indian smallholders get
 * one — it may be the only link that ever works. Everything valuable the app
 * does still happens here: the sensors decide *where* to look, which is the part
 * a drone app cannot do. Handing over eight coordinates instead of flying the
 * aircraft loses convenience, not intelligence.
 */
export function manualLink(): DroneLink {
  return {
    kind: 'manual',
    label: 'Enter by hand',
    canCommand: false,
    async status() {
      return { connected: false, detail: 'Waypoints are entered in the drone’s own app.' };
    },
    async upload() {
      // Nothing to upload to. Reported as success because the plan is ready for
      // the farmer to read — failing here would suggest the app had broken.
      return true;
    },
    async start() {
      return false;
    },
    async abort() {
      return false;
    },
  };
}

/**
 * The turbodrone bridge: a real link to the DR-DG600C.
 *
 * Speaks to the HTTP API in front of the reverse-engineered Lewei HY protocol.
 * The bridge runs on a laptop joined to the drone's own WiFi access point and
 * owns the 200 ms retry-until-acknowledged upload handshake and the pointFly
 * start flag, so this side stays a plain REST client.
 *
 * Note what is still true here: no control loop. The app hands over a waypoint
 * list and says go. The flight controller flies it.
 */
export function lwProLink(baseUrl: string): DroneLink {
  const base = baseUrl.replace(/\/$/, '');

  async function call(path: string, init?: RequestInit): Promise<Response | null> {
    const controller = new AbortController();
    // Short: the bridge is on the same LAN, so a slow answer means it is gone
    // rather than busy, and a farmer waiting on a drone should not watch a
    // spinner for 30 seconds.
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      return await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    kind: 'besta',
    label: 'Drone WiFi bridge',
    canCommand: true,

    async status() {
      const res = await call('/mission');
      if (!res || !res.ok) {
        return { connected: false, detail: 'Bridge not reachable on the drone WiFi' };
      }
      try {
        const body = (await res.json()) as {
          state?: string;
          uploaded?: number;
          total?: number;
          battery_pct?: number;
        };
        const state = body.state ?? 'unknown';
        const detail =
          state === 'uploading' && body.total
            ? `Uploading waypoint ${body.uploaded ?? 0} of ${body.total}`
            : state;
        const progressPct =
          body.total && body.total > 0
            ? Math.round(((body.uploaded ?? 0) / body.total) * 100)
            : undefined;
        return { connected: true, detail, progressPct, batteryPct: body.battery_pct };
      } catch {
        return { connected: true, detail: 'Bridge answered but the reply was unreadable' };
      }
    },

    async upload(plan: FlightPlan) {
      // Never upload a plan we have already said is untrustworthy. The bridge
      // would happily accept it.
      if (plan.problems.length > 0 || plan.waypoints.length === 0) return false;

      const res = await call('/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: plan.waypoints.map((w) => ({
            latitude: w.lat,
            longitude: w.lon,
            altitude_m: w.altitudeM,
            speed_ms: Math.min(w.speedMs, MAX_SPEED_MS),
            stay_s: Math.min(w.holdSeconds, MAX_STAY_S),
          })),
        }),
      });
      return Boolean(res && res.ok);
    },

    async start() {
      const res = await call('/mission/start', { method: 'POST' });
      // 409 is the bridge refusing because the upload has not finished
      // acknowledging. That is a correct refusal, not a transport failure.
      return Boolean(res && res.ok);
    },

    async abort() {
      const res = await call('/mission/abort', { method: 'POST' });
      return Boolean(res && res.ok);
    },
  };
}

/** Human-readable waypoint list, for typing into another app or reading aloud. */
export function describePlan(plan: FlightPlan): string[] {
  return plan.waypoints.map(
    (w) =>
      `${w.index}. ${formatGeo({ lat: w.lat, lon: w.lon })}  ·  ${w.altitudeM} m  ·  grid ${
        w.gridRef.row + 1
      },${w.gridRef.col + 1}`
  );
}

/**
 * Which link to use.
 *
 * The bridge when one is configured, hand-entry otherwise. Hand-entry is not a
 * failure state: a rented drone, or a phone not joined to the drone's WiFi, is
 * the normal case for most farmers, and the app is still doing the part a drone
 * app cannot — deciding where to look.
 */
export function activeLink(): DroneLink {
  return hasDroneLink() ? lwProLink(env.droneLinkUrl) : manualLink();
}
