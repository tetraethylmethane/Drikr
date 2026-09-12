import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';

/**
 * i18n setup.
 *
 * `compatibilityJSON: 'v3'` is required: React Native's Hermes engine ships without
 * full `Intl.PluralRules`, and without this i18next warns and mishandles plurals.
 *
 * The active language is owned by the settings slice and restored in App.tsx before
 * the first render — change it through `useLanguage`, never by calling
 * `i18n.changeLanguage` directly, or Redux and i18next will drift apart.
 */
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    ta: { translation: ta },
  },
  lng: 'en',
  fallbackLng: 'en',
  compatibilityJSON: 'v3',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
