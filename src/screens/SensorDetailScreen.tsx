import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { cropProfile } from '../config/agronomy';
import {
  CANOPY_METRICS,
  METRICS,
  NUTRIENT_METRICS,
  SOIL_METRICS,
  WEATHER_METRICS,
  formatMetric,
  metricSeries,
  metricStatus,
  readMetric,
} from '../config/metrics';
import { usePlotState } from '../hooks/useTelemetry';
import { useAppSelector } from '../store/hooks';
import { colors, spacing, toneColors, typography } from '../theme';
import { SensorMetric } from '../types';
import { AppHeader, Badge, Card, Pill, Screen, SectionTitle } from '../components/ui';
import { ChartLegend, TrendChart } from '../components/charts';
import { StatTile } from '../components/domain';

const GROUPS: Array<{ key: string; metrics: SensorMetric[] }> = [
  { key: 'soil', metrics: SOIL_METRICS },
  { key: 'nutrient', metrics: NUTRIENT_METRICS },
  { key: 'canopy', metrics: CANOPY_METRICS },
  { key: 'weather', metrics: WEATHER_METRICS },
];

/**
 * Every sensor reading, grouped, plus a trend for the selected metric and the
 * per-node breakdown. This is the screen for a farmer who wants to check the raw
 * numbers behind a recommendation rather than take it on trust.
 */
