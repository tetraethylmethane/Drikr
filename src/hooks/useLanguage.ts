import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../store/slices/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { I18nManager } from 'react-native';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language } from '../types';

/** Languages written right to left. */
export const RTL_LANGUAGES: Language[] = ['ur'];

/**
 * Urdu reads right to left, so the whole layout should mirror: back arrows,
 * rows, alignment. React Native only applies a direction change on a fresh
 * start, so the app restarts itself once - after the language choice has been
 * saved (the store writes to disk on a short debounce).
 */
export function applyDirection(language: Language): void {
  const rtl = RTL_LANGUAGES.includes(language);
  if (I18nManager.isRTL === rtl) return;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  // Never loop: if the platform ignores the direction change, one restart is
  // tried and then the app simply carries on left to right.
  void AsyncStorage.getItem(RELOAD_KEY).then((last) => {
    if (last && Date.now() - Number(last) < 10 * 60_000) return;
    void AsyncStorage.setItem(RELOAD_KEY, String(Date.now()));
    setTimeout(() => {
      void Updates.reloadAsync().catch(() => undefined);
    }, 1500);
  });
}

const RELOAD_KEY = 'drikr:rtl-reload-at';

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
      applyDirection(next);
    },
    [dispatch, i18n]
  );

  return { language, change };
}

export { LANGUAGES, SPEECH_LOCALE } from '../i18n/languages';
