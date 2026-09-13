import React, { useCallback, useMemo } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cropProfile } from '../config/agronomy';
import { HEADLINE_METRICS, metricSeries } from '../config/metrics';
import { telemetrySource } from '../services/telemetry';
import { staleAfterMs } from '../services/hardware';
import { activeAlerts, sortAlerts } from '../services/alertEngine';
import { activeMissions, proposeMission } from '../services/drone';
import { describeWeather } from '../services/weather';
import { formatAge } from '../services/offline';
import { usePlotState, useTelemetryEngine } from '../hooks/useTelemetry';
import { useLanguage, LANGUAGES } from '../hooks/useLanguage';
import { useVoice } from '../hooks/useVoice';
import { selectPlot } from '../store/slices/farmSlice';
import { confirmMission, proposeMissionAction } from '../store/slices/droneSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, healthColor, radii, spacing, typography } from '../theme';
import { Recommendation } from '../types';
import { Badge, Button, Card, LiveDot, Screen, SectionTitle } from '../components/ui';
import {
  AlertBanner,
  DroneMissionCard,
  PlotPicker,
  RecommendationList,
  RiskDomainRow,
  StatTile,
  riskTone,
} from '../components/domain';
import { Gauge } from '../components/charts';

/**
 * Home — the deck's primary mockup.
 *
 * Order is deliberate and matches it: the alert that needs attention, then the live
 * sensor grid that justifies the alert, then what to do about it, then the assistant.
 * A farmer opening the app mid-field should get the answer without scrolling.
 */
