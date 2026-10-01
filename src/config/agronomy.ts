import { CropStage, RiskDomain, SensorMetric } from '../types';
import { slug, tr } from '../i18n/tr';

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
  /**
   * Other names a farmer might search for, including local-language names in
   * Latin script. Search matches these as well as the label, because a farmer
   * looking for their crop types the word they use, not the one we picked.
   */
  aliases: string[];
  /**
   * When each common disease usually appears, and the weather that favours it.
   *
   * This is what makes scheduled scouting possible on a field with no sensors:
   * crop + days since sowing + forecast is enough to say "this is the fortnight
   * Late Blight shows up, and the weather suits it - go and look".
   *
   * APPROXIMATE, and labelled as such wherever it reaches the farmer. The day
   * ranges are typical for Indian conditions and shift with variety, region and
   * season. This is the table an agronomist should review first.
   */
  diseaseWindows: DiseaseWindow[];
}

/**
 * Where a piece of this entry came from.
 *
 * `TNAU` - the Tamil Nadu Agricultural University crop-protection guide,
 * "Management of diseases of important Agriculture Crops of Tamil Nadu"
 * (agritech.tnau.ac.in/pdf/8.pdf), which states favourable conditions and stage
 * of infection per disease. Written by agronomists, which is the point.
 *
 * `PAU` - Punjab Agricultural University / ICAR-IIWBR advisory guidance for
 * wheat, which is where wheat advice for north India comes from. Weaker than the
 * TNAU entries: those were read out of TNAU's own pages, while this reached us
 * through agricultural press reporting the advisories rather than from a primary
 * document. Treat as sourced but worth re-checking.
 *
 * `estimated` - written from general agronomy and NOT verified against a
 * source. Kept visible rather than quietly mixed in with the sourced entries,
 * because an agronomist reviewing this table needs to know which lines to
 * attack first, and because the UI should hedge harder on a guess.
 *
 * Sourcing corrected real errors, which is the argument for doing it at all
 * rather than trusting a table that reads plausibly. Rice Blast wanted COOL
 * nights (TNAU: 15-20 C, RH 93-99%) where the estimate said 20-28 C; groundnut
 * Tikka wanted ~20 C where the estimate said 25-30 C; rice Bacterial Leaf
 * Blight tops out at 30 C, not 34.
 */
export type DiseaseSource = 'TNAU' | 'ICAR' | 'PAU' | 'estimated';

