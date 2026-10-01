import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DroneLink, LinkStatus } from '../../services/droneLink';
import { requestPermission } from '../../services/notifications';
import { colors, radii, spacing, typography } from '../../theme';
import { Button, Card } from '../ui';
import { FlightResults } from './FlightResults';
import { localizeNative } from '../../services/nativeText';

/**
 * The whole drone job as four steps a farmer can follow without training:
 *
 *   1 Connect  - join the drone's WiFi, tap Connect
 *   2 Check    - a checklist that ticks itself; only what is unsafe blocks
 *   3 Scout    - one button; live progress and a big STOP
 *   4 Results  - a photo per spot, "Show on map"
 *
 * Rules this screen keeps (from field testing, 2026-09-29):
 * - one clear action per step, written on the button;
 * - never a greyed-out button without a line saying what to do;
 * - plain words - spot, not waypoint; "finding its location", not GPS fix;
 * - only impossible or unsafe things block (no connection, no location,
 *   battery too low). Weather and daylight are advice.
 */

const SCOUT = { rows: 2, cols: 4, spacingM: 5, altitudeM: 5 };
const SPOTS = SCOUT.rows * SCOUT.cols;
const GOOD_BATTERY = 80;
const MIN_BATTERY = 50;

type Tick = 'ok' | 'warn' | 'bad' | 'wait';

