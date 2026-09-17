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
  /** Which grid cell this came from, for tracing a waypoint back to its evidence. */
  gridRef: { row: number; col: number };
}

export interface FlightPlan {
  missionId: string;
  plotId: string;
  plotName: string;
  waypoints: Waypoint[];
  /** Home/launch point: the first anchor, which is a corner the farmer stood on. */
  home: GeoPoint | null;
  /** Anything that makes this plan untrustworthy. Non-empty means do not fly. */
  problems: string[];
  warnings: string[];
}

/** Inspection altitude, metres above launch. */
const INSPECT_ALTITUDE_M = 12;
/** Spray altitude — low, because drift rises steeply with height. */
const SPRAY_ALTITUDE_M = 3;

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
        gridRef: ref,
      });
    });
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
 * Only the manual link exists today. When a real transport lands this becomes a
 * setting; until then returning a single link keeps every caller written against
 * the interface rather than against the placeholder.
 */
export function activeLink(): DroneLink {
  return manualLink();
}
