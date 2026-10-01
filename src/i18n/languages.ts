import { Language } from '../types';

/**
 * The languages the app speaks, in the order the picker shows them (English and
 * Hindi first, then by number of speakers).
 *
 * Kept free of React and Redux so services (the assistant, photo check) can
 * import it without pulling in the store.
 */
export const LANGUAGES: Array<{ code: Language; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া' },
];

/** BCP-47 tags for speech recognition and text-to-speech. */
export const SPEECH_LOCALE: Record<Language, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  gu: 'gu-IN',
  ur: 'ur-IN',
  kn: 'kn-IN',
  or: 'or-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  as: 'as-IN',
};

/** How the cloud model is told which language and script to answer in. */
export const MODEL_LANGUAGE: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  bn: 'Bengali (Bengali script)',
  mr: 'Marathi (Devanagari script)',
  te: 'Telugu (Telugu script)',
  ta: 'Tamil (Tamil script)',
  gu: 'Gujarati (Gujarati script)',
  ur: 'Urdu (Nastaliq / Perso-Arabic script)',
  kn: 'Kannada (Kannada script)',
  or: 'Odia (Odia script)',
  ml: 'Malayalam (Malayalam script)',
  pa: 'Punjabi (Gurmukhi script)',
  as: 'Assamese (Assamese script)',
};
