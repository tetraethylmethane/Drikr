import { CropStage, RiskDomain, SensorMetric } from '../types';

/**
 * Knowledge base for the decision engine (the deck's "Knowledge Base & Decision Engine").
 *
 * Thresholds are agronomic reference bands, not model outputs: the ML models score
 * risk, and these bands turn a score into an interpretable reason and an action a
 * farmer can take. Keeping them declarative means the engine stays pure and testable,
 * and an agronomist can tune the app without touching logic.
 */

export interface Band {
  /** Comfortable operating range. */
  ideal: [number, number];
  /** Outside this range is an alert, between the two is a watch. */
  critical: [number, number];
  unit: string;
}

export interface CropProfile {
  key: string;
  label: string;
  /** Soil-moisture depletion tolerated before irrigation, by stage (% VWC). */
  moistureFloorByStage: Record<CropStage, number>;
  bands: Partial<Record<SensorMetric, Band>>;
  /** Target NPK at mid-season (ppm). */
  targetNpk: { n: number; p: number; k: number };
  /** Base temperature for pest degree-day accumulation (°C). */
  pestBaseTemp: number;
  /** Key pests, used to name the risk rather than saying "pest detected". */
  commonPests: string[];
  commonDiseases: string[];
  /** Typical yield, quintal per acre, for the profit model. */
  typicalYieldQuintalPerAcre: number;
  /** Days from sowing to each stage boundary. */
  stageDays: Record<CropStage, number>;
}

const COMMON_BANDS: Partial<Record<SensorMetric, Band>> = {
  airTemp: { ideal: [18, 33], critical: [8, 40], unit: '°C' },
  humidity: { ideal: [45, 80], critical: [25, 92], unit: '%' },
  ph: { ideal: [6.0, 7.5], critical: [5.0, 8.5], unit: '' },
  ec: { ideal: [0.4, 1.6], critical: [0.15, 3.0], unit: 'dS/m' },
  soilTemp: { ideal: [16, 32], critical: [10, 38], unit: '°C' },
  leafWetness: { ideal: [0, 45], critical: [0, 75], unit: '%' },
  windSpeed: { ideal: [0, 18], critical: [0, 30], unit: 'km/h' },
};

