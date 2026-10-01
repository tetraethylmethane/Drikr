import React, { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/i18n';
import { LANGUAGES, SPEECH_LOCALE } from '../i18n/languages';
import { useLanguage } from '../hooks/useLanguage';
import { setLanguageChosen } from '../store/slices/settingsSlice';
import { useAppDispatch } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { Button, Screen } from '../components/ui';
import { Language } from '../types';

/**
 * The very first screen: pick your language.
 *
 * Nothing else comes before it, because every later screen is unreadable in
 * the wrong language. Each tile greets the farmer aloud in that language, so
 * someone who cannot read any script can still find theirs by ear. Opened
 * again later (from the voice assistant or Profile) it changes the language
 * and goes back.
 */
export default function WelcomeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language, change } = useLanguage();
  const changingOnly = Boolean(route.params?.change);

  const greet = (code: Language) => {
    const hello = i18n.getFixedT(code)('welcome.hello');
    Speech.stop();
    Speech.speak(hello, { language: SPEECH_LOCALE[code], rate: 0.92 });
  };

  // Say the prompt once in every language's own words would be noise; the
  // current one is enough, and English-speaking helpers can read it.
  useEffect(() => () => void Speech.stop(), []);

  const pick = (code: Language) => {
    change(code);
    greet(code);
  };

  const done = () => {
    Speech.stop();
    dispatch(setLanguageChosen(true));
    if (changingOnly && navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.head}>
          <Image source={require('../../assets/icon.png')} style={s.logo} resizeMode="contain" />
          <Ionicons name="globe-outline" size={30} color={colors.brand} style={{ marginTop: spacing.lg }} />
          <Text style={s.title}>{t('welcome.choose')}</Text>
          <Text style={s.sub}>{t('welcome.chooseHint')}</Text>
        </View>

        <View style={s.grid}>
          {LANGUAGES.map((l) => {
            const active = language === l.code;
            return (
              <Pressable
                key={l.code}
                onPress={() => pick(l.code)}
                style={({ pressed }) => [s.tile, active && s.tileOn, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={l.label}
              >
                <Text style={[s.native, active && { color: '#fff' }]}>{l.native}</Text>
                <Text style={[s.label, active && { color: '#FFFFFFCC' }]}>{l.label}</Text>
                {active ? <Ionicons name="volume-high" size={14} color="#fff" style={s.speaker} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Button title={t('welcome.continue')} icon="arrow-forward" size="lg" onPress={done} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  head: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg },
  logo: { width: 52, height: 52 },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  sub: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48%',
    flexGrow: 1,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  native: { fontSize: 22, fontWeight: '800', color: colors.text },
  label: { ...typography.tiny, color: colors.textMuted, marginTop: 4 },
  speaker: { position: 'absolute', top: 8, right: 10 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.bg },
});
