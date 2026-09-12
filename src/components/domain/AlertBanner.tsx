import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, StatusTone, toneColors, typography } from '../../theme';
import { Alert, RiskDomain, Severity } from '../../types';

/** Domain -> icon, shared by the banner, the alert list and the alert detail screen. */
export const DOMAIN_ICON: Record<RiskDomain, keyof typeof Ionicons.glyphMap> = {
  pest: 'bug',
  cropHealth: 'leaf',
  nutrient: 'nutrition',
  irrigation: 'water',
  climate: 'thunderstorm',
};

export function severityTone(severity: Severity): StatusTone {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'danger';
    case 'medium':
      return 'warn';
    case 'low':
      return 'info';
    default:
      return 'neutral';
  }
}

/**
 * The red alert strip at the top of Home.
 *
 * Deliberately the first thing on the screen and the largest tap target: the deck's
 * whole premise is catching a problem before it spreads, which only works if the
 * warning is impossible to miss.
 */
export function AlertBanner({ alert, onPress }: { alert: Alert; onPress?: () => void }) {
  const tone = severityTone(alert.severity);
  const { fg, bg } = toneColors(tone);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.banner,
        { backgroundColor: bg, borderColor: fg + '40' },
        pressed && { opacity: 0.88 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.title}. ${alert.detail}`}
    >
      <View style={[s.iconWrap, { backgroundColor: fg }]}>
        <Ionicons name={DOMAIN_ICON[alert.domain]} size={17} color="#fff" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.title, { color: fg }]} numberOfLines={1}>
          {alert.title}
        </Text>
        <Text style={s.detail} numberOfLines={2}>
          {alert.detail}
        </Text>
        <View style={s.metaRow}>
          <Text style={s.meta}>
            {alert.plotName}
            {alert.gridRef ? ` · Grid ${alert.gridRef.row + 1},${alert.gridRef.col + 1}` : ''}
          </Text>
          <Text style={[s.meta, { color: fg }]}>{Math.round(alert.confidence * 100)}% confidence</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={fg} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.bodyStrong },
  detail: { ...typography.small, color: colors.text, marginTop: 2, lineHeight: 17 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, gap: spacing.sm },
  meta: { ...typography.tiny, color: colors.textMuted },
});
