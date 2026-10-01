import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import mr from './locales/mr.json';
import te from './locales/te.json';
import ta from './locales/ta.json';
import gu from './locales/gu.json';
import ur from './locales/ur.json';
import kn from './locales/kn.json';
import or_ from './locales/or.json';
import ml from './locales/ml.json';
import pa from './locales/pa.json';
import as_ from './locales/as.json';

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
    bn: { translation: bn },
    mr: { translation: mr },
    te: { translation: te },
    ta: { translation: ta },
    gu: { translation: gu },
    ur: { translation: ur },
    kn: { translation: kn },
    or: { translation: or_ },
    ml: { translation: ml },
    pa: { translation: pa },
    as: { translation: as_ },
  },
  lng: 'en',
  fallbackLng: 'en',
  compatibilityJSON: 'v3',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
