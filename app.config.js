// Loads environment variables from .env and injects them into the Expo config's
// `extra`, which is where src/config/env.ts reads them from at runtime.
//
// Every key listed in RUNTIME_ENV_KEYS must appear here, or a value set in .env is
// silently ignored: src/config/env.ts reads Constants.expoConfig.extra, so a variable
// that is never injected simply never arrives. This list is the contract between
// .env and env.ts — add to both or neither.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/** Keys read by src/config/env.ts. Keep in sync with .env.example. */
const RUNTIME_ENV_KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'DATA_GOV_API_KEY',
  'DATA_GOV_RESOURCE_ID',
  'API_BASE_URL',
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_MEASUREMENT_ID',
];

module.exports = ({ config }) => {
  const extra = { ...(config.extra || {}) };

  for (const key of RUNTIME_ENV_KEYS) {
    // Accept either the bare name or an EXPO_PUBLIC_ prefixed one, since EAS Build
    // and CI often set the prefixed form.
    extra[key] = process.env[key] || process.env[`EXPO_PUBLIC_${key}`] || '';
  }

  return { ...config, extra };
};
