import React, { useMemo } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cropProfile, DRONE_LIMITS } from '../config/agronomy';
import { describeWeather, rainNextHours } from '../services/weather';
import { formatAge } from '../services/offline';
import { usePlotState } from '../hooks/useTelemetry';
import { useAppSelector } from '../store/hooks';
import { colors, radii, spacing, StatusTone, toneColors, typography } from '../theme';
import { AppHeader, Badge, Card, EmptyState, Screen, SectionTitle } from '../components/ui';
import { ChartLegend, TrendChart } from '../components/charts';
import { RecommendationList } from '../components/domain';

/**
 * Weather and climate risk.
 *
 * Real forecast data from Open-Meteo, framed around farm decisions rather than
 * generic conditions: whether to irrigate, whether a spray will wash off, whether
 * the drone can fly, and whether heat will hit at a sensitive growth stage.
 */
export default function WeatherScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { plot, snapshot, assessment, forecast } = usePlotState();
  const online = useAppSelector((s) => s.telemetry.online);

  const width = Dimensions.get('window').width - spacing.lg * 4;

  const climateRisk = useMemo(
    () => assessment?.risks.find((r) => r.domain === 'climate') ?? null,
    [assessment]
  );

  const hourly = useMemo(() => {
    if (!forecast) return [];
    const now = Date.now();
    return forecast.hourly.filter((h) => h.at >= now - 3600_000).slice(0, 24);
  }, [forecast]);

  const tempSeries = useMemo(
    () => [
      { label: t('weather.temp'), unit: '°C', values: hourly.map((h) => h.temp), color: colors.warn },
    ],
    [hourly, t]
  );
  const rainSeries = useMemo(
    () => [
      { label: t('weather.rain'), unit: 'mm', values: hourly.map((h) => h.precip), color: colors.info },
    ],
    [hourly, t]
  );

  const xLabels = useMemo(() => {
    if (hourly.length < 2) return undefined;
    const fmt = (at: number) => new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric' });
    return [
      fmt(hourly[0].at),
      fmt(hourly[Math.floor(hourly.length / 2)].at),
      fmt(hourly[hourly.length - 1].at),
    ];
  }, [hourly]);

  if (!forecast) {
    return (
      <Screen>
        <AppHeader title={t('weather.title')} onBack={() => navigation.goBack()} />
        <EmptyState
          icon="cloud-offline-outline"
          title={online ? t('weather.loading') : t('weather.offlineTitle')}
          body={online ? undefined : t('weather.offlineBody')}
        />
      </Screen>
    );
  }

  const now = describeWeather(forecast.now.code);
  const crop = plot ? cropProfile(plot.crop) : null;
  const tempCeiling = crop?.bands.airTemp?.ideal[1] ?? 33;
  const rain24 = rainNextHours(forecast, 24);
  const rain48 = rainNextHours(forecast, 48);

  const sprayOk =
    forecast.now.windSpeed <= DRONE_LIMITS.maxWindKmh && forecast.now.precipitation <= DRONE_LIMITS.maxRainMm;

  return (
    <Screen scroll>
      <AppHeader
        title={t('weather.title')}
        subtitle={plot ? plot.name : undefined}
        onBack={() => navigation.goBack()}
        right={<Badge label={formatAge(forecast.fetchedAt)} tone={online ? 'ok' : 'warn'} />}
      />

      {/* Current */}
      <Card>
        <View style={s.nowRow}>
          <Ionicons name={now.icon as keyof typeof Ionicons.glyphMap} size={56} color={colors.warn} />
          <View style={{ flex: 1 }}>
            <Text style={s.nowTemp}>{Math.round(forecast.now.temp)}°C</Text>
            <Text style={s.nowLabel}>{now.label}</Text>
          </View>
        </View>

        <View style={s.statRow}>
          <WeatherStat icon="water" label={t('weather.humidity')} value={`${Math.round(forecast.now.humidity)}%`} />
          <WeatherStat icon="navigate" label={t('weather.wind')} value={`${Math.round(forecast.now.windSpeed)} km/h`} />
          <WeatherStat icon="umbrella" label={t('weather.rain24')} value={`${rain24.toFixed(1)} mm`} />
        </View>
      </Card>

      {/* Farm decisions driven by weather */}
      <SectionTitle title={t('weather.farmImpact')} icon="leaf" />
      <Card>
        <DecisionRow
          icon="water"
          label={t('weather.irrigationCall')}
          value={rain24 > 8 ? t('weather.holdIrrigation') : t('weather.irrigateNormal')}
          tone={rain24 > 8 ? 'info' : 'neutral'}
        />
        <DecisionRow
          icon="rainy"
          label={t('weather.sprayWindow')}
          value={sprayOk ? t('weather.sprayOk') : t('weather.sprayWait')}
          tone={sprayOk ? 'ok' : 'warn'}
        />
        <DecisionRow
          icon="paper-plane"
          label={t('weather.droneFlight')}
          value={
            forecast.now.windSpeed <= DRONE_LIMITS.maxWindKmh
              ? t('weather.flightOk')
              : `${t('weather.flightBlocked')} (${Math.round(forecast.now.windSpeed)} km/h)`
          }
          tone={forecast.now.windSpeed <= DRONE_LIMITS.maxWindKmh ? 'ok' : 'danger'}
        />
        <DecisionRow
          icon="thermometer"
          label={t('weather.heatStress')}
          value={
            forecast.daily.slice(0, 3).some((d) => d.tempMax > tempCeiling)
              ? t('weather.heatExpected')
              : t('weather.heatNone')
          }
          tone={forecast.daily.slice(0, 3).some((d) => d.tempMax > tempCeiling) ? 'warn' : 'ok'}
        />
        {rain48 > 35 ? (
          <DecisionRow
            icon="alert-circle"
            label={t('weather.heavyRain')}
            value={`${Math.round(rain48)} mm ${t('weather.in48h')}`}
            tone="danger"
          />
        ) : null}
      </Card>

      {/* Hourly */}
      {hourly.length > 2 ? (
        <>
          <SectionTitle title={t('weather.next24h')} icon="time" />
          <Card>
            <Text style={s.chartTitle}>{t('weather.temp')}</Text>
            <TrendChart
              series={tempSeries}
              width={width}
              xLabels={xLabels}
              threshold={tempCeiling}
              thresholdLabel={t('weather.cropCeiling')}
              height={140}
            />
            <ChartLegend series={tempSeries} />

            <View style={s.chartDivider} />

            <Text style={s.chartTitle}>{t('weather.rain')}</Text>
            <TrendChart series={rainSeries} width={width} xLabels={xLabels} height={110} />
            <ChartLegend series={rainSeries} />
          </Card>
        </>
      ) : null}

      {/* 7-day */}
      <SectionTitle title={t('weather.forecast7')} icon="calendar" />
      <Card padded={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dailyRow}>
          {forecast.daily.map((d, i) => {
            const desc = describeWeather(d.code);
            const hot = d.tempMax > tempCeiling;
            return (
              <View key={d.date} style={[s.dayCard, hot && { backgroundColor: colors.warnBg }]}>
                <Text style={s.dayName}>
                  {i === 0
                    ? t('weather.today')
                    : new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                </Text>
                <Ionicons
                  name={desc.icon as keyof typeof Ionicons.glyphMap}
                  size={24}
                  color={hot ? colors.warn : colors.brandLight}
                  style={{ marginVertical: 6 }}
                />
                <Text style={s.dayHigh}>{Math.round(d.tempMax)}°</Text>
                <Text style={s.dayLow}>{Math.round(d.tempMin)}°</Text>
                {d.precipProbability > 20 ? (
                  <Text style={s.dayRain}>{d.precipProbability}%</Text>
                ) : (
                  <Text style={s.dayRainNone}>—</Text>
                )}
                {d.windMax > DRONE_LIMITS.maxWindKmh ? (
                  <Ionicons name="warning" size={10} color={colors.danger} style={{ marginTop: 3 }} />
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </Card>

      {/* Climate risk recommendations */}
      {climateRisk && climateRisk.recommendations.length > 0 ? (
        <>
          <SectionTitle title={t('home.recommendedAction')} icon="bulb" />
          <Card>
            <RecommendationList recommendations={climateRisk.recommendations} />
          </Card>
        </>
      ) : null}

      {snapshot ? (
        <Text style={s.footnote}>
          {t('weather.sensorCompare', {
            sensor: Math.round(snapshot.reading.airTemp),
            station: Math.round(forecast.now.temp),
          })}
        </Text>
      ) : null}
    </Screen>
  );
}

function WeatherStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.weatherStat}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={17} color={colors.brandLight} />
      <Text style={s.weatherStatValue}>{value}</Text>
      <Text style={s.weatherStatLabel}>{label}</Text>
    </View>
  );
}

function DecisionRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone: StatusTone;
}) {
  const { fg, bg } = toneColors(tone);
  return (
    <View style={s.decisionRow}>
      <View style={[s.decisionIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={15} color={fg} />
      </View>
      <Text style={s.decisionLabel}>{label}</Text>
      <Text style={[s.decisionValue, { color: fg }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  nowTemp: { fontSize: 40, fontWeight: '800', color: colors.text, letterSpacing: -1.2 },
  nowLabel: { ...typography.body, color: colors.textMuted, marginTop: -2 },
  statRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  weatherStat: { flex: 1, alignItems: 'center', gap: 3 },
  weatherStatValue: { ...typography.bodyStrong, color: colors.text },
  weatherStatLabel: { ...typography.tiny, color: colors.textFaint },
  decisionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  decisionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  decisionLabel: { ...typography.small, color: colors.textMuted, flex: 1 },
  decisionValue: { ...typography.small, fontWeight: '700', flex: 1.2, textAlign: 'right' },
  chartTitle: { ...typography.tiny, color: colors.textMuted, marginBottom: spacing.sm },
  chartDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  dailyRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  dayCard: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    minWidth: 62,
  },
  dayName: { ...typography.tiny, color: colors.textMuted },
  dayHigh: { ...typography.bodyStrong, color: colors.text },
  dayLow: { ...typography.tiny, color: colors.textFaint },
  dayRain: { ...typography.tiny, color: colors.info, marginTop: 3 },
  dayRainNone: { ...typography.tiny, color: colors.textFaint, marginTop: 3 },
  footnote: {
    ...typography.tiny,
    color: colors.textFaint,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    lineHeight: 16,
  },
});
