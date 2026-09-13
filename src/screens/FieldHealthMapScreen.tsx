import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cropProfile } from '../config/agronomy';
import { NUTRIENT_METRICS, SOIL_METRICS } from '../config/metrics';
import { cellAt, riskCells } from '../services/healthMap';
import { cellHealthIndex } from '../services/decisionEngine';
import { proposeMission } from '../services/drone';
import { usePlotState } from '../hooks/useTelemetry';
import { useLanguage } from '../hooks/useLanguage';
import { useVoice } from '../hooks/useVoice';
import { confirmMission, proposeMissionAction } from '../store/slices/droneSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, healthColor, radii, spacing, toneColors, typography } from '../theme';
import { GridRef } from '../types';
import { AppHeader, Badge, Button, Card, LiveDot, Screen, SectionTitle } from '../components/ui';
import {
  DroneMissionCard,
  FieldHealthCanvas,
  HealthLegend,
  MiniStat,
  RecommendationList,
  riskTone,
} from '../components/domain';

/**
 * Field Health Map — the deck's second mockup.
 *
 * The map is the whole point of the sensor network: four nodes become a picture of
 * where the problem actually is, so treatment can be targeted instead of blanket.
 * Selecting a cell shows its interpolated readings and the AI recommendation for
 * that specific area, then "Confirm Schedule" turns it into a drone mission.
 */
