import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { DOMAIN_LABELS, cropProfile } from '../config/agronomy';
import { METRICS, metricSeries } from '../config/metrics';
import { proposeMission } from '../services/drone';
import { usePlotState } from '../hooks/useTelemetry';
import { useLanguage } from '../hooks/useLanguage';
import { useVoice } from '../hooks/useVoice';
import { proposeMissionAction } from '../store/slices/droneSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, spacing, typography } from '../theme';
import { RiskDomain, SensorMetric } from '../types';
import { AppHeader, Badge, Button, Card, ConfidenceBar, Screen, SectionTitle } from '../components/ui';
import { ChartLegend, TrendChart } from '../components/charts';
import { DriverList, RecommendationList, riskTone } from '../components/domain';

/**
 * Deep view of one risk domain — the shared screen behind Irrigation, Nutrient,
 * Pest, Crop Health and Climate.
 *
 * All five entry points render the same thing because the engine treats them
 * identically: score, evidence, trend, action. One screen means a fix to the
 * explanation benefits every domain.
 */

/** Which metrics to chart for each domain. */
const DOMAIN_METRICS: Record<RiskDomain, SensorMetric[]> = {
  irrigation: ['soilMoisture', 'rainfall'],
  nutrient: ['nitrogen', 'phosphorus', 'potassium'],
  pest: ['pestActivity', 'voc'],
  cropHealth: ['leafWetness', 'humidity'],
  climate: ['airTemp', 'windSpeed'],
};

export default function RiskDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { speak } = useVoice({ language });

  const domain: RiskDomain = route.params?.domain ?? 'pest';
  const { plot, snapshot, map, history, assessment, forecast } = usePlotState();
  const confidenceThreshold = useAppSelector((s) => s.settings.confidenceThreshold);

  const risk = useMemo(
    () => assessment?.risks.find((r) => r.domain === domain) ?? null,
    [assessment, domain]
  );

  const width = Dimensions.get('window').width - spacing.lg * 2 - spacing.lg * 2;

  const series = useMemo(() => {
    const metrics = DOMAIN_METRICS[domain];
    return metrics.map((m, i) => ({
      label: METRICS[m].label,
      unit: METRICS[m].unit,
      values: metricSeries(history, m),
      color: colors.series[i % colors.series.length],
    }));
  }, [domain, history]);

  const xLabels = useMemo(() => {
    if (history.length < 2) return undefined;
    const fmt = (at: number) =>
      new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const mid = history[Math.floor(history.length / 2)];
    return [fmt(history[0].at), fmt(mid.at), fmt(history[history.length - 1].at)];
  }, [history]);

  // Irrigation gets a reference line at the crop's stage-specific moisture floor.
  const threshold = useMemo(() => {
    if (domain !== 'irrigation' || !plot) return undefined;
    return cropProfile(plot.crop).moistureFloorByStage[plot.stage];
  }, [domain, plot]);

  if (!risk || !plot || !snapshot) {
    return (
      <Screen>
        <AppHeader title={DOMAIN_LABELS[domain]} onBack={() => navigation.goBack()} />
        <Card>
          <Text style={s.muted}>{t('home.waitingForSensors')}</Text>
        </Card>
      </Screen>
    );
  }

  const handleDrone = () => {
    const mission = proposeMission({
      plot,
      type: domain === 'pest' || domain === 'cropHealth' ? 'spray' : 'inspect',
      map,
      reading: snapshot.reading,
      forecast,
      // So an inspection targets the cells bad for *this* domain.
      domain,
    });
    dispatch(proposeMissionAction(mission));
    navigation.navigate('Drone');
  };

  return (
    <Screen scroll>
      <AppHeader
        title={DOMAIN_LABELS[domain]}
        subtitle={`${plot.name} · ${cropProfile(plot.crop).label}`}
        onBack={() => navigation.goBack()}
      />

      <Card>
        <View style={s.scoreRow}>
          <View>
            <Text style={s.score}>{risk.score}</Text>
            <Text style={s.scoreLabel}>{t('risk.riskScore')}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Badge
              label={
                risk.level === 'high'
                  ? t('map.highRisk')
                  : risk.level === 'moderate'
                    ? t('map.moderate')
                    : t('map.healthy')
              }
              tone={riskTone(risk.level)}
            />
            <Text style={s.title}>{risk.title}</Text>
          </View>
        </View>

        <Text style={s.detail}>{risk.detail}</Text>
        <ConfidenceBar confidence={risk.confidence} threshold={confidenceThreshold} />

        <Button
          title={t('alerts.readAloud')}
          icon="volume-medium"
          variant="secondary"
          size="sm"
          onPress={() => speak(`${risk.title}. ${risk.detail}`)}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      {/* Trend */}
      {series.some((sr) => sr.values.length > 1) ? (
        <>
          <SectionTitle title={t('risk.trend')} icon="trending-up" />
          <Card>
            <TrendChart
              series={series}
              width={width}
              xLabels={xLabels}
              threshold={threshold}
              thresholdLabel={threshold ? t('risk.floor') : undefined}
            />
            <ChartLegend series={series} />
          </Card>
        </>
      ) : null}

      {/* Evidence */}
      <SectionTitle title={t('alerts.whyFired')} icon="analytics" />
      <Card>
        <DriverList drivers={risk.drivers} />
      </Card>

      {/* Actions */}
      <SectionTitle title={t('home.recommendedAction')} icon="bulb" />
      <Card>
        <RecommendationList recommendations={risk.recommendations} onSpeak={speak} />
        {risk.recommendations.some((r) => r.droneEligible) ? (
          <Button
            title={t('alerts.scheduleDrone')}
            icon="paper-plane"
            onPress={handleDrone}
            style={{ marginTop: spacing.lg }}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  muted: { ...typography.small, color: colors.textMuted },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  score: { fontSize: 42, fontWeight: '900', color: colors.text, letterSpacing: -1.5 },
  scoreLabel: { ...typography.tiny, color: colors.textMuted, marginTop: -4 },
  title: { ...typography.h3, color: colors.text },
  detail: { ...typography.body, color: colors.textMuted, lineHeight: 21, marginTop: spacing.md },
});