export function SimpleDroneFlow({
  link,
  status,
  refresh,
  weather,
}: {
  link: DroneLink;
  status: LinkStatus | null;
  refresh: () => Promise<void>;
  /** The app's flight-conditions verdict; advice only here. */
  weather: { ok: boolean; reason?: string | null };
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'connect' | 'scout' | 'stop' | 'land' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [areaClear, setAreaClear] = useState(false);

  const scout = status?.scout;
  const scouting = Boolean(scout?.active);
  const finished = Boolean(scout && ['done', 'failed', 'cancelled'].includes(scout.phase));
  const [showResults, setShowResults] = useState(false);
  useEffect(() => {
    if (finished) setShowResults(true);
  }, [finished]);

  // The native link reports progress in English; the farmer reads it in their
  // own language, so the line is built here from the phase and the counts.
  // A failure keeps the link's own sentence, which says what went wrong.
  const scoutLine = (): string => {
    if (!scout) return '…';
    const total = scout.total || SPOTS;
    switch (scout.phase) {
      case 'taking_off':
        return t('simple.phTakingOff');
      case 'settling':
        return t('simple.phSettling');
      case 'uploading':
        return t('simple.phPlanning', { total });
      case 'flying':
        return t('simple.phFlying', { n: Math.min(scout.reached + 1, total), total });
      case 'landing':
        return t('simple.phLanding');
      case 'done':
        return t('simple.phDone', { done: scout.reached, total });
      case 'cancelled':
        return t('simple.phCancelled');
      default:
        return scout.message ? localizeNative(scout.message) : '…';
    }
  };

  // Which step the farmer is on.
  const step = !status?.running || !status.connected ? 1 : scouting ? 3 : showResults ? 4 : 2;

  const act = async (kind: 'connect' | 'scout' | 'stop' | 'land', fn: () => Promise<boolean>) => {
    setBusy(kind);
    setNote(null);
    const ok = await fn();
    setBusy(null);
    if (!ok) setNote(link.lastRefusal?.() ?? t('simple.somethingWrong'));
    await refresh();
  };

  const connect = () =>
    act('connect', async () => {
      // Android 13+ hides the drone notification (Stop / Land) without this.
      await requestPermission().catch(() => false);
      return (await link.connect?.()) ?? false;
    });

  const startScout = () => {
    const advice: string[] = [];
    if (!weather.ok) advice.push(t('simple.adviceWeather', { reason: weather.reason ?? '' }));
    const hour = new Date().getHours();
    if (hour < 7 || hour >= 18) advice.push(t('simple.adviceDark'));
    Alert.alert(
      t('simple.confirmTitle'),
      t('simple.confirmBody', { spots: SPOTS, spacing: SCOUT.spacingM, height: SCOUT.altitudeM }) +
        (advice.length ? '\n\n' + advice.join('\n') : ''),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('simple.go'),
          style: 'destructive',
          onPress: () => {
            setShowResults(false);
            void act('scout', async () => (await link.scout?.(SCOUT.rows, SCOUT.cols, SCOUT.spacingM)) ?? false);
          },
        },
      ]
    );
  };

  const openWifi = () => {
    if (Platform.OS === 'android') void Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => Linking.openSettings());
    else void Linking.openSettings();
  };

  // --- checklist -------------------------------------------------------------
  const battery = status?.batteryPct;
  const items: { tick: Tick; text: string; fix?: string }[] = [
    { tick: status?.connected ? 'ok' : 'bad', text: t('simple.chkConnected'), fix: t('simple.fixConnected') },
    status?.gpsFix
      ? { tick: 'ok', text: t('simple.chkLocation', { sats: status.gpsSats ?? 0 }) }
      : { tick: 'wait', text: t('simple.chkLocationWait'), fix: t('simple.fixLocation') },
    battery == null
      ? { tick: 'wait', text: t('simple.chkBatteryUnknown') }
      : battery >= GOOD_BATTERY
        ? { tick: 'ok', text: t('simple.chkBattery', { pct: battery }) }
        : battery >= MIN_BATTERY
          ? { tick: 'warn', text: t('simple.chkBatteryShort', { pct: battery }) }
          : { tick: 'bad', text: t('simple.chkBatteryLow', { pct: battery }), fix: t('simple.fixBattery') },
    weather.ok ? { tick: 'ok', text: t('simple.chkWeather') } : { tick: 'warn', text: t('simple.chkWeatherUnknown') },
    { tick: areaClear ? 'ok' : 'bad', text: t('simple.chkArea'), fix: t('simple.fixArea') },
  ];
  // Blocking only: not connected, no location, battery too low, area not confirmed.
  const blocker = items.find((i) => i.tick === 'bad' || (i.tick === 'wait' && i.fix));

  return (
    <View>
      <Steps step={step} />

      {/* 1 - Connect */}
      {step === 1 ? (
        <Card>
          <Text style={s.h}>{t('simple.connectTitle')}</Text>
          <Numbered n={1} text={t('simple.connect1')} />
          <Numbered n={2} text={t('simple.connect2')} />
          <Button title={t('simple.openWifi')} icon="wifi" size="sm" variant="secondary" onPress={openWifi} style={s.gap} />
          <Numbered n={3} text={t('simple.connect3')} />
          <Button
            title={status?.running ? t('simple.searching') : t('simple.connectButton')}
            icon="link"
            loading={busy === 'connect'}
            onPress={() => void connect()}
            style={s.bigGap}
          />
          {status?.running && !status.connected ? <Text style={s.hint}>{t('simple.notFound')}</Text> : null}
          {note ? <Text style={s.todo}>{note}</Text> : null}
        </Card>
      ) : null}

      {/* 2 - Check */}
      {step === 2 ? (
        <Card>
          <Text style={s.h}>{t('simple.checkTitle')}</Text>
          {items.map((i, k) =>
            k === items.length - 1 ? (
              <Pressable key={k} onPress={() => setAreaClear((v) => !v)} style={s.row} hitSlop={6}>
                <Ionicons name={areaClear ? 'checkbox' : 'square-outline'} size={20} color={areaClear ? colors.ok : colors.textMuted} />
                <Text style={s.rowText}>{i.text}</Text>
              </Pressable>
            ) : (
              <View key={k} style={s.row}>
                <TickIcon tick={i.tick} />
                <Text style={s.rowText}>{i.text}</Text>
              </View>
            )
          )}
          <Text style={s.hint}>{t('simple.plan', { spots: SPOTS, spacing: SCOUT.spacingM, height: SCOUT.altitudeM })}</Text>
          <Button
            title={t('simple.scoutButton')}
            icon="play"
            loading={busy === 'scout'}
            // Tappable only when safe - and when it is not, the line below says why.
            disabled={Boolean(blocker)}
            onPress={startScout}
            style={s.bigGap}
          />
          {blocker?.fix ? <Text style={s.todo}>{t('simple.doThis', { what: blocker.fix })}</Text> : null}
          {note ? <Text style={s.todo}>{note}</Text> : null}
          {finished ? (
            <Button title={t('simple.seeLastResults')} variant="ghost" size="sm" onPress={() => setShowResults(true)} style={s.gap} />
          ) : null}
        </Card>
      ) : null}

      {/* 3 - Scouting */}
      {step === 3 ? (
        <Card tone="info">
          <Text style={s.h}>{t('simple.scoutingTitle')}</Text>
          <Text style={s.progress}>{scoutLine()}</Text>
          <Bar done={scout?.reached ?? 0} total={scout?.total ?? SPOTS} />
          <Text style={s.hint}>
            {t('simple.progressLine', { done: scout?.reached ?? 0, total: scout?.total ?? SPOTS, pct: battery ?? '?' })}
          </Text>
          <Pressable
            onPress={() => void act('stop', async () => (await link.cancelScout?.()) ?? false)}
            style={({ pressed }) => [s.stop, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="hand-left" size={22} color="#fff" />
            <Text style={s.stopText}>{t('simple.stop')}</Text>
          </Pressable>
          <Text style={s.hint}>{t('simple.stopHint')}</Text>
        </Card>
      ) : null}

      {/* Land is always one tap away while the drone is up and not scouting. */}
      {status?.connected && status.airborne && step !== 3 ? (
        <Card tone="warn">
          <Text style={s.progress}>{t('simple.inAir')}</Text>
          <Button
            title={t('simple.landNow')}
            icon="arrow-down-circle"
            loading={busy === 'land'}
            onPress={() => void act('land', async () => (await link.land?.()) ?? false)}
            style={s.gap}
          />
        </Card>
      ) : null}

      {/* 4 - Results */}
      {step === 4 ? (
        <>
          <Card tone={scout?.phase === 'done' ? 'ok' : 'warn'}>
            <Text style={s.h}>{t('simple.resultsTitle')}</Text>
            <Text style={s.progress}>{scoutLine()}</Text>
            <Button title={t('simple.scoutAgain')} icon="refresh" variant="secondary" size="sm" onPress={() => setShowResults(false)} style={s.gap} />
          </Card>
          <FlightResults autoLoad />
        </>
      ) : null}
    </View>
  );
}

function Steps({ step }: { step: number }) {
  const { t } = useTranslation();
  const labels = [t('simple.step1'), t('simple.step2'), t('simple.step3'), t('simple.step4')];
  return (
    <View style={s.steps}>
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'now' : 'next';
        return (
          <View key={n} style={s.step}>
            <View style={[s.dot, state === 'now' && s.dotNow, state === 'done' && s.dotDone]}>
              {state === 'done' ? (
                <Ionicons name="checkmark" size={13} color="#fff" />
              ) : (
                <Text style={[s.dotText, state === 'now' && { color: '#fff' }]}>{n}</Text>
              )}
            </View>
            <Text style={[s.stepLabel, state === 'now' && s.stepLabelNow]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Numbered({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.row}>
      <View style={s.num}>
        <Text style={s.numText}>{n}</Text>
      </View>
      <Text style={s.rowText}>{text}</Text>
    </View>
  );
}

function TickIcon({ tick }: { tick: Tick }) {
  const map: Record<Tick, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
    ok: { name: 'checkmark-circle', color: colors.ok },
    warn: { name: 'alert-circle', color: colors.warn },
    bad: { name: 'close-circle', color: colors.danger },
    wait: { name: 'time', color: colors.textMuted },
  };
  return <Ionicons name={map[tick].name} size={20} color={map[tick].color} />;
}

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <View style={s.bar}>
      <View style={[s.barFill, { width: `${pct}%` }]} />
    </View>
  );
}

const s = StyleSheet.create({
  h: { ...typography.bodyStrong, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  rowText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 20 },
  hint: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  todo: { ...typography.small, color: colors.warn, marginTop: spacing.sm, lineHeight: 19, fontWeight: '600' },
  gap: { marginTop: spacing.sm },
  bigGap: { marginTop: spacing.lg },
  progress: { ...typography.body, color: colors.text, fontWeight: '600', lineHeight: 22 },
  num: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { fontSize: 12, fontWeight: '700', color: colors.info },
  steps: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginVertical: spacing.md },
  step: { alignItems: 'center', flex: 1 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dotNow: { backgroundColor: colors.brand, borderColor: colors.brand },
  dotDone: { backgroundColor: colors.ok, borderColor: colors.ok },
  dotText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  stepLabel: { ...typography.tiny, color: colors.textMuted, marginTop: 4 },
  stepLabelNow: { color: colors.text, fontWeight: '700' },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.border, marginTop: spacing.md, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.ok },
  stop: {
    marginTop: spacing.lg,
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stopText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
});