export default function FieldHealthMapScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { speak } = useVoice({ language });

  const { plot, snapshot, map, assessment, forecast } = usePlotState();
  const nodes = useAppSelector((s) => s.farm.nodes);
  const missions = useAppSelector((s) => s.drone.missions);

  const [selected, setSelected] = useState<GridRef | null>(null);

  // Start on the worst cell — that is what the farmer came to see.
  useEffect(() => {
    if (!selected && map?.worst) setSelected(map.worst.gridRef);
  }, [map?.worst, selected]);

  const plotNodes = useMemo(() => nodes.filter((n) => n.plotId === plot?.id), [nodes, plot?.id]);
  const cell = useMemo(() => cellAt(map, selected ?? { row: 0, col: 0 }), [map, selected]);
  const affected = useMemo(() => riskCells(map, 55), [map]);

  const existingMission = useMemo(
    () =>
      missions.find(
        (m) =>
          m.plotId === plot?.id &&
          m.type === 'spray' &&
          (m.status === 'proposed' || m.status === 'scheduled' || m.status === 'in_flight' || m.status === 'blocked')
      ) ?? null,
    [missions, plot?.id]
  );

  const size = Math.min(Dimensions.get('window').width - spacing.lg * 2 - 2, 360);

  if (!plot) {
    return (
      <Screen>
        <AppHeader title={t('map.title')} onBack={() => navigation.goBack()} />
        <Card>
          <Text style={s.muted}>{t('map.noPlot')}</Text>
        </Card>
      </Screen>
    );
  }

  const crop = cropProfile(plot.crop);
  const cellScore = cell ? cellHealthIndex(plot, cell.reading) : null;

  const handleSchedule = () => {
    if (!snapshot) return;
    if (existingMission) {
      if (existingMission.status === 'proposed') dispatch(confirmMission(existingMission.id));
      navigation.navigate('Drone');
      return;
    }
    const mission = proposeMission({
      plot,
      type: 'spray',
      map,
      reading: snapshot.reading,
      forecast,
    });
    dispatch(proposeMissionAction(mission));
    navigation.navigate('Drone');
  };

  const asOf = map
    ? new Date(map.at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

  return (
    <Screen scroll>
      <AppHeader
        title={t('map.title')}
        subtitle={`${plot.name} · ${asOf}`}
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            onPress={() => navigation.navigate('SensorNodes')}
            hitSlop={10}
            accessibilityLabel={t('map.nodes')}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>
        }
      />

      {/* Map */}
      <Card>
        <FieldHealthCanvas
          plot={plot}
          map={map}
          nodes={plotNodes}
          size={size}
          selected={selected}
          onSelectCell={setSelected}
        />
        <HealthLegend meanHealth={map?.meanHealth} />

        <View style={s.mapMeta}>
          <View style={s.mapMetaItem}>
            <View style={[s.dot, { backgroundColor: colors.brandDark }]} />
            <Text style={s.mapMetaText}>
              {plotNodes.filter((n) => n.status === 'online').length}/{plotNodes.length} {t('map.sensorNodes')}
            </Text>
          </View>
          <View style={s.mapMetaItem}>
            <View style={[s.dot, { backgroundColor: colors.danger }]} />
            <Text style={s.mapMetaText}>
              {affected.length} / {map?.cells.length ?? 0} {t('map.cellsAtRisk')}
            </Text>
          </View>
          <Text style={s.mapMetaHint}>{t('map.tapHint')}</Text>
        </View>
      </Card>

      {/* Selected area */}
      {cell && cellScore ? (
        <>
          <View style={s.selectedHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.selectedTitle}>
                {t('map.selectedArea')} (Grid {cell.gridRef.row + 1},{cell.gridRef.col + 1})
              </Text>
              <Text style={s.selectedMeta}>
                {t('home.lastUpdated')}:{' '}
                {new Date(cell.reading.at).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {' · '}
                {t('map.interpolated')}
              </Text>
            </View>
            <LiveDot at={cell?.reading.at ?? map?.at ?? null} />
          </View>

          <Card>
            <View style={s.cellTop}>
              <View
                style={[s.cellSwatch, { backgroundColor: healthColor(cellScore.healthIndex) }]}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.cellIndex}>{cellScore.healthIndex}/100</Text>
                <Text style={s.cellIndexLabel}>{t('home.healthIndex')}</Text>
              </View>
              <Badge
                label={
                  cellScore.risk === 'high'
                    ? t('map.highRisk')
                    : cellScore.risk === 'moderate'
                      ? t('map.moderate')
                      : t('map.healthy')
                }
                tone={riskTone(cellScore.risk)}
              />
            </View>

            {/* Four headline values, as in the mockup's selected-area strip */}
            <View style={s.miniRow}>
              <MiniStat metric="airTemp" reading={cell.reading} plot={plot} />
              <MiniStat metric="soilMoisture" reading={cell.reading} plot={plot} />
              <MiniStat metric="nitrogen" reading={cell.reading} plot={plot} />
              <MiniStat metric="pestActivity" reading={cell.reading} plot={plot} />
            </View>

            <View style={s.detailGrid}>
              {[...SOIL_METRICS, ...NUTRIENT_METRICS].map((m) => (
                <View key={m} style={s.detailItem}>
                  <MiniStat metric={m} reading={cell.reading} plot={plot} />
                </View>
              ))}
            </View>
          </Card>

          {/* AI recommendation for this area */}
          <SectionTitle title={t('map.aiRecommendation')} icon="sparkles" />
          <Card>
            {assessment && assessment.recommendations.length > 0 ? (
              <RecommendationList
                recommendations={assessment.recommendations.filter((r) => r.droneEligible).slice(0, 2)}
                onSpeak={speak}
              />
            ) : null}
            {assessment && assessment.recommendations.filter((r) => r.droneEligible).length === 0 ? (
              <Text style={s.muted}>{t('map.noDroneAction')}</Text>
            ) : null}

            <View style={s.sprayPlan}>
              <Text style={s.sprayPlanTitle}>{t('map.sprayPlan')}</Text>
              <View style={s.sprayPlanRow}>
                <PlanStat
                  label={t('map.targetArea')}
                  value={`${Math.round(((affected.length || 1) / (map?.cells.length || 1)) * plot.areaAcres * 100) / 100} ac`}
                />
                <PlanStat
                  label={t('map.ofPlot')}
                  value={`${Math.round(((affected.length || 0) / (map?.cells.length || 1)) * 100)}%`}
                />
                <PlanStat
                  label={t('map.chemicalSaved')}
                  value={`${Math.max(0, 100 - Math.round(((affected.length || 0) / (map?.cells.length || 1)) * 100))}%`}
                  tone="ok"
                />
              </View>
            </View>

            {existingMission ? (
              <View style={{ marginTop: spacing.md }}>
                <DroneMissionCard
                  mission={existingMission}
                  plot={plot}
                  compact
                  onConfirm={
                    existingMission.status === 'proposed'
                      ? () => dispatch(confirmMission(existingMission.id))
                      : undefined
                  }
                />
              </View>
            ) : (
              <Button
                title={t('map.confirmSchedule')}
                icon="paper-plane"
                onPress={handleSchedule}
                style={{ marginTop: spacing.lg }}
                size="lg"
              />
            )}
          </Card>
        </>
      ) : null}

      {/* Field summary */}
      <SectionTitle title={t('map.fieldSummary')} icon="information-circle" />
      <Card>
        <SummaryRow label={t('fields.crop')} value={`${crop.label} · ${plot.stage}`} />
        <SummaryRow label={t('fields.area')} value={`${plot.areaAcres} acre`} />
        <SummaryRow label={t('fields.soil')} value={plot.soilType} />
        <SummaryRow label={t('fields.irrigation')} value={plot.irrigationType} />
        <SummaryRow
          label={t('map.gridResolution')}
          value={`${plot.grid.rows} × ${plot.grid.cols} (${plot.grid.rows * plot.grid.cols} ${t('map.cells')})`}
        />
      </Card>
    </Screen>
  );
}

function PlanStat({ label, value, tone }: { label: string; value: string; tone?: 'ok' }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.planValue, tone ? { color: toneColors(tone).fg } : null]}>{value}</Text>
      <Text style={s.planLabel}>{label}</Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  muted: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  mapMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mapMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  mapMetaText: { ...typography.tiny, color: colors.textMuted },
  mapMetaHint: { ...typography.tiny, color: colors.textFaint, fontStyle: 'italic', flex: 1, textAlign: 'right' },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  selectedTitle: { ...typography.h3, color: colors.text },
  selectedMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  cellTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cellSwatch: { width: 38, height: 38, borderRadius: radii.sm },
  cellIndex: { ...typography.h2, color: colors.text },
  cellIndexLabel: { ...typography.tiny, color: colors.textMuted },
  miniRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailItem: { width: '25%', paddingVertical: spacing.sm },
  sprayPlan: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
  },
  sprayPlanTitle: { ...typography.tiny, color: colors.textMuted, marginBottom: spacing.sm },
  sprayPlanRow: { flexDirection: 'row' },
  planValue: { ...typography.bodyStrong, color: colors.text },
  planLabel: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint, marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  summaryLabel: { ...typography.small, color: colors.textMuted },
  summaryValue: { ...typography.bodyStrong, color: colors.text, textTransform: 'capitalize' },
});