export interface DiseaseWindow {
  disease: string;
  /** Days after sowing, inclusive. */
  fromDay: number;
  toDay: number;
  /**
   * Weather that raises the odds. Every condition present must hold for the
   * window to count as favoured - absent fields are simply not checked.
   *
   * Deliberately absent on several entries. TNAU's favourable conditions are
   * often things a forecast cannot evaluate - soil temperature, nitrogen dose,
   * heavy soils, monoculture, close planting, insect wounding. Encoding those
   * as air temperature would be inventing a check we cannot perform, so the
   * window opens on the calendar and simply never reports as "weather suits
   * it". The unencodable factors are carried in `alsoNeeds` instead, where they
   * are useful advice rather than a false measurement.
   */
  favours?: {
    minHumidity?: number;
    minTempC?: number;
    maxTempC?: number;
    /** Dew or rain leaving the leaves wet is required for infection. */
    needsLeafWetness?: boolean;
  };
  /**
   * Risk factors the source names that we cannot check from weather - shown to
   * the farmer as things to consider, never treated as a condition.
   */
  alsoNeeds?: string;
  /** Provenance of `favours`. */
  conditionsSource: DiseaseSource;
  /** Provenance of `fromDay`/`toDay`. TNAU states a stage of infection for some. */
  timingSource: DiseaseSource;
  /** What to look for, in plain words. Drives the scouting card and photo prompt. */
  lookFor: string;
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
    aliases: ['paddy', 'dhan', 'chawal', 'nel', 'arisi', 'oryza'],
    diseaseWindows: [
      {
        disease: 'Blast',
        fromDay: 25,
        toDay: 85,
        favours: { minHumidity: 93, minTempC: 15, maxTempC: 26, needsLeafWetness: true },
        alsoNeeds:
          'Excess nitrogen, and collateral host grasses on the bunds',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Spindle-shaped grey lesions with dark brown borders, often ringed by a yellow halo',
      },
      {
        disease: 'Bacterial Leaf Blight',
        fromDay: 40,
        toDay: 100,
        favours: { minTempC: 25, maxTempC: 30, needsLeafWetness: true },
        alsoNeeds:
          'Severe wind that wounds the leaves, over-fertilisation, deep standing water, and rice stubble or ratoons of infected plants nearby. TNAU says high humidity but gives no figure, so none is invented here.',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Yellow to straw-white streaks along the leaf edges, spreading down from the tip',
      },
      {
        disease: 'Sheath Blight',
        fromDay: 30,
        toDay: 95,
        favours: { minHumidity: 96, minTempC: 30, maxTempC: 32 },
        alsoNeeds:
          'Close planting and heavy nitrogen',
        conditionsSource: 'TNAU',
        timingSource: 'TNAU',
        lookFor: 'Oval water-soaked patches on the sheath, near the water line',
      },
    ],
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
    aliases: ['gehu', 'gehun', 'godhumai', 'triticum'],
    diseaseWindows: [
      {
        disease: 'Yellow Rust',
        fromDay: 45,
        toDay: 105,
        favours: { minHumidity: 80, minTempC: 10, maxTempC: 20, needsLeafWetness: true },
        alsoNeeds:
          'Most damaging early in crop growth. Yellowing of leaves is not always rust - confirm before spraying.',
        conditionsSource: 'PAU',
        timingSource: 'estimated',
        lookFor: 'Yellow-orange powdery stripes running in rows along the leaf',
      },
      {
        disease: 'Powdery Mildew',
        fromDay: 35,
        toDay: 90,
        // Humid but NOT wet: free water on the leaf suppresses powdery
        // mildew rather than helping it, unlike almost every other fungus in
        // this table. needsLeafWetness is deliberately absent, and adding it
        // "for consistency" would invert the biology.
        favours: { minHumidity: 75, minTempC: 15, maxTempC: 25 },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'White powdery patches on the upper side of the leaf',
      },
      {
        disease: 'Karnal Bunt',
        fromDay: 75,
        toDay: 115,
        favours: { minHumidity: 80, minTempC: 18, maxTempC: 24 },
        alsoNeeds:
          'Infects at flowering. North Indian advisories place the protective spray in mid-February. Favourable conditions here are still unverified.',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Blackened grain inside the ear with a rotten-fish smell',
      },
    ],
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
    aliases: ['makka', 'makai', 'corn', 'bhutta', 'cholam', 'zea'],
    diseaseWindows: [
      {
        disease: 'Downy Mildew',
        fromDay: 15,
        toDay: 55,
        favours: { minHumidity: 90, minTempC: 21, maxTempC: 33, needsLeafWetness: true },
        alsoNeeds:
          'Young plants are the most susceptible',
        conditionsSource: 'TNAU',
        timingSource: 'TNAU',
        lookFor: 'Chlorotic streaks with white fungal growth on both leaf surfaces; plants stunted and bushy',
      },
      {
        disease: 'Turcicum Leaf Blight',
        fromDay: 30,
        toDay: 85,
        favours: { minTempC: 8, maxTempC: 27, needsLeafWetness: true },
        alsoNeeds:
          'Infection starts early in the wet season',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Long cigar-shaped grey-green lesions, on the lower leaves first',
      },
      {
        disease: 'Common Rust',
        fromDay: 35,
        toDay: 90,
        favours: { minHumidity: 75, minTempC: 16, maxTempC: 25 },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Small cinnamon-brown pustules on both sides of the leaf',
      },
    ],
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
    aliases: ['kapas', 'narma', 'paruthi', 'gossypium'],
    diseaseWindows: [
      {
        disease: 'Root Rot',
        fromDay: 20,
        toDay: 70,
        alsoNeeds:
          'Dry weather after heavy rain, high soil temperature, and wounding by ash weevil grubs or nematodes. Soil temperature is not something the app can measure.',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Sudden wilting in patches; bark peels off the root easily',
      },
      {
        disease: 'Bacterial Blight',
        fromDay: 30,
        toDay: 100,
        favours: { minHumidity: 80, minTempC: 28, maxTempC: 36 },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Angular dark-brown spots bounded by the leaf veins',
      },
      {
        disease: 'Alternaria Leaf Spot',
        fromDay: 45,
        toDay: 120,
        favours: { minTempC: 25, maxTempC: 28, needsLeafWetness: true },
        alsoNeeds:
          'High humidity with intermittent rain',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Brown spots with concentric rings and grey centres',
      },
    ],
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
    aliases: ['tamatar', 'thakkali', 'takkali', 'solanum'],
    diseaseWindows: [
      {
        disease: 'Leaf Curl Virus',
        fromDay: 15,
        toDay: 70,
        // No `favours`: TNAU's page for this disease states no weather
        // conditions at all, and it is whitefly-vectored - vector pressure
        // drives it, not the sky. So the window opens on the calendar and
        // never claims the weather suits it.
        alsoNeeds:
          'Whitefly numbers, which drive this far more than the weather. TNAU lists no temperature or humidity for it. Check the underside of young leaves for whitefly.',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Leaves curling upward and puckered, plant stunted',
      },
      {
        disease: 'Early Blight',
        fromDay: 30,
        toDay: 100,
        favours: { minTempC: 24, maxTempC: 29, needsLeafWetness: true },
        alsoNeeds: 'Crop debris left from the previous season',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Dark spots with target-like rings, on the lowest leaves first',
      },
      {
        disease: 'Late Blight',
        fromDay: 35,
        toDay: 95,
        // TNAU: "Cool nights, warm days and extended wet conditions from rain
        // and fog", sporulation optimum 18-22 C. Its humidity line renders as
        // "RH is < 90%", which is almost certainly a mis-escaped ">": sporangia
        // require high humidity, and the same sentence demands extended wet
        // conditions. Read as >= 90% rather than transcribed literally.
        favours: { minHumidity: 90, minTempC: 18, maxTempC: 22, needsLeafWetness: true },
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Water-soaked grey-green patches with white mould on the underside',
      },
    ],
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
    aliases: ['ganna', 'ikshu', 'karumbu', 'cane', 'saccharum'],
    diseaseWindows: [
      {
        disease: 'Smut',
        fromDay: 60,
        toDay: 240,
        alsoNeeds:
          'Monoculture, continuous ratooning, and dry weather during tillering',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'A long black whip growing out of the top of the cane',
      },
      {
        disease: 'Red Rot',
        fromDay: 120,
        toDay: 300,
        alsoNeeds:
          'Monoculture, successive ratoon cropping, waterlogging, and insect injury. TNAU names no temperature or humidity for this one.',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Split a cane: red inside with white crossbands, smells of alcohol',
      },
      {
        disease: 'Wilt',
        fromDay: 150,
        toDay: 330,
        alsoNeeds:
          'Water stress or waterlogging, root damage, and a previous wilt-affected crop in the same field. No clean weather window drives this one, so it opens on the calendar but never reports as weather-favoured.',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Cane drying from the top down, hollow and light when tapped',
      },
    ],
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
    aliases: ['moongphali', 'mungfali', 'peanut', 'verkadalai', 'arachis', 'singdana'],
    diseaseWindows: [
      {
        disease: 'Collar Rot',
        fromDay: 5,
        toDay: 35,
        favours: { needsLeafWetness: true },
        alsoNeeds:
          'A prolonged rainy spell at the seedling stage, and low-lying ground',
        conditionsSource: 'TNAU',
        timingSource: 'TNAU',
        lookFor: 'Seedlings collapsing at soil level, black fungal growth on the collar',
      },
      {
        disease: 'Tikka Leaf Spot',
        fromDay: 35,
        toDay: 95,
        favours: { minHumidity: 90, minTempC: 18, maxTempC: 24, needsLeafWetness: true },
        alsoNeeds:
          'Three days or more of high humidity, heavy nitrogen and phosphorus, and magnesium-deficient soil',
        conditionsSource: 'TNAU',
        timingSource: 'estimated',
        lookFor: 'Circular reddish-brown to dark brown spots ringed by a bright yellow halo',
      },
      {
        disease: 'Rust',
        fromDay: 45,
        toDay: 100,
        favours: { minHumidity: 85, minTempC: 20, maxTempC: 28 },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Orange pustules on the underside of the leaflets',
      },
    ],
  },
  // ---------------------------------------------------------------------------
  // Added in 1.2. Timing and weather for these are general agronomy, labelled
  // `estimated` throughout until an agronomist signs them off; the app already
  // hedges harder on estimated windows.
  // ---------------------------------------------------------------------------
  soybean: {
    key: 'soybean',
    label: 'Soybean',
    moistureFloorByStage: { sowing: 42, vegetative: 40, flowering: 48, fruiting: 46, maturity: 30 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [42, 70], critical: [26, 85], unit: '%' },
      nitrogen: { ideal: [100, 200], critical: [60, 300], unit: 'ppm' },
    },
    targetNpk: { n: 140, p: 60, k: 120 },
    pestBaseTemp: 10,
    commonPests: ['Girdle Beetle', 'Stem Fly', 'Tobacco Caterpillar'],
    commonDiseases: ['Yellow Mosaic Virus', 'Rust', 'Charcoal Rot'],
    typicalYieldQuintalPerAcre: 8,
    stageDays: { sowing: 0, vegetative: 20, flowering: 40, fruiting: 65, maturity: 95 },
    aliases: ['soya', 'soyabean', 'soya bean', 'bhatmas', 'glycine'],
    diseaseWindows: [
      {
        disease: 'Yellow Mosaic Virus',
        fromDay: 15,
        toDay: 60,
        alsoNeeds: 'Spread by whitefly. Check the underside of young leaves for whitefly.',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Bright yellow patches mixed with green on the leaves',
      },
      {
        disease: 'Rust',
        fromDay: 35,
        toDay: 90,
        favours: { minHumidity: 80, minTempC: 18, maxTempC: 26, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Tiny tan to reddish-brown pustules on the underside of the leaves',
      },
      {
        disease: 'Charcoal Rot',
        fromDay: 50,
        toDay: 95,
        alsoNeeds: 'A hot dry spell and water stress while the pods fill',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Plants wilt and dry early; grey-black specks inside the lower stem',
      },
    ],
  },
  chickpea: {
    key: 'chickpea',
    label: 'Chickpea',
    moistureFloorByStage: { sowing: 38, vegetative: 32, flowering: 38, fruiting: 35, maturity: 25 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [35, 62], critical: [22, 78], unit: '%' },
      nitrogen: { ideal: [80, 170], critical: [50, 260], unit: 'ppm' },
    },
    targetNpk: { n: 110, p: 55, k: 100 },
    pestBaseTemp: 8,
    commonPests: ['Pod Borer', 'Cutworm', 'Aphid'],
    commonDiseases: ['Wilt', 'Ascochyta Blight', 'Dry Root Rot'],
    typicalYieldQuintalPerAcre: 6,
    stageDays: { sowing: 0, vegetative: 25, flowering: 50, fruiting: 75, maturity: 105 },
    aliases: ['chana', 'gram', 'bengal gram', 'kadalai', 'harbhara', 'sanagalu', 'cicer'],
    diseaseWindows: [
      {
        disease: 'Wilt',
        fromDay: 20,
        toDay: 90,
        alsoNeeds: 'Warm soil, and wilt in earlier chickpea crops in the same field',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Leaves droop and yellow from the bottom up; split the stem and look for brown streaks inside',
      },
      {
        disease: 'Ascochyta Blight',
        fromDay: 40,
        toDay: 90,
        favours: { minHumidity: 85, minTempC: 15, maxTempC: 25, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Brown spots with dark rings on the leaves, stems and pods',
      },
      {
        disease: 'Dry Root Rot',
        fromDay: 50,
        toDay: 100,
        alsoNeeds: 'Dry, hot soil at flowering and podding',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Plants dry up suddenly; the root is black, brittle and has lost its side roots',
      },
    ],
  },
  tur: {
    key: 'tur',
    label: 'Tur (Pigeon pea)',
    moistureFloorByStage: { sowing: 40, vegetative: 34, flowering: 40, fruiting: 38, maturity: 26 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [38, 65], critical: [24, 80], unit: '%' },
      nitrogen: { ideal: [80, 170], critical: [50, 260], unit: 'ppm' },
    },
    targetNpk: { n: 110, p: 55, k: 100 },
    pestBaseTemp: 10,
    commonPests: ['Pod Borer', 'Pod Fly', 'Blister Beetle'],
    commonDiseases: ['Wilt', 'Sterility Mosaic', 'Phytophthora Blight'],
    typicalYieldQuintalPerAcre: 6,
    stageDays: { sowing: 0, vegetative: 30, flowering: 90, fruiting: 130, maturity: 170 },
    aliases: ['arhar', 'toor', 'tuar', 'pigeon pea', 'pigeonpea', 'red gram', 'thuvarai', 'kandulu', 'cajanus'],
    diseaseWindows: [
      {
        disease: 'Phytophthora Blight',
        fromDay: 10,
        toDay: 60,
        favours: { needsLeafWetness: true },
        alsoNeeds: 'Waterlogged, low-lying patches after heavy rain',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Water-soaked patches on the stem near the soil; the stem breaks and the plant dies',
      },
      {
        disease: 'Sterility Mosaic',
        fromDay: 20,
        toDay: 90,
        alsoNeeds: 'Spread by tiny mites; old or ratoon pigeon pea plants nearby',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Small, pale, crowded leaves with a mosaic pattern; bushy plants with no flowers',
      },
      {
        disease: 'Wilt',
        fromDay: 30,
        toDay: 150,
        alsoNeeds: 'Wilt in earlier pigeon pea crops in the same field',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Plants wilt in patches; a purple band at the stem base and brown streaks inside',
      },
    ],
  },
  moong: {
    key: 'moong',
    label: 'Moong (Green gram)',
    moistureFloorByStage: { sowing: 40, vegetative: 36, flowering: 42, fruiting: 38, maturity: 26 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [38, 65], critical: [24, 80], unit: '%' },
      nitrogen: { ideal: [70, 160], critical: [45, 250], unit: 'ppm' },
    },
    targetNpk: { n: 100, p: 50, k: 90 },
    pestBaseTemp: 10,
    commonPests: ['Whitefly', 'Thrips', 'Pod Borer'],
    commonDiseases: ['Yellow Mosaic Virus', 'Powdery Mildew', 'Cercospora Leaf Spot'],
    typicalYieldQuintalPerAcre: 4,
    stageDays: { sowing: 0, vegetative: 20, flowering: 35, fruiting: 50, maturity: 65 },
    aliases: ['mung', 'moong', 'green gram', 'pachai payaru', 'pesalu', 'hesaru', 'vigna radiata'],
    diseaseWindows: [
      {
        disease: 'Yellow Mosaic Virus',
        fromDay: 10,
        toDay: 45,
        alsoNeeds: 'Spread by whitefly. Check the underside of young leaves for whitefly.',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Bright yellow patches mixed with green on the leaves',
      },
      {
        disease: 'Cercospora Leaf Spot',
        fromDay: 25,
        toDay: 55,
        favours: { minHumidity: 85, minTempC: 25, maxTempC: 32, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Small brown spots with grey centres and reddish edges on the leaves',
      },
      {
        disease: 'Powdery Mildew',
        fromDay: 30,
        toDay: 60,
        // Humid but not wet, as for wheat powdery mildew above.
        favours: { minHumidity: 70, minTempC: 20, maxTempC: 28 },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'White powdery patches on the leaves',
      },
    ],
  },
  mustard: {
    key: 'mustard',
    label: 'Mustard',
    moistureFloorByStage: { sowing: 38, vegetative: 34, flowering: 40, fruiting: 36, maturity: 25 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [36, 64], critical: [22, 80], unit: '%' },
      nitrogen: { ideal: [120, 230], critical: [80, 330], unit: 'ppm' },
    },
    targetNpk: { n: 180, p: 50, k: 100 },
    pestBaseTemp: 8,
    commonPests: ['Mustard Aphid', 'Painted Bug', 'Sawfly'],
    commonDiseases: ['Alternaria Blight', 'White Rust', 'Powdery Mildew'],
    typicalYieldQuintalPerAcre: 6,
    stageDays: { sowing: 0, vegetative: 25, flowering: 50, fruiting: 80, maturity: 115 },
    aliases: ['sarson', 'rai', 'rapeseed', 'toria', 'kadugu', 'avalu', 'brassica'],
    diseaseWindows: [
      {
        disease: 'White Rust',
        fromDay: 30,
        toDay: 90,
        favours: { minHumidity: 80, minTempC: 10, maxTempC: 20, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Raised white blisters on the underside of the leaves; swollen, twisted flower stalks',
      },
      {
        disease: 'Alternaria Blight',
        fromDay: 40,
        toDay: 110,
        favours: { minHumidity: 70, minTempC: 18, maxTempC: 27, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Round dark-brown spots with rings on the leaves and pods',
      },
    ],
  },
  onion: {
    key: 'onion',
    label: 'Onion',
    moistureFloorByStage: { sowing: 50, vegetative: 48, flowering: 50, fruiting: 45, maturity: 30 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [48, 72], critical: [30, 86], unit: '%' },
      nitrogen: { ideal: [120, 230], critical: [80, 330], unit: 'ppm' },
    },
    targetNpk: { n: 180, p: 60, k: 140 },
    pestBaseTemp: 10,
    commonPests: ['Thrips', 'Onion Maggot', 'Cutworm'],
    commonDiseases: ['Purple Blotch', 'Stemphylium Blight', 'Downy Mildew'],
    typicalYieldQuintalPerAcre: 100,
    stageDays: { sowing: 0, vegetative: 30, flowering: 60, fruiting: 90, maturity: 120 },
    aliases: ['pyaz', 'pyaaz', 'kanda', 'vengayam', 'ulli', 'eerulli', 'allium'],
    diseaseWindows: [
      {
        disease: 'Stemphylium Blight',
        fromDay: 40,
        toDay: 100,
        favours: { minHumidity: 85, minTempC: 18, maxTempC: 25, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Yellow-brown streaks on one side of the leaf; the leaf tips dry out',
      },
      {
        disease: 'Purple Blotch',
        fromDay: 45,
        toDay: 110,
        favours: { minHumidity: 80, minTempC: 21, maxTempC: 30, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Small white sunken spots that grow into purple patches with yellow edges',
      },
    ],
  },
  potato: {
    key: 'potato',
    label: 'Potato',
    moistureFloorByStage: { sowing: 48, vegetative: 50, flowering: 55, fruiting: 52, maturity: 35 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [50, 75], critical: [32, 88], unit: '%' },
      nitrogen: { ideal: [150, 270], critical: [100, 380], unit: 'ppm' },
    },
    targetNpk: { n: 210, p: 70, k: 180 },
    pestBaseTemp: 7,
    commonPests: ['Aphid', 'Cutworm', 'Tuber Moth'],
    commonDiseases: ['Late Blight', 'Early Blight', 'Black Scurf'],
    typicalYieldQuintalPerAcre: 100,
    stageDays: { sowing: 0, vegetative: 20, flowering: 40, fruiting: 60, maturity: 90 },
    aliases: ['aloo', 'alu', 'batata', 'urulaikizhangu', 'bangaladumpa', 'solanum tuberosum'],
    diseaseWindows: [
      {
        disease: 'Late Blight',
        fromDay: 30,
        toDay: 90,
        favours: { minHumidity: 90, minTempC: 10, maxTempC: 22, needsLeafWetness: true },
        alsoNeeds: 'Cool, foggy or drizzly days one after another. Spreads very fast - act the same day.',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Water-soaked grey-green patches with white mould on the underside',
      },
      {
        disease: 'Early Blight',
        fromDay: 35,
        toDay: 90,
        favours: { minTempC: 24, maxTempC: 29, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Dark spots with target-like rings, on the oldest leaves first',
      },
    ],
  },
  chilli: {
    key: 'chilli',
    label: 'Chilli',
    moistureFloorByStage: { sowing: 46, vegetative: 44, flowering: 50, fruiting: 48, maturity: 36 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [45, 72], critical: [28, 86], unit: '%' },
      nitrogen: { ideal: [140, 250], critical: [90, 350], unit: 'ppm' },
    },
    targetNpk: { n: 200, p: 60, k: 160 },
    pestBaseTemp: 11,
    commonPests: ['Thrips', 'Mites', 'Fruit Borer'],
    commonDiseases: ['Leaf Curl Virus', 'Anthracnose', 'Powdery Mildew'],
    typicalYieldQuintalPerAcre: 10,
    stageDays: { sowing: 0, vegetative: 30, flowering: 60, fruiting: 90, maturity: 150 },
    aliases: ['mirchi', 'mirch', 'milagai', 'menasinakai', 'mirapa', 'capsicum', 'chili', 'chilly'],
    diseaseWindows: [
      {
        disease: 'Leaf Curl Virus',
        fromDay: 20,
        toDay: 90,
        alsoNeeds: 'Spread by whitefly; thrips and mites cause similar curling. Check the underside of young leaves.',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Leaves curl, crinkle and stay small; the plant is stunted',
      },
      {
        disease: 'Anthracnose',
        fromDay: 90,
        toDay: 160,
        favours: { minHumidity: 85, minTempC: 24, maxTempC: 30, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Sunken dark spots with rings on ripe fruit; shoot tips dying back',
      },
    ],
  },
  banana: {
    key: 'banana',
    label: 'Banana',
    moistureFloorByStage: { sowing: 55, vegetative: 55, flowering: 58, fruiting: 55, maturity: 45 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [55, 80], critical: [38, 92], unit: '%' },
      nitrogen: { ideal: [170, 300], critical: [110, 420], unit: 'ppm' },
    },
    targetNpk: { n: 250, p: 60, k: 300 },
    pestBaseTemp: 13,
    commonPests: ['Rhizome Weevil', 'Pseudostem Weevil', 'Banana Aphid'],
    commonDiseases: ['Sigatoka Leaf Spot', 'Panama Wilt', 'Bunchy Top'],
    typicalYieldQuintalPerAcre: 200,
    stageDays: { sowing: 0, vegetative: 90, flowering: 210, fruiting: 270, maturity: 330 },
    aliases: ['kela', 'vazhai', 'vazha', 'bale', 'arati', 'plantain', 'musa'],
    diseaseWindows: [
      {
        disease: 'Bunchy Top',
        fromDay: 30,
        toDay: 240,
        alsoNeeds: 'Spread by the banana aphid and by infected suckers. Remove sick plants with their suckers.',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Narrow, stiff leaves bunched at the top; dark green dashes along the leaf veins',
      },
      {
        disease: 'Sigatoka Leaf Spot',
        fromDay: 120,
        toDay: 330,
        favours: { minHumidity: 85, minTempC: 25, maxTempC: 30, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Yellow streaks on the leaves that turn into brown spots with grey centres',
      },
    ],
  },
  bajra: {
    key: 'bajra',
    label: 'Bajra (Pearl millet)',
    moistureFloorByStage: { sowing: 36, vegetative: 32, flowering: 38, fruiting: 34, maturity: 24 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [34, 62], critical: [20, 78], unit: '%' },
      nitrogen: { ideal: [110, 210], critical: [70, 310], unit: 'ppm' },
    },
    targetNpk: { n: 160, p: 45, k: 100 },
    pestBaseTemp: 12,
    commonPests: ['Shoot Fly', 'Stem Borer', 'White Grub'],
    commonDiseases: ['Downy Mildew', 'Ergot', 'Blast'],
    typicalYieldQuintalPerAcre: 8,
    stageDays: { sowing: 0, vegetative: 20, flowering: 45, fruiting: 65, maturity: 85 },
    aliases: ['bajri', 'kambu', 'sajje', 'sajjalu', 'pearl millet', 'millet', 'pennisetum'],
    diseaseWindows: [
      {
        disease: 'Downy Mildew',
        fromDay: 10,
        toDay: 50,
        favours: { minHumidity: 85, minTempC: 20, maxTempC: 30, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Yellow streaks on leaves with white down underneath; ears turn into leafy green heads',
      },
      {
        disease: 'Ergot',
        fromDay: 45,
        toDay: 75,
        favours: { minHumidity: 80, minTempC: 20, maxTempC: 30, needsLeafWetness: true },
        alsoNeeds: 'Cloudy, drizzly weather while the crop is flowering',
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Sticky pink or honey-like drops oozing from the ears',
      },
    ],
  },
  ragi: {
    key: 'ragi',
    label: 'Ragi (Finger millet)',
    moistureFloorByStage: { sowing: 38, vegetative: 34, flowering: 40, fruiting: 36, maturity: 25 },
    bands: {
      ...COMMON_BANDS,
      soilMoisture: { ideal: [36, 64], critical: [22, 80], unit: '%' },
      nitrogen: { ideal: [100, 200], critical: [60, 300], unit: 'ppm' },
    },
    targetNpk: { n: 150, p: 45, k: 90 },
    pestBaseTemp: 11,
    commonPests: ['Pink Stem Borer', 'Aphid', 'Earhead Caterpillar'],
    commonDiseases: ['Blast', 'Brown Spot', 'Foot Rot'],
    typicalYieldQuintalPerAcre: 8,
    stageDays: { sowing: 0, vegetative: 25, flowering: 55, fruiting: 80, maturity: 110 },
    aliases: ['nachni', 'nagli', 'mandua', 'kezhvaragu', 'kelvaragu', 'ragulu', 'finger millet', 'eleusine'],
    diseaseWindows: [
      {
        disease: 'Blast',
        fromDay: 25,
        toDay: 95,
        favours: { minHumidity: 90, minTempC: 15, maxTempC: 26, needsLeafWetness: true },
        conditionsSource: 'estimated',
        timingSource: 'estimated',
        lookFor: 'Spindle-shaped grey spots on the leaves; the neck of the ear turns black and breaks',
      },
    ],
  },
};

/**
 * Every crop and disease window reads its farmer-facing text from the locale
 * files, so the same object speaks whichever language is active. The English
 * strings above stay as the reviewed source and the fallback; identity
 * (`key`, `disease`, pest names) stays English everywhere.
 */
for (const profile of Object.values(CROPS)) {
  const english = profile.label.toLowerCase();
  // The English name keeps working in search whatever the app language is.
  if (!profile.aliases.includes(english)) profile.aliases.push(english);
  const label = profile.label;
  Object.defineProperty(profile, 'label', {
    get: () => tr(`crops.${profile.key}`, { defaultValue: label }),
    enumerable: true,
  });
  for (const w of profile.diseaseWindows) {
    const base = `agro.${profile.key}.${slug(w.disease)}`;
    const look = w.lookFor;
    Object.defineProperty(w, 'lookFor', {
      get: () => tr(`${base}.lookFor`, { defaultValue: look }),
      enumerable: true,
    });
    if (w.alsoNeeds) {
      const also = w.alsoNeeds;
      Object.defineProperty(w, 'alsoNeeds', {
        get: () => tr(`${base}.alsoNeeds`, { defaultValue: also }),
        enumerable: true,
      });
    }
  }
}

export const DEFAULT_CROP = 'maize';

/**
 * Is this a crop we actually have agronomy for?
 *
 * `cropProfile` falls back to maize for anything unknown, which keeps every
 * caller simple but means an unlisted crop gets silently scored against maize's
 * moisture floors and NPK targets. That was survivable while the picker offered
 * seven fixed choices; with a search box a farmer will look for their crop, fail
 * to find it, and pick something. Anything that puts a threshold in front of a
 * farmer must check this first and say we do not have the crop yet instead.
 */
export function isKnownCrop(crop: string | undefined): boolean {
  if (!crop) return false;
  return Boolean(CROPS[crop.toLowerCase().trim()]);
}

export function cropProfile(crop: string | undefined): CropProfile {
  if (!crop) return CROPS[DEFAULT_CROP];
  const key = crop.toLowerCase().trim();
  return CROPS[key] ?? CROPS[DEFAULT_CROP];
}

/**
 * Crop search, matching the label, the key or any alias.
 *
 * Aliases carry local names in Latin script (dhan, gehu, kapas, tamatar, ganna,
 * moongphali, makka) because a farmer types the word they use, not ours.
 * Returns everything on an empty query, so the picker is a browsable list too.
 */
export function searchCrops(query: string): CropProfile[] {
  const q = query.trim().toLowerCase();
  const all = CROP_KEYS.map((k) => CROPS[k]);
  if (!q) return all;
  const exact = all.filter(
    (p) => p.label.toLowerCase() === q || p.key === q || p.aliases.includes(q)
  );
  const rest = all.filter(
    (p) =>
      !exact.includes(p) &&
      (p.label.toLowerCase().includes(q) ||
        p.key.includes(q) ||
        p.aliases.some((a) => a.includes(q)))
  );
  return [...exact, ...rest];
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
  get cropHealth() {
    return tr('domains.cropHealth');
  },
  get pest() {
    return tr('domains.pest');
  },
  get nutrient() {
    return tr('domains.nutrient');
  },
  get irrigation() {
    return tr('domains.irrigation');
  },
  get climate() {
    return tr('domains.climate');
  },
};

/** Biopesticide / input suggestions kept separate from logic for easy agronomist review. */
export const INPUT_SUGGESTIONS: Record<string, string> = {
  get pest() {
    return tr('inputs.pest');
  },
  get disease() {
    return tr('inputs.disease');
  },
  get nitrogen() {
    return tr('inputs.nitrogen');
  },
  get phosphorus() {
    return tr('inputs.phosphorus');
  },
  get potassium() {
    return tr('inputs.potassium');
  },
  get ph_low() {
    return tr('inputs.ph_low');
  },
  get ph_high() {
    return tr('inputs.ph_high');
  },
  get ec_high() {
    return tr('inputs.ec_high');
  },
};

/**
 * How each crop is spelled in the data.gov.in mandi feed ("Paddy(Dhan)(Common)",
 * "Arhar (Tur/Red Gram)(Whole)"...). Matched as lower-case substrings, never
 * against the translated crop label, so the price lookup works in every language.
 */
export const MARKET_MATCH: Record<string, string[]> = {
  rice: ['paddy', 'rice'],
  wheat: ['wheat'],
  maize: ['maize'],
  cotton: ['cotton', 'kapas'],
  tomato: ['tomato'],
  sugarcane: ['sugarcane'],
  groundnut: ['groundnut'],
  soybean: ['soyabean', 'soybean'],
  chickpea: ['bengal gram', 'kabuli chana'],
  tur: ['arhar', 'tur'],
  moong: ['green gram', 'moong'],
  mustard: ['mustard'],
  onion: ['onion'],
  potato: ['potato'],
  chilli: ['chilli', 'chillies'],
  banana: ['banana'],
  bajra: ['bajra', 'pearl millet'],
  ragi: ['ragi', 'finger millet'],
};

export function marketMatches(cropKey: string, commodity: string): boolean {
  const c = commodity.toLowerCase();
  return (MARKET_MATCH[cropKey] ?? [cropKey]).some((m) => c.includes(m));
}
