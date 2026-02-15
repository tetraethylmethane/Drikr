// Loads environment variables from .env and injects into Expo config `extra`.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

module.exports = ({ config }) => {
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    },
  };
};
