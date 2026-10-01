import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n/languages';
import { useLanguage } from '../../hooks/useLanguage';
import { colors, radii, spacing, typography } from '../../theme';

/**
 * Every language as a tile: its own script big, the English name small, so a
 * farmer finds theirs without reading English.
 */
export function LanguageGrid({ onPicked }: { onPicked?: () => void }) {
  const { language, change } = useLanguage();
  return (
    <View style={s.grid}>
      {LANGUAGES.map((l) => {
        const active = language === l.code;
        return (
          <Pressable
            key={l.code}
            onPress={() => {
              change(l.code);
              onPicked?.();
            }}
            style={({ pressed }) => [s.item, active && s.itemActive, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={l.label}
          >
            <Text style={[s.native, active && { color: '#fff' }]}>{l.native}</Text>
            <Text style={[s.label, active && { color: '#FFFFFFBB' }]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The grid in a bottom sheet, opened from the globe button. */
export function LanguagePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View style={s.sheet}>
        <View style={s.head}>
          <Ionicons name="globe-outline" size={18} color={colors.brand} />
          <Text style={s.title}>{t('profile.language')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('common.cancel')}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
          <LanguageGrid onPicked={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

/** The globe button that shows the current language and opens the picker. */
export function LanguageButton({ style }: { style?: object }) {
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Pressable
        style={({ pressed }) => [s.btn, style, pressed && { opacity: 0.85 }]}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('profile.language')}
      >
        <Ionicons name="globe-outline" size={14} color={colors.brand} />
        <Text style={s.btnText}>{LANGUAGES.find((l) => l.code === language)?.native}</Text>
        <Ionicons name="chevron-down" size={12} color={colors.brand} />
      </Pressable>
      <LanguagePicker visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  item: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  itemActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  native: { ...typography.bodyStrong, color: colors.text },
  label: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: '#00000066' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnText: { ...typography.small, color: colors.brand, fontWeight: '700' },
});
