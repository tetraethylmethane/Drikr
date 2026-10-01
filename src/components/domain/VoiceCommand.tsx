import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useVoice } from '../../hooks/useVoice';
import { useLanguage } from '../../hooks/useLanguage';
import { routeForSpeech } from '../../services/voiceRoutes';
import { colors, radii, spacing, typography } from '../../theme';

/**
 * One big button: say what you want. For a farmer who cannot read the screen,
 * this is the whole app - "मौसम", "मंडी भाव", "drone" open the screen, and
 * anything else is asked to Kisan Mitra, which answers out loud.
 */
export function VoiceCommand({ go }: { go: (screen: string, params?: object) => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { listening, partial, error, sttAvailable, startListening, stopListening } = useVoice({
    language,
    onResult: (text) => {
      const screen = routeForSpeech(text);
      if (screen) go(screen);
      else go('KisanMitra', { question: text });
    },
  });

  if (!sttAvailable) return null;

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={() => void (listening ? stopListening() : startListening())}
        style={({ pressed }) => [s.btn, listening && s.btnOn, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={t('voiceNav.button')}
      >
        <Ionicons name={listening ? 'radio' : 'mic'} size={26} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{listening ? t('mitra.listening') : t('voiceNav.button')}</Text>
          <Text style={s.hint} numberOfLines={2}>
            {listening ? partial || t('voiceNav.examples') : t('voiceNav.examples')}
          </Text>
        </View>
      </Pressable>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  btnOn: { backgroundColor: colors.danger },
  title: { ...typography.bodyStrong, color: '#fff', fontSize: 16 },
  hint: { ...typography.tiny, color: '#FFFFFFCC', marginTop: 2, lineHeight: 15 },
  error: { ...typography.tiny, color: colors.warn, marginTop: 6 },
});
