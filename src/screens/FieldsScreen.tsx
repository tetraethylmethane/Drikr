import React, { useMemo } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cropProfile } from '../config/agronomy';
import { daysAfterSowing } from '../services/decisionEngine';
import { activeAlerts } from '../services/alertEngine';
import { selectPlot } from '../store/slices/farmSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, healthColor, radii, spacing, spacing as sp, typography } from '../theme';
import { Plot } from '../types';
import { AppHeader, Badge, Button, Card, EmptyState, Screen } from '../components/ui';
import { FieldHealthCanvas, riskTone } from '../components/domain';

/**
 * All fields at a glance.
 *
 * Each card carries a live thumbnail of that plot's health map, so a farmer with
 * several plots can see at once which one needs them — the alternative, a list of
 * names and numbers, makes you open each to find out.
 */
export default function FieldsScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const { plots, nodes, selectedPlotId, usingDemoFarm } = useAppSelector((s) => s.farm);
  const { snapshots, maps } = useAppSelector((s) => s.telemetry);
  const alerts = useAppSelector((s) => s.alerts.items);

  const alertsByPlot = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of activeAlerts(alerts)) out[a.plotId] = (out[a.plotId] ?? 0) + 1;
    return out;
  }, [alerts]);

  const thumbSize = Math.min((Dimensions.get('window').width - spacing.lg * 4) * 0.34, 110);

  const open = (plot: Plot) => {
    dispatch(selectPlot(plot.id));
    navigation.navigate('FieldHealthMap');
  };

  return (
    <Screen>
      <AppHeader
        title={t('fields.title')}
        subtitle={t('fields.subtitle', { count: plots.length })}
        right={
          <Button
            title={t('fields.add')}
            icon="add"
            size="sm"
            variant="secondary"
            onPress={() => navigation.navigate('FieldSetup')}
          />
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }} showsVerticalScrollIndicator={false}>
        {usingDemoFarm ? (
          <Card tone="info" style={s.demoCard}>
            <View style={s.demoRow}>
              <Ionicons name="information-circle" size={18} color={colors.info} />
              <Text style={s.demoText}>{t('fields.demoNotice')}</Text>
            </View>
            <Button
              title={t('fields.addMine')}
              size="sm"
              variant="secondary"
              onPress={() => navigation.navigate('FieldSetup')}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        ) : null}

        {plots.length === 0 ? (
          <EmptyState
            icon="map-outline"
            title={t('fields.emptyTitle')}
            body={t('fields.emptyBody')}
            action={t('fields.add')}
            onAction={() => navigation.navigate('FieldSetup')}
          />
        ) : null}

        {plots.map((plot) => {
          const snap = snapshots[plot.id];
          const map = maps[plot.id] ?? null;
          const plotNodes = nodes.filter((n) => n.plotId === plot.id);
          const crop = cropProfile(plot.crop);
          const das = daysAfterSowing(plot, Date.now());
          const alertCount = alertsByPlot[plot.id] ?? 0;

          return (
            <Card key={plot.id} onPress={() => open(plot)}>
              <View style={s.cardRow}>
                <View style={s.thumb}>
                  <FieldHealthCanvas
                    plot={plot}
                    map={map}
                    nodes={plotNodes}
                    size={thumbSize}
                    showNodes={false}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.titleRow}>
                    <Text style={s.plotName} numberOfLines={1}>
                      {plot.name}
                    </Text>
                    {plot.id === selectedPlotId ? <Badge label={t('fields.active')} tone="ok" /> : null}
                  </View>

                  <Text style={s.plotMeta}>
                    {crop.label} · {plot.areaAcres} {t('fields.acre')} · {plot.stage}
                  </Text>
                  <Text style={s.plotMetaFaint}>
                    {t('fields.day')} {das} · {plot.soilType} · {plot.irrigationType}
                  </Text>

                  <View style={s.statsRow}>
                    {snap ? (
                      <>
                        <View style={s.healthPill}>
                          <View
                            style={[s.healthDot, { backgroundColor: healthColor(snap.healthIndex) }]}
                          />
                          <Text style={s.healthText}>{snap.healthIndex}/100</Text>
                        </View>
                        <Badge
                          label={
                            snap.risk === 'high'
                              ? t('map.highRisk')
                              : snap.risk === 'moderate'
                                ? t('map.moderate')
                                : t('map.healthy')
                          }
                          tone={riskTone(snap.risk)}
                        />
                      </>
                    ) : (
                      <Text style={s.plotMetaFaint}>{t('fields.connecting')}</Text>
                    )}
                    {alertCount > 0 ? (
                      <Badge label={`${alertCount}`} tone="danger" icon="warning" />
                    ) : null}
                  </View>

                  <View style={s.nodeRow}>
                    <Ionicons name="hardware-chip-outline" size={12} color={colors.textFaint} />
                    <Text style={s.nodeText}>
                      {plotNodes.filter((n) => n.status === 'online').length}/{plotNodes.length}{' '}
                      {t('fields.nodesOnline')}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>
          );
        })}

        <Card onPress={() => navigation.navigate('SensorNodes')}>
          <View style={s.linkRow}>
            <Ionicons name="hardware-chip" size={20} color={colors.brandLight} />
            <View style={{ flex: 1 }}>
              <Text style={s.linkTitle}>{t('nodes.title')}</Text>
              <Text style={s.linkSub}>{t('nodes.subtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  demoCard: { marginTop: sp.sm },
  demoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp.sm },
  demoText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 18 },
  cardRow: { flexDirection: 'row', gap: spacing.md },
  thumb: { borderRadius: radii.md, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  plotName: { ...typography.h3, color: colors.text, flexShrink: 1 },
  plotMeta: { ...typography.small, color: colors.textMuted, marginTop: 3, textTransform: 'capitalize' },
  plotMetaFaint: { ...typography.tiny, color: colors.textFaint, marginTop: 2, textTransform: 'capitalize' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  healthPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  healthDot: { width: 9, height: 9, borderRadius: 5 },
  healthText: { ...typography.small, color: colors.text, fontWeight: '800' },
  nodeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  nodeText: { ...typography.tiny, color: colors.textFaint },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkTitle: { ...typography.bodyStrong, color: colors.text },
  linkSub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
});
