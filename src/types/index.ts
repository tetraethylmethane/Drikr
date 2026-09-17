/**
 * Drikr domain model (PS 26180).
 *
 * Mirrors the deck's data pipeline: field sensors + drone imagery + external data
 * -> readings -> risk scoring -> alerts/recommendations -> drone missions -> feedback.
 */

export type Language = 'en' | 'hi' | 'ta';

export type RiskLevel = 'healthy' | 'moderate' | 'high';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** The five detection domains named in the problem statement title. */
export type RiskDomain = 'cropHealth' | 'pest' | 'nutrient' | 'irrigation' | 'climate';

export type SensorMetric =
  | 'airTemp'
  | 'humidity'
  | 'soilMoisture'
  | 'soilTemp'
  | 'ph'
  | 'ec'
  | 'nitrogen'
  | 'phosphorus'
  | 'potassium'
  | 'leafWetness'
  | 'light'
  | 'rainfall'
  | 'windSpeed'
  | 'voc'
  | 'pestActivity';

/** One grid cell reference inside a plot, as shown in "Sensor Data (Grid 4,3)". */
export interface GridRef {
  row: number;
  col: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export type CropStage = 'sowing' | 'vegetative' | 'flowering' | 'fruiting' | 'maturity';

/**
 * One ground-truth point tying the normalised field drawing to the real world.
 *
 * The farmer taps a corner on the drawing, then stands at that corner while the
 * phone takes a GPS fix. Two of these georeference the whole plot — see
 * [geo.ts](src/services/geo.ts) for why two and not four.
 */
export interface GeoAnchor {
  /** Where they tapped, in the plot's normalised 0..1 space. */
  x: number;
  y: number;
  /** Where the phone said they were standing. */
  lat: number;
  lon: number;
  /** GPS accuracy at the moment of the fix, in metres, when the OS reported it. */
  accuracyM?: number;
  at: number;
}

export interface PlotGeoref {
  anchors: [GeoAnchor, GeoAnchor];
}

export interface Plot {
  id: string;
  /** Display name, e.g. "Plot A3". */
  name: string;
  crop: string;
  areaAcres: number;
  sowingDate: string;
  stage: CropStage;
  /** Field boundary in normalised 0..1 space for the health map polygon. */
  boundary: Array<{ x: number; y: number }>;
  centroid: GeoPoint;
  /**
   * Real-world anchoring, set by the farmer in Field Location. Absent until they
   * do it, which is why every geo function returns null rather than guessing:
   * `centroid` alone cannot give a grid cell a coordinate, because it says
   * nothing about which way the field is turned or how big it is.
   */
  georef?: PlotGeoref;
  /**
   * How this field is watched.
   *
   * `sensors` - nodes are installed. They see an abnormality and the drone is
   * sent to *that* part of the field. Continuous, and targeted.
   *
   * `scouting` - no nodes. There is nothing measuring this field, so the app
   * must not show sensor-derived risk for it at all. Instead the drone surveys
   * on a schedule set by the crop's disease calendar and the forecast, and the
   * photographs are the measurement. See [scouting.ts](src/services/scouting.ts).
   *
   * Absent means `sensors`, for plots created before this existed.
   */
  monitoring?: 'sensors' | 'scouting';
  /** Last completed survey, for the scouting schedule. Scouting fields only. */
  lastSurveyAt?: number;
  /** Health-map resolution. */
  grid: { rows: number; cols: number };
  soilType: string;
  irrigationType: 'drip' | 'sprinkler' | 'flood' | 'rainfed';
}

export type NodeStatus = 'online' | 'degraded' | 'offline';

/** A physical sensor node (the BOM's "Sensors (nodes, 4 units)"). */
export interface SensorNode {
  id: string;
  plotId: string;
  label: string;
  gridRef: GridRef;
  status: NodeStatus;
  batteryPct: number;
  signalPct: number;
  lastSeenAt: number;
  /** Days since last calibration — drives the calibration-drift mitigation. */
  daysSinceCalibration: number;
  /** Whether this node carries the electrochemical disease biosensor (SPCE). */
  hasBiosensor: boolean;
}

export interface SensorReading {
  nodeId: string;
  plotId: string;
  gridRef: GridRef;
  at: number;
  airTemp: number;
  humidity: number;
  soilMoisture: number;
  soilTemp: number;
  ph: number;
  ec: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  leafWetness: number;
  light: number;
  rainfall: number;
  windSpeed: number;
  voc: number;
  /** 0-100 composite pest pressure from VOC + trap + imagery signals. */
  pestActivity: number;
  /** Present only on biosensor-equipped nodes: pathogen signal in nA. */
  biosensorNa?: number;
}

/** Plot-level aggregate shown on Home as "Field A3 – Live Sensor Data". */
export interface PlotSnapshot {
  plotId: string;
  at: number;
  reading: SensorReading;
  nodesOnline: number;
  nodesTotal: number;
  healthIndex: number;
  risk: RiskLevel;
}

export interface HealthCell {
  gridRef: GridRef;
  healthIndex: number;
  risk: RiskLevel;
  /** Interpolated reading at the cell centre. */
  reading: SensorReading;
}

export interface HealthMap {
  plotId: string;
  at: number;
  rows: number;
  cols: number;
  cells: HealthCell[];
  worst: HealthCell | null;
  meanHealth: number;
}

/** One actionable instruction rendered under "Recommended Action". */
export interface Recommendation {
  id: string;
  domain: RiskDomain;
  text: string;
  /** Hours within which the action should happen. */
  windowHours: number;
  /** Whether the drone can execute this autonomously. */
  droneEligible: boolean;
  inputHint?: string;
}

export interface RiskAssessment {
  domain: RiskDomain;
  score: number;
  level: RiskLevel;
  severity: Severity;
  /** 0-1. Below the settings threshold the alert is suppressed (false-alert mitigation). */
  confidence: number;
  title: string;
  detail: string;
  drivers: Array<{ metric: SensorMetric | 'forecast'; value: number; unit: string; note: string }>;
  recommendations: Recommendation[];
}

export type AlertStatus = 'new' | 'acknowledged' | 'resolved' | 'dismissed';

export interface Alert {
  id: string;
  plotId: string;
  plotName: string;
  domain: RiskDomain;
  severity: Severity;
  confidence: number;
  title: string;
  detail: string;
  gridRef?: GridRef;
  createdAt: number;
  status: AlertStatus;
  recommendations: Recommendation[];
  drivers: RiskAssessment['drivers'];
  /** Farmer feedback closes the loop back into the model. */
  feedback?: AlertFeedback;
}

export interface AlertFeedback {
  wasAccurate: boolean;
  note?: string;
  at: number;
}

/**
 * `survey` is not `inspect` with different cells.
 *
 * An inspection is a response: something was detected and the drone goes to
 * look at it. A survey is a routine sweep of a field nobody has any measurement
 * for, timed by the crop calendar. They differ in what the farmer is being told
 * and in what a result means - an inspection that finds nothing is reassuring
 * about one spot, a survey that finds nothing is reassuring about the field.
 */
export type MissionType = 'inspect' | 'spray' | 'survey';
export type MissionStatus =
  | 'proposed'
  | 'scheduled'
  | 'in_flight'
  | 'completed'
  | 'aborted'
  | 'blocked';

export interface DroneMission {
  id: string;
  plotId: string;
  plotName: string;
  type: MissionType;
  status: MissionStatus;
  scheduledAt: number;
  createdAt: number;
  /** Target cells for precision spraying; empty means whole plot. */
  targetCells: GridRef[];
  areaAcres: number;
  payload?: { chemical: string; litres: number };
  /** Reason a mission is blocked, e.g. wind above the safe limit. */
  blockedReason?: string;
  alertId?: string;
  completedAt?: number;
  coveragePct?: number;
}

export interface WeatherNow {
  at: number;
  temp: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  code: number;
  isDay: boolean;
}

export interface WeatherDay {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  precipProbability: number;
  windMax: number;
  code: number;
}

export interface WeatherForecast {
  fetchedAt: number;
  place?: string;
  now: WeatherNow;
  hourly: Array<{ at: number; temp: number; humidity: number; precip: number; wind: number }>;
  daily: WeatherDay[];
}

export interface MarketPrice {
  commodity: string;
  variety: string;
  market: string;
  district: string;
  state: string;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
  unit: string;
  date: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  /** True when answered by the on-device decision engine rather than a cloud model. */
  offline?: boolean;
}

export interface CommunityPost {
  id: string;
  author: string;
  district?: string;
  crop?: string;
  text: string;
  at: number;
  likes: number;
  likedByMe?: boolean;
  replies: Array<{ id: string; author: string; text: string; at: number }>;
}

/**
 * Queued write that must survive low connectivity and sync when online.
 *
 * `telemetry` is readings collected from the sensor Master by a phone acting as
 * courier. It shares the queue with the farmer's own writes deliberately: both
 * need the same store-and-forward guarantees, and the transport underneath can
 * change without either caring.
 */
export interface OutboxItem {
  id: string;
  kind: 'alertStatus' | 'alertFeedback' | 'mission' | 'communityPost' | 'telemetry';
  payload: unknown;
  createdAt: number;
  attempts: number;
}

export interface UserProfile {
  phoneNumber: string;
  name?: string;
  district?: string;
  state?: string;
  fpo?: string;
  landAcres?: number;
}
