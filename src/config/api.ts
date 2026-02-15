// API Base URL - Update this with your Flask backend URL
export const API_BASE_URL = __DEV__
  ? "http://192.168.29.15:5000" // Your local IP for development
  : "https://your-production-url.com";

export const API_ENDPOINTS = {
  // Crop Recommendation
  CROP_RECOMMEND: "/crop/recommend",

  // Disease Detection
  DISEASE_DETECT: "/disease/detect",

  // Pest Detection
  PEST_DETECT: "/pest/detect",

  // Market Prices
  MARKET_PRICES: "/market/prices",

  // Profit & Loss Analysis
  PROFIT_LOSS: "/finance/analyze",

  // Voice Processing
  VOICE_PROCESS: "/voice/process",

  // Translation
  TRANSLATE: "/translate",

  // Weather
  WEATHER: "/weather",
};
