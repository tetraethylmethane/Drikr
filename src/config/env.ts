import Constants from 'expo-constants';

/**
 * Single accessor for runtime config.
 *
 * `Constants.manifest` is null on SDK 54 — values injected by app.config.js land on
 * `Constants.expoConfig.extra`. Reading it in one place keeps that mistake from
 * spreading back into screens.
 *
 * Precedence: expoConfig.extra (from .env via app.config.js) -> EXPO_PUBLIC_* inlined
 * at build time -> empty string.
 */
const extra: Record<string, string | undefined> =
  ((Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra) as Record<
    string,
    string | undefined
  >) ?? {};

function read(key: string, publicFallback?: string): string {
  const v = extra[key];
  if (typeof v === 'string' && v.length > 0) return v;
  if (publicFallback && publicFallback.length > 0) return publicFallback;
  return '';
}

export const env = {
  geminiApiKey: read('GEMINI_API_KEY', process.env.EXPO_PUBLIC_GEMINI_API_KEY),
  /** turbodrone bridge, e.g. http://192.168.1.50:8000 */
  droneLinkUrl: read('DRONE_LINK_URL', process.env.EXPO_PUBLIC_DRONE_LINK_URL),
  openaiApiKey: read('OPENAI_API_KEY', process.env.EXPO_PUBLIC_OPENAI_API_KEY),
  /** data.gov.in key. The published demo key ships as a fallback so market data works out of the box. */
  dataGovApiKey: read(
    'DATA_GOV_API_KEY',
    process.env.EXPO_PUBLIC_DATA_GOV_API_KEY ||
      '579b464db66ec23bdd000001e19e51f7932a45cd5b94455207ab83ea'
  ),
  /** Mandi price dataset ("Current Daily Price of Various Commodities"). */
  dataGovResourceId: read(
    'DATA_GOV_RESOURCE_ID',
    process.env.EXPO_PUBLIC_DATA_GOV_RESOURCE_ID || '9ef84268-d588-465a-a308-a864a43d0070'
  ),
  /** Optional Drikr telemetry/ML backend. Empty means run on simulated telemetry. */
  apiBaseUrl: read('API_BASE_URL', process.env.EXPO_PUBLIC_API_BASE_URL),
  /**
   * Telemetry relay (functions/index.js). Where collected readings are uploaded.
   *
   * Empty means the courier still collects and queues, but never drains — which
   * is a legitimate state, not a broken one: the readings are safe on the phone
   * and will upload whenever a relay is configured. The alternative, dropping
   * them, would lose field data for no reason.
   */
  ingestUrl: read('INGEST_URL', process.env.EXPO_PUBLIC_INGEST_URL),
  ingestKey: read('INGEST_KEY', process.env.EXPO_PUBLIC_INGEST_KEY),
  /**
   * Firebase web config. Previously hardcoded in src/config/firebase.ts, which
   * meant the keys were committed and the project could not be swapped without a
   * code change.
   */
  firebase: {
    apiKey: read('FIREBASE_API_KEY', process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: read('FIREBASE_AUTH_DOMAIN', process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: read('FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: read('FIREBASE_STORAGE_BUCKET', process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: read(
      'FIREBASE_MESSAGING_SENDER_ID',
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    ),
    appId: read('FIREBASE_APP_ID', process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
    measurementId: read('FIREBASE_MEASUREMENT_ID', process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID),
  },
};

/** True when a Firebase project is configured. Without it, auth uses the local PIN only. */
export const hasFirebase = (): boolean =>
  Boolean(env.firebase.apiKey && env.firebase.projectId);

/** True when collected readings have somewhere to upload to. */
export const hasIngest = (): boolean => Boolean(env.ingestUrl && env.ingestKey);

/** True when a cloud LLM is configured for Kisan Mitra; otherwise the offline engine answers. */
export const hasCloudAi = (): boolean => Boolean(env.geminiApiKey || env.openaiApiKey);

/**
 * Is a turbodrone bridge configured?
 *
 * The bridge runs on a laptop joined to the drone's own WiFi access point and
 * exposes the decoded Lewei HY protocol over HTTP. The phone has to be on that
 * same access point, so this is a LAN address and never a public one.
 */
export const hasDroneLink = (): boolean => Boolean(env.droneLinkUrl);

/**
 * Photo diagnosis needs a multimodal model, which is Gemini here. An OpenAI key
 * alone satisfies hasCloudAi() for the chat assistant but cannot classify an
 * image through this path, so the scouting screen asks this instead.
 */
export const hasVisionAi = (): boolean => Boolean(env.geminiApiKey);

/** True when a real telemetry backend is configured; otherwise the simulator drives the UI. */
export const hasTelemetryBackend = (): boolean => Boolean(env.apiBaseUrl);

export default env;
