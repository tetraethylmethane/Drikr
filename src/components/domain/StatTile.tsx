import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { METRICS, formatMetric, metricStatus, readMetric } from '../../config/metrics';
import { colors, radii, spacing, toneColors, typography } from '../../theme';
import { Plot, SensorMetric, SensorReading } from '../../types';
import { Sparkline } from '../charts';

/**
 * One sensor tile — the unit the Home screen's live grid is built from.
 * Value, unit, status chip and an optional sparkline, exactly as in the deck mockup.
 */
export function StatTile({
  metric,
  reading,
  plot,
  series,
  onPress,
  compact,
}: {
  metric: SensorMetric;
  reading: SensorReading;
  plot: Plot | null;
  series?: number[];
  onPress?: () => void;
  compact?: boolean;
}) {
  const meta = METRICS[metric];
  const value = readMetric(reading, metric);
  const status = metricStatus(metric, value, plot);
  const { fg, bg } = toneColors(status.tone);

  const body = (
    <View style={[s.tile, compact && s.tileCompact]}>
      <View style={s.topRow}>
        <View style={[s.iconWrap, { backgroundColor: bg }]}>
          <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={compact ? 13 : 15} color={fg} />
        </View>
        {series && series.length > 3 && !compact ? (
          <Sparkline values={series} width={50} height={20} color={fg} />
        ) : null}
      </View>

      <View style={s.valueRow}>
        <Text style={[compact ? s.valueCompact : s.value]} numberOfLines={1}>
          {formatMetric(metric, value)}
        </Text>
        {meta.unit ? <Text style={s.unit}>{meta.unit}</Text> : null}
      </View>

      <Text style={s.label} numberOfLines={1}>
        {meta.label}
      </Text>

      <View style={[s.chip, { backgroundColor: bg }]}>
        <Text style={[s.chipText, { color: fg }]}>{status.label}</Text>
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.8 }]}>
      {body}
    </Pressable>
  );
}

/** Compact inline metric used on the map's selected-area strip. */
export function MiniStat({
  metric,
  reading,
  plot,
}: {
  metric: SensorMetric;
  reading: SensorReading;
  plot: Plot | null;
}) {
  const meta = METRICS[metric];
  const value = readMetric(reading, metric);
  const status = metricStatus(metric, value, plot);
  const { fg } = toneColors(status.tone);

  return (
    <View style={s.mini}>
      <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={14} color={fg} />
      <Text style={s.miniValue}>
        {formatMetric(metric, value)}
        {meta.unit ? <Text style={s.miniUnit}>{meta.unit}</Text> : null}
      </Text>
      <Text style={s.miniLabel} numberOfLines={1}>
        {metric === 'pestActivity' ? status.label : meta.label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 104,
  },
  tileCompact: { minHeight: 78, padding: spacing.sm + 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.sm },
  value: { ...typography.metric, color: colors.text },
  valueCompact: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  unit: { ...typography.small, color: colors.textMuted, marginLeft: 2, marginBottom: 2.5 },
  label: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
  },
  chipText: { ...typography.tiny },
  mini: { flex: 1, alignItems: 'center', gap: 2 },
  miniValue: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  miniUnit: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  miniLabel: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint, textAlign: 'center' },
});
