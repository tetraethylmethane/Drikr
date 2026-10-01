import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAssistant } from './VoiceAssistant';
import { colors, radii, spacing, typography } from '../../theme';

/**
 * One big button on Home: say what you want. It is the same assistant as the
 * mic on every screen (VoiceAssistant.tsx), just larger and labelled, so the
 * farmer learns where talking starts.
 */
export function VoiceCommand(_props: { go?: (screen: string, params?: object) => void }) {
  const { t } = useTranslation();
  const { listen, listening } = useAssistant();

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={listen}
        style={({ pressed }) => [s.btn, listening && s.btnOn, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={t('voiceNav.button')}
      >
        <Ionicons name={listening ? 'radio' : 'mic'} size={26} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{listening ? t('mitra.listening') : t('voiceNav.button')}</Text>
          <Text style={s.hint} numberOfLines={2}>
            {t('voiceNav.examples')}
          </Text>
        </View>
      </Pressable>
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
