import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ta from './locales/ta.json';

// Configure i18next with compatibility JSON v3 format
// This suppresses the Intl.PluralRules warning on React Native
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
    },
    lng: 'en',
    fallbackLng: 'en',
    compatibilityJSON: 'v3', // Use v3 format for React Native compatibility
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

