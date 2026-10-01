import NativeDroneLink, { droneLinkAvailable, ScoutStatus } from '../../modules/drone-link';
import { DroneMission, GeoPoint, Plot } from '../types';
import { checkGeoref, formatGeo, gridRefToGeo } from './geo';
import { tr } from '../i18n/tr';
import { localizeNative } from './nativeText';

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
      tr('link.tooMany', { max: MAX_WAYPOINTS, dropped })
    );
  }

  if (altitudeM > MAX_ALTITUDE_M) {
    problems.push(tr('link.tooHigh', { alt: altitudeM, max: MAX_ALTITUDE_M }));
  }

  if (check.ok && waypoints.length === 0) {
    problems.push(tr('link.empty'));
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

export type LinkKind = 'manual' | 'phone' | 'mavlink';

export interface LinkStatus {
  connected: boolean;
  /** Free text for the UI: "Not connected", "Waypoint 3 of 8", a failure reason. */
  detail: string;
  batteryPct?: number;
  /** 0..100, from the aircraft's own mission progress when it reports one. */
  progressPct?: number;
  /** From the drone's own GPS, when the link decodes its telemetry. */
  gpsFix?: boolean;
  gpsSats?: number;
  position?: GeoPoint;
  altitudeM?: number;
  /** 1-based waypoint the drone is holding at, 0 when between points. */
  atWaypoint?: number;
  /** "locked", "taking_off", "unlocked_takeoff", "landing", ... */
  flyState?: string;
  airborne?: boolean;
  /** Mission as the aircraft holds it: idle / uploading / ready / flying / failed. */
  missionState?: string;
  /** Phone link only: the link service is running (it may not have heard the drone yet). */
  running?: boolean;
  /** Phone link only: the one-button scout, when one has run. */
  scout?: ScoutStatus;
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
  /**
   * Links that talk to the aircraft themselves (the phone link) can also open
   * the connection and take off / land.
   */
  connect?(): Promise<boolean>;
  disconnect?(): Promise<boolean>;
  takeoff?(): Promise<boolean>;
  land?(): Promise<boolean>;
  /** One button: take off, photograph a small grid of spots around the drone, land. */
  scout?(rows: number, cols: number, spacingM: number): Promise<boolean>;
  /** Stop scouting and hold position. */
  cancelScout?(): Promise<boolean>;
  /** Why the last command was refused, in words for the farmer. */
  lastRefusal?(): string | null;
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
    get label() {
      return tr('link.manual');
    },
    canCommand: false,
    async status() {
      return { connected: false, detail: tr('link.manualDetail') };
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
 * The phone talks to the drone itself (Android build with the drone-link
 * native module). The module keeps the 25 Hz link
 * alive in a foreground service, uploads waypoints, logs the drone's GPS and
 * keeps hover photos on the phone.
 *
 * No piloting. The sticks stay centred; the flight
 * controller flies its own GPS takeoff, waypoint mission and landing.
 */
export function phoneLink(): DroneLink {
  const native = NativeDroneLink!;
  let refusal: string | null = null;
  const run = (why: string | null) => {
    refusal = why === null ? null : localizeNative(why);
    return why === null;
  };

  return {
    kind: 'phone',
    get label() {
      return tr('link.phone');
    },
    canCommand: true,

    async status() {
      const st = native.status();
      if (!st.running) {
        return { connected: false, running: false, detail: st.error ? localizeNative(st.error) : tr('link.notConnected') };
      }
      if (!st.connected) {
        return { connected: false, running: true, detail: tr('native.noSignal') };
      }
      const t = st.telemetry;
      const m = st.mission;
      const parts: string[] = [];
      if (t) {
        parts.push(t.gps_fix ? tr('link.gps', { n: t.gps_sats ?? 0 }) : tr('link.noGps'));
        if (t.waypoint) parts.push(tr('link.atStop', { n: t.waypoint }));
        if (t.battery_pct != null) parts.push(tr('link.battery', { pct: t.battery_pct }));
      }
      if (m && m.state !== 'idle') {
        if (m.state === 'uploading') parts.push(tr('link.sending', { n: m.uploaded + 1, total: m.waypoints }));
      }
      return {
        connected: true,
        running: true,
        detail: parts.join(' · '),
        batteryPct: t?.battery_pct ?? undefined,
        progressPct: m && m.waypoints > 0 ? Math.round((m.uploaded / m.waypoints) * 100) : undefined,
        gpsFix: t?.gps_fix,
        gpsSats: t?.gps_sats ?? undefined,
        position: t?.gps_fix && t.latitude != null && t.longitude != null ? { lat: t.latitude, lon: t.longitude } : undefined,
        altitudeM: t?.altitude_m ?? undefined,
        atWaypoint: t?.waypoint,
        flyState: t?.fly_state ?? undefined,
        airborne: t?.airborne,
        missionState: m?.state,
        scout: st.scout,
      };
    },

    async connect() {
      return run(native.start() ? null : tr('link.startFailed'));
    },
    async disconnect() {
      native.stop();
      return run(null);
    },
    async takeoff() {
      return run(native.takeoff());
    },
    async land() {
      return run(native.land());
    },
    async scout(rows: number, cols: number, spacingM: number) {
      return run(native.startScout(rows, cols, spacingM));
    },
    async cancelScout() {
      return run(native.cancelScout());
    },

    async upload(plan: FlightPlan) {
      if (plan.problems.length > 0 || plan.waypoints.length === 0) return run(tr('link.planProblems'));
      return run(
        native.uploadMission(
          plan.waypoints.map((w) => ({
            latitude: w.lat,
            longitude: w.lon,
            altitudeM: w.altitudeM,
            speedMs: Math.min(w.speedMs, MAX_SPEED_MS),
            stayS: Math.min(w.holdSeconds, MAX_STAY_S),
          }))
        )
      );
    },

    async start() {
      return run(native.startMission());
    },

    async abort() {
      return run(native.hover());
    },

    lastRefusal: () => refusal,
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
 * The phone flies the drone itself wherever the native module exists (the
 * Android app). Elsewhere (iOS, Expo Go) the app hands the farmer the route to
 * type into the drone's own app. Hand-entry is not a failure state: for a
 * rented drone it may be the only link that works, and the app is still doing
 * the part a drone app cannot - deciding where to look.
 */
export function activeLink(): DroneLink {
  return droneLinkAvailable ? phoneLink() : manualLink();
}
