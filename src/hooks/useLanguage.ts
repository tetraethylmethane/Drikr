import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../store/slices/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { Language } from '../types';

/**
 * The only way to change language.
 *
 * i18next and Redux both need to know, and previously each switcher had to remember
 * to update both — so they could drift. This hook makes that impossible.
 */
export function useLanguage() {
  const dispatch = useAppDispatch();
  const { i18n } = useTranslation();
  const language = useAppSelector((s) => s.settings.language);

  const change = useCallback(
    (next: Language) => {
      void i18n.changeLanguage(next);
      dispatch(setLanguage(next));
    },
    [dispatch, i18n]
  );

  return { language, change };
}

export const LANGUAGES: Array<{ code: Language; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
];

/** BCP-47 tags for speech recognition and text-to-speech. */
export const SPEECH_LOCALE: Record<Language, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
};