export default function SensorDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation();

  const { plot, snapshot, history } = usePlotState();
  const nodes = useAppSelector((s) => s.farm.nodes);
  const readings = useAppSelector((s) => s.telemetry.readings);

  const [focus, setFocus] = useState<SensorMetric>(route.params?.metric ?? 'soilMoisture');

  const width = Dimensions.get('window').width - spacing.lg * 4;

  const series = useMemo(
    () => [
      {
        label: METRICS[focus].label,
        unit: METRICS[focus].unit,
        values: metricSeries(history, focus),
        color: colors.brandLight,
      },
    ],
    [focus, history]
  );

  const xLabels = useMemo(() => {
    if (history.length < 2) return undefined;
    const fmt = (at: number) => new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric' });
    return [fmt(history[0].at), fmt(history[history.length - 1].at)];
  }, [history]);

  const threshold = useMemo(() => {
    if (!plot) return undefined;
    const crop = cropProfile(plot.crop);
    if (focus === 'soilMoisture') return crop.moistureFloorByStage[plot.stage];
    if (focus === 'nitrogen') return crop.targetNpk.n;
    if (focus === 'phosphorus') return crop.targetNpk.p;
    if (focus === 'potassium') return crop.targetNpk.k;
    return crop.bands[focus]?.ideal[1];
  }, [focus, plot]);

  const plotNodes = useMemo(() => nodes.filter((n) => n.plotId === plot?.id), [nodes, plot?.id]);

  if (!plot || !snapshot) {
    return (
      <Screen>
        <AppHeader title={t('sensors.title')} onBack={() => navigation.goBack()} />
        <Card>
          <Text style={s.muted}>{t('home.waitingForSensors')}</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppHeader
        title={t('sensors.title')}
        subtitle={`${plot.name} · ${new Date(snapshot.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
        onBack={() => navigation.goBack()}
      />

      {/* Trend for the focused metric */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
        {([...SOIL_METRICS, ...NUTRIENT_METRICS, 'pestActivity', 'voc'] as SensorMetric[]).map((m) => (
          <Pill key={m} label={METRICS[m].label} active={focus === m} onPress={() => setFocus(m)} />
        ))}
      </ScrollView>

      <Card>
        <View style={s.focusHeader}>
          <View>
            <Text style={s.focusValue}>
              {formatMetric(focus, readMetric(snapshot.reading, focus))}
              <Text style={s.focusUnit}> {METRICS[focus].unit}</Text>
            </Text>
            <Text style={s.focusLabel}>{METRICS[focus].label}</Text>
          </View>
          <Badge
            label={metricStatus(focus, readMetric(snapshot.reading, focus), plot).label}
            tone={metricStatus(focus, readMetric(snapshot.reading, focus), plot).tone}
          />
        </View>

        {series[0].values.length > 1 ? (
          <>
            <TrendChart
              series={series}
              width={width}
              xLabels={xLabels}
              threshold={threshold}
              thresholdLabel={t('sensors.target')}
            />
            <ChartLegend series={series} />
          </>
        ) : (
          <Text style={s.muted}>{t('sensors.collecting')}</Text>
        )}
      </Card>

      {/* Grouped readings */}
      {GROUPS.map((group) => (
        <React.Fragment key={group.key}>
          <SectionTitle title={t(`sensors.${group.key}`)} />
          <View style={s.grid}>
            {group.metrics.map((m) => (
              <View key={m} style={s.gridItem}>
                <StatTile
                  metric={m}
                  reading={snapshot.reading}
                  plot={plot}
                  series={metricSeries(history, m)}
                  onPress={() => setFocus(m)}
                />
              </View>
            ))}
          </View>
        </React.Fragment>
      ))}

      {/* Per-node values — the plot tiles are averages, this is the spread */}
      <SectionTitle title={t('sensors.perNode')} icon="hardware-chip" />
      <Card>
        <Text style={s.muted}>{t('sensors.perNodeHelp')}</Text>
        <View style={s.nodeTable}>
          <View style={s.nodeHeaderRow}>
            <Text style={[s.nodeCell, s.nodeHeaderCell, { flex: 1.4 }]}>{t('sensors.node')}</Text>
            <Text style={[s.nodeCell, s.nodeHeaderCell]}>{METRICS[focus].label}</Text>
            <Text style={[s.nodeCell, s.nodeHeaderCell]}>{t('nodes.battery')}</Text>
          </View>
          {plotNodes.map((node) => {
            const r = readings[node.id];
            const value = r ? readMetric(r, focus) : null;
            const status = value != null ? metricStatus(focus, value, plot) : null;
            return (
              <View key={node.id} style={s.nodeRow}>
                <Text style={[s.nodeCell, { flex: 1.4 }]}>
                  {node.label}
                  <Text style={s.nodeGrid}>
                    {'  '}
                    {node.gridRef.row + 1},{node.gridRef.col + 1}
                  </Text>
                </Text>
                <Text
                  style={[
                    s.nodeCell,
                    s.nodeValueCell,
                    status ? { color: toneColors(status.tone).fg } : null,
                  ]}
                >
                  {value != null ? formatMetric(focus, value) : '—'}
                </Text>
                <Text style={[s.nodeCell, s.nodeValueCell]}>{node.batteryPct}%</Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Biosensor, when a node has one */}
      {snapshot.reading.biosensorNa != null ? (
        <>
          <SectionTitle title={t('sensors.biosensor')} icon="flask" />
          <Card>
            <View style={s.focusHeader}>
              <View>
                <Text style={s.focusValue}>
                  {snapshot.reading.biosensorNa}
                  <Text style={s.focusUnit}> nA</Text>
                </Text>
                <Text style={s.focusLabel}>{t('sensors.pathogenCurrent')}</Text>
              </View>
              <Badge
                label={snapshot.reading.biosensorNa > 90 ? t('sensors.elevated') : t('sensors.baseline')}
                tone={snapshot.reading.biosensorNa > 90 ? 'danger' : 'ok'}
              />
            </View>
            <Text style={s.muted}>{t('sensors.biosensorHelp')}</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  muted: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  pillRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  focusValue: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
  focusUnit: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  focusLabel: { ...typography.small, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg - 4 },
  gridItem: { width: '50%', padding: 4 },
  nodeTable: { marginTop: spacing.md },
  nodeHeaderRow: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nodeRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  nodeCell: { flex: 1, ...typography.small, color: colors.text },
  nodeHeaderCell: { ...typography.tiny, color: colors.textMuted },
  nodeValueCell: { fontWeight: '700', textAlign: 'right' },
  nodeGrid: { ...typography.tiny, color: colors.textFaint },
});