export const CROPS: Record<string, CropProfile> = {
  rice: {
    key: 'rice',
    label: 'Rice',
    moistureFloorByStage: {
      sowing: 45,
      vegetative: 50,
      flowering: 55,
      fruiting: 50,
      maturity: 35,
    },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [55, 85], critical: [40, 95], unit: '%' },
      nitrogen: { ideal: [160, 280], critical: [100, 400], unit: 'ppm' },
      ph: { ideal: [5.5, 7.0], critical: [4.5, 8.0], unit: '' },
    },
    targetNpk: { n: 220, p: 45, k: 140 },
    pestBaseTemp: 12,
    commonPests: ['Brown Planthopper', 'Stem Borer', 'Leaf Folder'],
    commonDiseases: ['Bacterial Leaf Blight', 'Blast', 'Sheath Blight'],
    typicalYieldQuintalPerAcre: 22,
    stageDays: { sowing: 0, vegetative: 25, flowering: 60, fruiting: 85, maturity: 110 },
  },
  wheat: {
    key: 'wheat',
    label: 'Wheat',
    moistureFloorByStage: {
      sowing: 40,
      vegetative: 38,
      flowering: 45,
      fruiting: 40,
      maturity: 28,
    },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [40, 70], critical: [25, 85], unit: '%' },
      nitrogen: { ideal: [140, 250], critical: [90, 360], unit: 'ppm' },
    },
    targetNpk: { n: 200, p: 50, k: 130 },
    pestBaseTemp: 8,
    commonPests: ['Aphid', 'Termite', 'Pink Stem Borer'],
    commonDiseases: ['Yellow Rust', 'Powdery Mildew', 'Karnal Bunt'],
    typicalYieldQuintalPerAcre: 18,
    stageDays: { sowing: 0, vegetative: 22, flowering: 65, fruiting: 90, maturity: 120 },
  },
  maize: {
    key: 'maize',
    label: 'Maize',
    moistureFloorByStage: {
      sowing: 42,
      vegetative: 40,
      flowering: 50,
      fruiting: 45,
      maturity: 30,
    },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [45, 72], critical: [28, 86], unit: '%' },
      nitrogen: { ideal: [150, 260], critical: [95, 380], unit: 'ppm' },
    },
    targetNpk: { n: 210, p: 55, k: 150 },
    pestBaseTemp: 10,
    commonPests: ['Fall Armyworm', 'Stem Borer', 'Shoot Fly'],
    commonDiseases: ['Turcicum Leaf Blight', 'Downy Mildew', 'Common Rust'],
    typicalYieldQuintalPerAcre: 25,
    stageDays: { sowing: 0, vegetative: 20, flowering: 55, fruiting: 80, maturity: 105 },
  },
  cotton: {
    key: 'cotton',
    label: 'Cotton',
    moistureFloorByStage: {
      sowing: 40,
      vegetative: 38,
      flowering: 48,
      fruiting: 45,
      maturity: 30,
    },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [42, 68], critical: [26, 82], unit: '%' },
      nitrogen: { ideal: [130, 240], critical: [85, 340], unit: 'ppm' },
    },
    targetNpk: { n: 190, p: 50, k: 160 },
    pestBaseTemp: 12,
    commonPests: ['Pink Bollworm', 'Whitefly', 'Jassid'],
    commonDiseases: ['Bacterial Blight', 'Alternaria Leaf Spot', 'Root Rot'],
    typicalYieldQuintalPerAcre: 10,
    stageDays: { sowing: 0, vegetative: 30, flowering: 70, fruiting: 110, maturity: 165 },
  },
  tomato: {
    key: 'tomato',
    label: 'Tomato',
    moistureFloorByStage: {
      sowing: 48,
      vegetative: 45,
      flowering: 52,
      fruiting: 50,
      maturity: 40,
    },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [50, 75], critical: [32, 88], unit: '%' },
      nitrogen: { ideal: [150, 270], critical: [100, 380], unit: 'ppm' },
      leafWetness: { ideal: [0, 35], critical: [0, 65], unit: '%' },
    },
    targetNpk: { n: 210, p: 60, k: 180 },
    pestBaseTemp: 11,
    commonPests: ['Fruit Borer', 'Whitefly', 'Leaf Miner'],
    commonDiseases: ['Early Blight', 'Late Blight', 'Leaf Curl Virus'],
    typicalYieldQuintalPerAcre: 120,
    stageDays: { sowing: 0, vegetative: 25, flowering: 45, fruiting: 70, maturity: 100 },
  },
  sugarcane: {
    key: 'sugarcane',
    label: 'Sugarcane',
    moistureFloorByStage: {
      sowing: 50,
      vegetative: 48,
      flowering: 50,
      fruiting: 48,
      maturity: 38,
    },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [52, 80], critical: [35, 92], unit: '%' },
      nitrogen: { ideal: [170, 290], critical: [110, 400], unit: 'ppm' },
    },
    targetNpk: { n: 240, p: 55, k: 170 },
    pestBaseTemp: 12,
    commonPests: ['Early Shoot Borer', 'Pyrilla', 'White Grub'],
    commonDiseases: ['Red Rot', 'Smut', 'Wilt'],
    typicalYieldQuintalPerAcre: 350,
    stageDays: { sowing: 0, vegetative: 45, flowering: 240, fruiting: 300, maturity: 360 },
  },
  groundnut: {
    key: 'groundnut',
    label: 'Groundnut',
    moistureFloorByStage: {
      sowing: 42,
      vegetative: 38,
      flowering: 46,
      fruiting: 44,
      maturity: 30,
    },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [40, 68], critical: [25, 82], unit: '%' },
      nitrogen: { ideal: [110, 200], critical: [70, 300], unit: 'ppm' },
    },
    targetNpk: { n: 150, p: 60, k: 120 },
    pestBaseTemp: 11,
    commonPests: ['Leaf Miner', 'Thrips', 'White Grub'],
    commonDiseases: ['Tikka Leaf Spot', 'Rust', 'Collar Rot'],
    typicalYieldQuintalPerAcre: 9,
    stageDays: { sowing: 0, vegetative: 25, flowering: 45, fruiting: 75, maturity: 110 },
  },
};

