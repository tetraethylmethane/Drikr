import { requireOptionalNativeModule } from 'expo';

/**
 * Phone-side drone link (Android): the app talks to the DR-DG600C directly,
 * with no laptop. See android/src/main/java/expo/modules/dronelink/.
 *
 * Null in Expo Go and on iOS, which have no such native module; the app then
 * falls back to the laptop bridge or hand-entered waypoints.
 */

export interface DroneTelemetry {
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
  speed_ms: number | null;
  vspeed_ms: number | null;
  distance_home_m: number | null;
  yaw_deg: number | null;
  gps_sats: number | null;
  gps_fine: boolean | null;
  gps_fix: boolean;
  gps_accuracy: number | null;
  battery_pct: number | null;
  battery_raw: number | null;
  /** "locked", "unlocked", "taking_off", "unlocked_takeoff", "landing", ... */
  fly_state: string | null;
  hover: boolean;
  waypoint: number;
  airborne: boolean;
  stale: boolean;
  log_rows: number;
}

export interface DroneLinkStatus {
  running: boolean;
  connected: boolean;
  error?: string | null;
  linkAgeMs?: number;
  videoFrames?: number;
  photos?: number;
  mission?: { state: string; waypoints: number; uploaded: number; error: string | null };
  telemetry?: DroneTelemetry;
  scout?: ScoutStatus;
}

export interface ScoutStatus {
  /** idle, taking_off, settling, uploading, flying, landing, done, failed, cancelled */
  phase: string;
  /** Plain-language line for the farmer, e.g. "Flying to spot 3 of 8". */
  message: string | null;
  active: boolean;
  reached: number;
  total: number;
  spots: { spot: number; latitude: number; longitude: number; result: 'photographed' | 'missed' | 'pending' }[];
}

export interface NativeWaypoint {
  latitude: number;
  longitude: number;
  altitudeM: number;
  speedMs: number;
  stayS: number;
}

/** Commands return null when accepted, or the reason they were refused. */
type Refusal = string | null;

interface DroneLinkNative {
  start(): boolean;
  stop(): boolean;
  status(): DroneLinkStatus;
  takeoff(): Refusal;
  land(): Refusal;
  hover(): Refusal;
  returnHome(): Refusal;
  uploadMission(points: NativeWaypoint[]): Refusal;
  startMission(): Refusal;
  startScout(rows: number, cols: number, spacingM: number): Refusal;
  cancelScout(): Refusal;
  tiltCamera(dir: 0 | 1 | 2, ms: number): boolean;
  readFlightLog(): string | null;
  readPhotoIndex(): string | null;
  readPhotoBase64(name: string): string | null;
  bindProcessToWifi(enable: boolean): boolean;
}

const DroneLink = requireOptionalNativeModule<DroneLinkNative>('DroneLink');

export const droneLinkAvailable = DroneLink != null;
export default DroneLink;