export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language, change } = useLanguage();

  // Mounting the engine here keeps a single poll loop for the whole app.
  const { refresh } = useTelemetryEngine();
  const { plot, snapshot, map, history, assessment, forecast } = usePlotState();

  const plots = useAppSelector((s) => s.farm.plots);
  const nodes = useAppSelector((s) => s.farm.nodes);
  const snapshots = useAppSelector((s) => s.telemetry.snapshots);
  const { refreshing, lastSyncAt, online } = useAppSelector((s) => s.telemetry);
  const alerts = useAppSelector((s) => s.alerts.items);
  const missions = useAppSelector((s) => s.drone.missions);
  const { confidenceThreshold, autoSpeak } = useAppSelector((s) => s.settings);

  const { speak } = useVoice({ language });

  const topAlert = useMemo(() => sortAlerts(activeAlerts(alerts))[0] ?? null, [alerts]);
  const plotMissions = useMemo(
    () => activeMissions(missions).filter((m) => m.plotId === plot?.id),
    [missions, plot?.id]
  );
  const crop = cropProfile(plot?.crop);

  const handleDroneFromRecommendation = useCallback(
    (_rec: Recommendation) => {
      if (!plot || !snapshot) return;
      const mission = proposeMission({
        plot,
        type: 'spray',
        map,
        reading: snapshot.reading,
        forecast,
        alert: topAlert ?? undefined,
      });
      dispatch(proposeMissionAction(mission));
      navigation.navigate('Drone');
    },
    [plot, snapshot, map, forecast, topAlert, dispatch, navigation]
  );

  const speakSummary = useCallback(() => {
    if (!plot || !snapshot || !assessment) return;
    const lines = [
      `${plot.name}. Crop health ${snapshot.healthIndex} out of 100.`,
      assessment.primary ? `${assessment.primary.title}. ${assessment.primary.detail}` : 'No significant risk.',
      ...assessment.recommendations.slice(0, 2).map((r) => r.text),
    ];
    speak(lines.join(' '));
  }, [plot, snapshot, assessment, speak]);

  const services = useMemo(
    () => [
      { id: 'map', icon: 'map', label: t('home.fieldMap'), screen: 'FieldHealthMap', tone: colors.brandLight },
      { id: 'disease', icon: 'leaf', label: t('home.diseaseScan'), screen: 'DiseaseDetection', tone: colors.ok },
      { id: 'pest', icon: 'bug', label: t('home.pestScan'), screen: 'PestDetection', tone: colors.danger },
      { id: 'irrigation', icon: 'water', label: t('home.irrigation'), screen: 'Irrigation', tone: colors.info },
      { id: 'nutrient', icon: 'nutrition', label: t('home.nutrients'), screen: 'Nutrient', tone: colors.warn },
      { id: 'climate', icon: 'thunderstorm', label: t('home.climate'), screen: 'ClimateRisk', tone: '#8E44AD' },
      { id: 'drone', icon: 'paper-plane', label: t('home.drone'), screen: 'Drone', tone: colors.brand },
      { id: 'market', icon: 'trending-up', label: t('home.market'), screen: 'Market', tone: '#0E7490' },
    ],
    [t]
  );

  const lastUpdated = snapshot
    ? new Date(snapshot.at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

  // Staleness is judged against the push interval, not a fixed window: with
  // sleeping nodes a 4-minute-old reading is healthy, and the old 2-minute rule
  // would have flagged every node as stale forever.
  const stale = lastSyncAt ? Date.now() - lastSyncAt > staleAfterMs() : true;
  const weather = forecast ? describeWeather(forecast.now.code) : null;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxxl * 2.5 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
        }
      >
        {/* Brand bar + language switch, per the mockup */}
        <View style={s.brandBar}>
          <View style={s.brandLeft}>
            {/* The real mark, not a stand-in glyph. It is pure black, so it sits
                on the light surface rather than a coloured tile. */}
            <Image source={require('../../assets/icon.png')} style={s.logoMark} resizeMode="contain" />
            <View>
              <Text style={s.brandName}>DRIKR SYSTEMS</Text>
              <Text style={s.brandSub}>Smart Farming</Text>
            </View>
          </View>

          <View style={s.brandRight}>
            {!online ? <Badge label={t('common.offline')} tone="warn" icon="cloud-offline" /> : null}
            <Pressable
              style={s.langBtn}
              onPress={() => {
                const i = LANGUAGES.findIndex((l) => l.code === language);
                change(LANGUAGES[(i + 1) % LANGUAGES.length].code);
              }}
              accessibilityLabel="Change language"
            >
              <Ionicons name="globe-outline" size={14} color={colors.brand} />
              <Text style={s.langText}>{LANGUAGES.find((l) => l.code === language)?.native}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.brand} />
            </Pressable>
          </View>
        </View>

        {/* Alert banner */}
        {topAlert ? (
          <AlertBanner
            alert={topAlert}
            onPress={() => navigation.navigate('AlertDetail', { alertId: topAlert.id })}
          />
        ) : (
          <View style={[s.okBanner]}>
            <Ionicons name="shield-checkmark" size={18} color={colors.ok} />
            <Text style={s.okBannerText}>{t('home.allClear')}</Text>
          </View>
        )}

        {/* Live sensor data */}
        <View style={s.liveHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.liveTitle}>
              {plot ? `${plot.name} — ${t('home.liveSensorData')}` : t('home.liveSensorData')}
            </Text>
            <Text style={s.liveMeta}>
              {t('home.lastUpdated')}: {lastUpdated}
              {snapshot ? ` · ${snapshot.nodesOnline}/${snapshot.nodesTotal} ${t('home.nodes')}` : ''}
            </Text>
          </View>
          <LiveDot at={snapshot?.at ?? null} stale={stale} />
        </View>

        {plot ? (
          <View style={s.plotRow}>
            <PlotPicker
              plots={plots}
              selectedId={plot.id}
              snapshots={snapshots}
              onSelect={(id) => dispatch(selectPlot(id))}
            />
            <Badge label={`${crop.label} · ${plot.stage}`} tone="neutral" />
            {telemetrySource() === 'simulated' ? (
              <Badge label={t('home.simulated')} tone="info" icon="hardware-chip-outline" />
            ) : null}
          </View>
        ) : null}

        {/* Sensor tile grid — 2 x 3, matching the mockup */}
        {snapshot ? (
          <View style={s.grid}>
            {HEADLINE_METRICS.map((metric) => (
              <View key={metric} style={s.gridItem}>
                <StatTile
                  metric={metric}
                  reading={snapshot.reading}
                  plot={plot}
                  series={metricSeries(history, metric)}
                  onPress={() => navigation.navigate('SensorDetail', { metric })}
                />
              </View>
            ))}
          </View>
        ) : (
          <Card>
            <Text style={s.loadingText}>{t('home.waitingForSensors')}</Text>
          </Card>
        )}

        {/* Crop health index + risk breakdown */}
        {snapshot && assessment ? (
          <Card>
            <View style={s.healthRow}>
              <Gauge
                value={snapshot.healthIndex}
                label={t('home.healthIndex')}
                color={healthColor(snapshot.healthIndex)}
                size={112}
              />
              <View style={{ flex: 1, gap: 2 }}>
                {assessment.risks.map((risk) => (
                  <RiskDomainRow
                    key={risk.domain}
                    risk={risk}
                    threshold={confidenceThreshold}
                    onPress={() => navigation.navigate('RiskDetail', { domain: risk.domain })}
                  />
                ))}
              </View>
            </View>
          </Card>
        ) : null}

        {/* Recommended action */}
        {assessment ? (
          <>
            <SectionTitle
              title={t('home.recommendedAction')}
              icon="bulb"
              action={t('home.listen')}
              onAction={speakSummary}
            />
            <Card>
              <RecommendationList
                recommendations={assessment.recommendations}
                max={4}
                onSpeak={speak}
                onDrone={handleDroneFromRecommendation}
              />
              {assessment.primary ? (
                <Pressable
                  style={s.whyRow}
                  onPress={() => navigation.navigate('RiskDetail', { domain: assessment.primary!.domain })}
                >
                  <Ionicons name="information-circle-outline" size={14} color={colors.brandLight} />
                  <Text style={s.whyText}>{t('home.whyThis')}</Text>
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}

        {/* Pending drone mission */}
        {plotMissions.length > 0 ? (
          <>
            <SectionTitle title={t('home.droneMission')} icon="paper-plane" action={t('common.viewAll')} onAction={() => navigation.navigate('Drone')} />
            <View style={{ marginHorizontal: spacing.lg }}>
              <DroneMissionCard
                mission={plotMissions[0]}
                plot={plot}
                compact
                onConfirm={() => dispatch(confirmMission(plotMissions[0].id))}
              />
            </View>
          </>
        ) : null}

        {/* Kisan Mitra entry, as in the mockup */}
        <Card onPress={() => navigation.navigate('KisanMitra')} style={s.mitraCard}>
          <View style={s.mitraRow}>
            <View style={s.mitraIcon}>
              <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mitraTitle}>{t('home.askKisanMitra')}</Text>
              <Text style={s.mitraSub}>{t('home.kisanMitraSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </View>
        </Card>

        {/* Weather strip */}
        {forecast && weather ? (
          <Card onPress={() => navigation.navigate('Weather')}>
            <View style={s.weatherRow}>
              <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={30} color={colors.warn} />
              <View style={{ flex: 1 }}>
                <Text style={s.weatherTemp}>{Math.round(forecast.now.temp)}°C · {weather.label}</Text>
                <Text style={s.weatherMeta}>
                  {t('weather.humidity')} {Math.round(forecast.now.humidity)}% · {t('weather.wind')}{' '}
                  {Math.round(forecast.now.windSpeed)} km/h
                  {forecast.daily[0] ? ` · ${forecast.daily[0].precipProbability}% ${t('weather.rainChance')}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </View>
          </Card>
        ) : null}

        {/* Services */}
        <SectionTitle title={t('home.tools')} icon="grid" />
        <View style={s.services}>
          {services.map((svc) => (
            <Pressable
              key={svc.id}
              style={({ pressed }) => [s.service, pressed && { opacity: 0.75 }]}
              onPress={() => navigation.navigate(svc.screen)}
            >
              <View style={[s.serviceIcon, { backgroundColor: svc.tone + '18' }]}>
                <Ionicons name={svc.icon as keyof typeof Ionicons.glyphMap} size={21} color={svc.tone} />
              </View>
              <Text style={s.serviceLabel} numberOfLines={2}>
                {svc.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {lastSyncAt ? (
          <Text style={s.footer}>
            {t('home.syncedAt')} {formatAge(lastSyncAt)} · {telemetrySource() === 'simulated' ? t('home.simulatedFooter') : t('home.hardwareFooter')}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoMark: { width: 30, height: 30 },
  brandName: { fontSize: 14, fontWeight: '900', color: colors.text, letterSpacing: 0.9 },
  brandSub: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint, letterSpacing: 0.4 },
  brandRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  langBtn: {
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
  langText: { ...typography.small, color: colors.brand, fontWeight: '700' },
  okBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.okBg,
    borderWidth: 1,
    borderColor: colors.ok + '33',
  },
  okBannerText: { ...typography.small, color: colors.ok, fontWeight: '700', flex: 1 },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  liveTitle: { ...typography.h3, color: colors.text },
  liveMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  plotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg - 4,
    marginTop: spacing.md,
  },
  gridItem: { width: '50%', padding: 4 },
  loadingText: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  whyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  whyText: { ...typography.tiny, color: colors.brandLight, fontWeight: '700' },
  mitraCard: { backgroundColor: colors.surfaceAlt, borderColor: colors.brandLight + '33' },
  mitraRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mitraIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mitraTitle: { ...typography.bodyStrong, color: colors.text },
  mitraSub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weatherTemp: { ...typography.bodyStrong, color: colors.text },
  weatherMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 3 },
  services: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg - 4 },
  service: { width: '25%', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: 4 },
  serviceIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  serviceLabel: { fontSize: 10.5, fontWeight: '600', color: colors.textMuted, textAlign: 'center', lineHeight: 14 },
  footer: {
    ...typography.tiny,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
});
