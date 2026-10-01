import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ensureSignedIn } from '../../config/firebase';
import { watchMySensorKit } from '../../services/sync';
import { useAppSelector } from '../../store/hooks';
import { colors, radii, spacing, typography } from '../../theme';
import { SensorKitRequest } from '../../types';

/**
 * Whatever the farmer skipped in setup, offered again on Home until done:
 * add a field, get the free sensors, family SMS, and the photo-sharing
 * question. Each row is one tap to the screen that finishes it. The card
 * disappears by itself once nothing is left.
 */
export function GettingStarted({ go }: { go: (screen: string, params?: object) => void }) {
  const { t } = useTranslation();
  const { plots, usingDemoFarm } = useAppSelector((s) => s.farm);
  const sms = useAppSelector((s) => s.settings.smsNumbers ?? []);
  const sharePhotos = useAppSelector((s) => s.settings.sharePhotos);
  const [kit, setKit] = useState<SensorKitRequest | null | undefined>(undefined);

  useEffect(() => {
    let stop = () => {};
    void ensureSignedIn().then(() => {
      stop = watchMySensorKit(setKit);
    });
    return () => stop();
  }, []);

  const items: { icon: keyof typeof Ionicons.glyphMap; label: string; screen: string }[] = [];
  if (usingDemoFarm || plots.length === 0) items.push({ icon: 'map', label: t('start.field'), screen: 'FieldSetup' });
  // `undefined` = not loaded yet (offline): do not nag about the kit then.
  if (kit === null || kit?.status === 'cancelled') items.push({ icon: 'gift', label: t('start.kit'), screen: 'SensorKit' });
  if (!sms.length) items.push({ icon: 'chatbubble-ellipses', label: t('start.sms'), screen: 'ProfileTab' });
  if (sharePhotos === undefined) items.push({ icon: 'images', label: t('start.photos'), screen: 'Privacy' });
  if (!items.length) return null;

  return (
    <View style={s.card}>
      <Text style={s.title}>{t('start.title')}</Text>
      {items.map((it) => (
        <Pressable key={it.screen} onPress={() => go(it.screen)} style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
          <Ionicons name={it.icon} size={20} color={colors.brand} />
          <Text style={s.label}>{it.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.brand + '33',
    backgroundColor: colors.brand + '0D',
  },
  title: { ...typography.bodyStrong, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  label: { ...typography.body, color: colors.text, flex: 1 },
});