export const DEFAULT_CROP = 'maize';

export function cropProfile(crop: string | undefined): CropProfile {
  if (!crop) return CROPS[DEFAULT_CROP];
  const key = crop.toLowerCase().trim();
  return CROPS[key] ?? CROPS[DEFAULT_CROP];
}

export const CROP_KEYS = Object.keys(CROPS);

/** Stage inferred from days after sowing, so recommendations track the season. */
export function stageForDays(profile: CropProfile, daysAfterSowing: number): CropStage {
  const order: CropStage[] = ['sowing', 'vegetative', 'flowering', 'fruiting', 'maturity'];
  let current: CropStage = 'sowing';
  for (const stage of order) {
    if (daysAfterSowing >= profile.stageDays[stage]) current = stage;
  }
  return current;
}

const DAY_MS = 86_400_000;

/**
 * The single source of truth for a plot's growth stage.
 *
 * Always derived from the sowing date, never read from the stored `stage` field —
 * that field is a snapshot taken when the plot was created and goes stale as the
 * season advances. Two callers disagreeing about the stage means a sensor tile can
 * read "Normal" while the engine says "irrigate now", since stage sets the moisture
 * floor. `plot.stage` is kept for display only.
 */
export function currentStage(
  plot: { crop: string; sowingDate: string },
  at: number = Date.now()
): CropStage {
  const profile = cropProfile(plot.crop);
  const days = Math.max(0, Math.floor((at - new Date(plot.sowingDate).getTime()) / DAY_MS));
  return stageForDays(profile, days);
}

/** Hard operating limits for autonomous drone flight (deck: "drone regulations & weather limits"). */
export const DRONE_LIMITS = {
  maxWindKmh: 20,
  maxRainMm: 0.4,
  /** Spraying is scheduled into calm evening hours by default. */
  preferredHour: 17,
  minVisibilityHour: 6,
  maxVisibilityHour: 19,
  litresPerAcre: 12,
};

/** Cost model for the profit screen, in rupees per acre — deck's cost-reduction table. */
export const COST_MODEL = {
  conventional: { spray: 1150, water: 480, labour: 400, other: 900 },
  withDrikr: { spray: 500, water: 60, labour: 75, other: 900 },
  subscriptionPerMonth: 399,
  droneServicePerAcre: 500,
};

export const DOMAIN_LABELS: Record<RiskDomain, string> = {
  cropHealth: 'Crop Health',
  pest: 'Pest',
  nutrient: 'Nutrient',
  irrigation: 'Irrigation',
  climate: 'Climate Risk',
};

/** Biopesticide / input suggestions kept separate from logic for easy agronomist review. */
export const INPUT_SUGGESTIONS: Record<string, string> = {
  pest: 'Neem-based biopesticide (azadirachtin 1500 ppm) @ 2.5 ml/L',
  disease: 'Copper oxychloride 50% WP @ 2 g/L',
  nitrogen: 'Top-dress urea @ 25 kg/acre, split in two doses',
  phosphorus: 'Single super phosphate @ 40 kg/acre',
  potassium: 'Muriate of potash @ 20 kg/acre',
  ph_low: 'Apply agricultural lime @ 200 kg/acre and re-test in 3 weeks',
  ph_high: 'Apply gypsum @ 150 kg/acre; avoid alkaline irrigation water',
  ec_high: 'Leach with good-quality water; pause fertigation for one cycle',
};
