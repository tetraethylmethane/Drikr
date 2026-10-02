import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cropProfile } from '../../config/agronomy';
import { colors, radii, spacing, StatusTone, toneColors, typography } from '../../theme';
import { Alert, Plot, PlotSnapshot, Recommendation, RiskAssessment } from '../../types';
import { Button, Card } from '../ui';
import { VoiceCommand } from './VoiceCommand';
import { GettingStarted } from './GettingStarted';
import { composeSms, familyAlertText } from '../../services/smsAlerts';
import { useAppSelector } from '../../store/hooks';

// Read the home summary aloud once per app start, not on every visit.
let readThisSession = false;

/**
 * Home, as a farmer needs it: one sentence about the field, the one thing to
 * do, and four big buttons.
 *
 * The full dashboard (sensor tiles, the health gauge, five risk rows, a tools
 * grid) is accurate, but in the field it asks a
 * farmer to read a dozen numbers before finding out whether anything is wrong.
 * This view answers that first - is my field OK, and what should I do - and
 * leaves the detail one tap away ("Show all details").
 *
 * Nothing here is computed differently: it shows the same alert, the same
 * assessment and the same recommendation the dashboard does, in plain words.
 */
export function SimpleHome({
  plot,
  snapshot,
  topAlert,
  primary,
  recommendation,
  noSensors,
  sensorBoxUnreachable,
  weatherLine,
  onSpeak,
  go,
  autoRead,
}: {
  plot: Plot | null;
  snapshot: PlotSnapshot | null;
  topAlert: Alert | null;
  /** The engine's main concern, if any. */
  primary: RiskAssessment | null;
  recommendation: Recommendation | null;
  /** A field watched by drone/photos only: there is nothing measuring it. */
  noSensors: boolean;
  sensorBoxUnreachable: boolean;
  weatherLine: string | null;
  onSpeak: (text: string) => void;
  go: (screen: string, params?: object) => void;
  /** Voice first: speak the summary when Home opens. */
  autoRead?: boolean;
}) {
  const { t } = useTranslation();
  const familyNumbers = useAppSelector((s) => s.settings.smsNumbers) ?? [];

  // --- The one sentence ------------------------------------------------------
  let tone: StatusTone = 'ok';
  let icon: keyof typeof Ionicons.glyphMap = 'happy';
  let title = t('simpleHome.healthy');
  let body: string | null = null;
  let action: { label: string; onPress: () => void } | null = null;

  if (!plot) {
    tone = 'info';
    icon = 'add-circle';
    title = t('simpleHome.noFieldTitle');
    body = t('simpleHome.noFieldBody');
    action = { label: t('simpleHome.addField'), onPress: () => go('FieldSetup') };
  } else if (topAlert) {
    tone = topAlert.severity === 'critical' || topAlert.severity === 'high' ? 'danger' : 'warn';
    icon = 'warning';
    title = topAlert.title;
    body = topAlert.detail;
    action = { label: t('simpleHome.whatToDo'), onPress: () => go('AlertDetail', { alertId: topAlert.id }) };
  } else if (sensorBoxUnreachable) {
    tone = 'warn';
    icon = 'cloud-offline';
    title = t('simpleHome.boxUnreachableTitle');
    body = t('simpleHome.boxUnreachableBody');
    action = { label: t('simpleHome.fixSensors'), onPress: () => go('SensorSetup') };
  } else if (noSensors) {
    tone = 'info';
    icon = 'camera';
    title = t('simpleHome.noSensorsTitle');
    body = t('simpleHome.noSensorsBody');
  } else if (!snapshot) {
    tone = 'neutral';
    icon = 'time';
    title = t('simpleHome.waitingTitle');
    body = t('simpleHome.waitingBody');
  } else if (primary && snapshot.healthIndex < 70) {
    tone = 'warn';
    icon = 'eye';
    title = t('simpleHome.watch', { what: primary.title });
    body = primary.detail;
    action = { label: t('simpleHome.whyThis'), onPress: () => go('RiskDetail', { domain: primary.domain }) };
  }

  const { fg, bg } = toneColors(tone);
  const spoken = [plot?.name, title, body, recommendation ? `${t('simpleHome.doToday')}: ${recommendation.text}` : null]
    .filter(Boolean)
    .join('. ');

  useEffect(() => {
    if (!autoRead || readThisSession || !plot) return;
    readThisSession = true;
    const id = setTimeout(() => onSpeak(spoken), 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, plot?.id]);

  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; hint: string; screen: string; color: string }[] = [
    { icon: 'map', label: t('simpleHome.actMap'), hint: t('simpleHome.actMapHint'), screen: 'FieldHealthMap', color: colors.brandLight },
    { icon: 'camera', label: t('simpleHome.actPhoto'), hint: t('simpleHome.actPhotoHint'), screen: 'DiseaseDetection', color: colors.ok },
    { icon: 'paper-plane', label: t('simpleHome.actDrone'), hint: t('simpleHome.actDroneHint'), screen: 'Drone', color: colors.brand },
    { icon: 'chatbubble-ellipses', label: t('simpleHome.actAsk'), hint: t('simpleHome.actAskHint'), screen: 'KisanMitra', color: colors.info },
  ];

  const more: { icon: keyof typeof Ionicons.glyphMap; label: string; screen: string }[] = [
    { icon: 'partly-sunny', label: t('simpleHome.moreWeather'), screen: 'Weather' },
    { icon: 'trending-up', label: t('simpleHome.moreMarket'), screen: 'Market' },
    { icon: 'cash', label: t('simpleHome.moreMoney'), screen: 'ProfitLoss' },
    { icon: 'people', label: t('simpleHome.moreCommunity'), screen: 'Community' },
    { icon: 'ribbon', label: t('simpleHome.moreSchemes'), screen: 'Schemes' },
    { icon: 'paper-plane', label: t('simpleHome.moreBook'), screen: 'DroneBooking' },
    { icon: 'flask', label: t('simpleHome.moreSoil'), screen: 'SoilCard' },
    { icon: 'shield-checkmark', label: t('simpleHome.moreClaim'), screen: 'Claim' },
    { icon: 'gift', label: t('kit.title'), screen: 'SensorKit' },
    { icon: 'hardware-chip', label: t('simpleHome.moreSensors'), screen: 'SensorNodes' },
  ];

  return (
    <View>
      {/* Is my field OK? */}
      <View style={[s.status, { backgroundColor: bg, borderColor: fg + '44' }]}>
        <View style={s.statusTop}>
          <Ionicons name={icon} size={34} color={fg} />
          <View style={{ flex: 1 }}>
            {plot ? (
              <Text style={s.fieldName}>
                {plot.name} · {cropProfile(plot.crop).label}
              </Text>
            ) : null}
            <Text style={[s.statusTitle, { color: fg }]}>{title}</Text>
          </View>
          <Pressable onPress={() => onSpeak(spoken)} hitSlop={10} accessibilityLabel={t('simpleHome.listen')} style={s.listen}>
            <Ionicons name="volume-high" size={20} color={fg} />
          </Pressable>
        </View>
        {body ? <Text style={s.statusBody}>{body}</Text> : null}
        {action ? <Button title={action.label} onPress={action.onPress} style={{ marginTop: spacing.md }} /> : null}
        {/* Urgent: one tap opens the SMS app with the alert written for the family. */}
        {topAlert && familyNumbers.length && (topAlert.severity === 'critical' || topAlert.severity === 'high') ? (
          <Button
            title={t('sms.tellFamily')}
            icon="chatbubble-ellipses"
            variant="secondary"
            onPress={() => void composeSms(familyNumbers, familyAlertText(topAlert))}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </View>

      {/* Anything skipped in setup, until it is done. */}
      <GettingStarted go={go} />

      {/* The one thing to do. */}
      {recommendation ? (
        <Card>
          <Text style={s.cardLabel}>{t('simpleHome.doToday')}</Text>
          <Text style={s.recText}>{recommendation.text}</Text>
        </Card>
      ) : null}

      {/* Say it instead of reading. */}
      <VoiceCommand go={go} />

      {/* What do you want to do? */}
      <Text style={s.section}>{t('simpleHome.whatNow')}</Text>
      <View style={s.grid}>
        {actions.map((a) => (
          <Pressable key={a.screen} style={({ pressed }) => [s.tile, pressed && { opacity: 0.8 }]} onPress={() => go(a.screen)}>
            <View style={[s.tileIcon, { backgroundColor: a.color + '1A' }]}>
              <Ionicons name={a.icon} size={26} color={a.color} />
            </View>
            <Text style={s.tileLabel}>{a.label}</Text>
            <Text style={s.tileHint}>{a.hint}</Text>
          </Pressable>
        ))}
      </View>

      {weatherLine ? (
        <Card onPress={() => go('Weather')}>
          <View style={s.weatherRow}>
            <Ionicons name="partly-sunny" size={22} color={colors.warn} />
            <Text style={s.weatherText}>{weatherLine}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </View>
        </Card>
      ) : null}

      {/* Everything else, as a short list rather than a grid of icons. */}
      <Text style={s.section}>{t('simpleHome.more')}</Text>
      <Card padded={false}>
        {more.map((m, i) => (
          <Pressable
            key={m.screen}
            style={({ pressed }) => [s.moreRow, i > 0 && s.moreBorder, pressed && { backgroundColor: colors.surfaceAlt }]}
            onPress={() => go(m.screen)}
          >
            <Ionicons name={m.icon} size={19} color={colors.brandLight} />
            <Text style={s.moreLabel}>{m.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  status: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fieldName: { ...typography.tiny, color: colors.textMuted, fontWeight: '700', marginBottom: 2 },
  statusTitle: { fontSize: 20, fontWeight: '800', lineHeight: 25 },
  statusBody: { ...typography.body, color: colors.text, marginTop: spacing.md, lineHeight: 22 },
  listen: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  recText: { ...typography.body, color: colors.text, marginTop: 6, lineHeight: 22, fontWeight: '600' },
  section: { ...typography.h3, color: colors.text, marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg - 5 },
  tile: {
    width: '50%',
    padding: 5,
  },
  tileIcon: {
    height: 64,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    ...typography.bodyStrong,
    color: colors.text,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  tileHint: {
    ...typography.tiny,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: 2,
    lineHeight: 15,
    minHeight: 46,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weatherText: { ...typography.small, color: colors.text, flex: 1, fontWeight: '600' },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  moreBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  moreLabel: { ...typography.body, color: colors.text, flex: 1 },
});
