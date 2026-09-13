import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  ANALOG_CHANNELS,
  AnalogChannelKey,
  registerCalibration,
  resolveChannel,
} from '../config/calibration';
import {
  MasterNode,
  MasterStatus,
  fetchNodes,
  fetchStatus,
  registerMasterAddress,
} from '../services/hardware';
import { useLanguage } from '../hooks/useLanguage';
import { useVoice } from '../hooks/useVoice';
import { selectPlot } from '../store/slices/farmSlice';
import {
  setChannelCalibration,
  setMasterAddress,
  setSensorsPaired,
} from '../store/slices/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { AppHeader, Badge, Button, Card, Divider, Screen } from '../components/ui';

/**
 * Guided hardware pairing.
 *
 * Four rules this screen follows, because a farmer is not going to debug mDNS:
 *
 *  - Never ask for something the app can find out. Discovery runs first and the
 *    manual address field only appears once it has failed.
 *  - No jargon in the instructions. "SSID", "mDNS" and "IP" appear only in the
 *    troubleshooting detail, never in a step.
 *  - Every step is skippable. Someone who abandons setup halfway still lands in
 *    a working app on simulated data, which is labelled as simulated.
 *  - Read aloud on demand, consistent with the voice-first intent.
 *
 * The provisioning step is instructional rather than automatic because Android
 * 10+ will not let an app silently join another network. It hands off to the
 * firmware's own captive portal on Drikr_Setup, which serves a network picker -
 * so the farmer never types an SSID by hand and never edits firmware.
 */

type Step = 'power' | 'firstTime' | 'provision' | 'find' | 'nodes' | 'calibrate' | 'done';

const SETUP_AP_URL = 'http://192.168.1.1';

export default function SensorSetupScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { speak } = useVoice({ language });

  const plots = useAppSelector((s) => s.farm.plots);
  const savedAddress = useAppSelector((s) => s.settings.masterAddress);
  const savedCalibration = useAppSelector((s) => s.settings.calibration);

  const [step, setStep] = useState<Step>('power');
  const [address, setAddress] = useState(savedAddress ?? 'drikr.local');
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<MasterStatus | null>(null);
  const [nodes, setNodes] = useState<MasterNode[]>([]);
  const [findError, setFindError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [plotId, setPlotId] = useState<string | null>(plots[0]?.id ?? null);
  const [showHelp, setShowHelp] = useState(false);

  // Calibration wizard state: which channel, and the two recorded points.
  const [calChannel, setCalChannel] = useState<AnalogChannelKey | null>(null);
  const [calLow, setCalLow] = useState('');
  const [calHigh, setCalHigh] = useState('');

  /**
   * Try the address, then confirm it is actually a Drikr master.
   *
   * The identity check matters: without it a stale address pointing at a router
   * or a printer would have its JSON interpreted as field readings.
   */
  const findMaster = useCallback(
    async (candidate: string) => {
      setSearching(true);
      setFindError(null);
      registerMasterAddress(candidate);

      const found = await fetchStatus();
      if (!found) {
        setSearching(false);
        setFindError(t('setup.notFound'));
        setShowManual(true);
        // Leave the previous address registered rather than a bad one.
        registerMasterAddress(savedAddress ?? null);
        return false;
      }

      const nodeList = (await fetchNodes()) ?? [];
      setStatus(found);
      setNodes(nodeList);
      setSearching(false);

      dispatch(setMasterAddress(candidate));
      setStep('nodes');
      return true;
    },
    [dispatch, savedAddress, t]
  );

  const fittedList = useMemo(
    () => (Object.keys(ANALOG_CHANNELS) as AnalogChannelKey[]).map((k) => ({ key: k, ch: resolveChannel(k) })),
    [savedCalibration]
  );

  const saveCalibration = useCallback(() => {
    if (!calChannel) return;
    const lowV = parseFloat(calLow);
    const highV = parseFloat(calHigh);
    const base = ANALOG_CHANNELS[calChannel];

    // Both readings are needed, and they must differ or the curve has no slope
    // and every reading would collapse to one value.
    if (!Number.isFinite(lowV) || !Number.isFinite(highV) || lowV === highV) {
      return;
    }

    const points = { at: [lowV, highV] as [number, number], to: base.points.to };
    const next = {
      ...savedCalibration,
      [calChannel]: { fitted: true, points },
    };
    dispatch(setChannelCalibration({ channel: calChannel, fitted: true, points }));
    registerCalibration(next);

    setCalChannel(null);
    setCalLow('');
    setCalHigh('');
  }, [calChannel, calLow, calHigh, savedCalibration, dispatch]);

  const finish = () => {
    dispatch(setSensorsPaired(true));
    if (plotId) dispatch(selectPlot(plotId));
    setStep('done');
  };

  const stepIndex: Record<Step, number> = {
    power: 1, firstTime: 2, provision: 3, find: 4, nodes: 5, calibrate: 6, done: 7,
  };

  const readAloud = (key: string) => speak(t(key));

  return (
    <Screen scroll>
      <AppHeader
        title={t('setup.connectTitle')}
        subtitle={t('setup.stepOf', { step: stepIndex[step], total: 7 })}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => setShowHelp((v) => !v)} hitSlop={10} accessibilityLabel={t('setup.help')}>
            <Ionicons name="help-circle-outline" size={22} color={colors.textMuted} />
          </Pressable>
        }
      />

      {/* ---------------------------------------------------------------- 1. Power on */}
      {step === 'power' ? (
        <Card>
          <StepHeading icon="power" title={t('setup.s1Title')} onSpeak={() => readAloud('setup.s1Body')} />
          <Text style={s.body}>{t('setup.s1Body')}</Text>
          <Button title={t('common.next')} icon="arrow-forward" onPress={() => setStep('firstTime')} style={s.action} />
          <SkipLink label={t('setup.skipAll')} onPress={() => navigation.goBack()} />
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- 2. First time? */}
      {step === 'firstTime' ? (
        <Card>
          <StepHeading icon="help-buoy" title={t('setup.s2Title')} onSpeak={() => readAloud('setup.s2Body')} />
          <Text style={s.body}>{t('setup.s2Body')}</Text>
          <Button title={t('setup.s2First')} icon="wifi" onPress={() => setStep('provision')} style={s.action} />
          <Button
            title={t('setup.s2Already')}
            icon="checkmark"
            variant="secondary"
            onPress={() => setStep('find')}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- 3. Give it your WiFi */}
      {step === 'provision' ? (
        <Card>
          <StepHeading icon="wifi" title={t('setup.s3Title')} onSpeak={() => readAloud('setup.s3Body')} />
          <Text style={s.body}>{t('setup.s3Body')}</Text>

          <View style={s.numbered}>
            <NumberedLine n={1} text={t('setup.s3Step1')} />
            <NumberedLine n={2} text={t('setup.s3Step2')} />
            <NumberedLine n={3} text={t('setup.s3Step3')} />
          </View>

          <Button
            title={t('setup.openWifiSettings')}
            icon="settings"
            variant="secondary"
            onPress={() => {
              // Deep-link to the OS WiFi picker. Android 10+ will not let an app
              // join a network on the farmer's behalf, so this is as far as
              // automation can honestly go.
              if (Platform.OS === 'android') Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => undefined);
              else Linking.openURL('App-Prefs:WIFI').catch(() => undefined);
            }}
            style={s.action}
          />
          <Button
            title={t('setup.openSetupPage')}
            icon="globe"
            variant="secondary"
            onPress={() => Linking.openURL(SETUP_AP_URL).catch(() => undefined)}
            style={{ marginTop: spacing.sm }}
          />
          <Text style={s.hint}>{t('setup.s3Hint')}</Text>

          <Divider style={{ marginVertical: spacing.lg }} />

          {/* Recovery, surfaced here rather than buried in help: this is the
              step where a farmer with a previously-configured box gets stuck. */}
          <Text style={s.label}>{t('setup.resetWifi')}</Text>
          <Text style={s.hint}>{t('setup.resetWifiBody')}</Text>

          <Button
            title={t('setup.s3Done')}
            icon="arrow-forward"
            onPress={() => setStep('find')}
            style={s.action}
          />
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- 4. Find the box */}
      {step === 'find' ? (
        <Card>
          <StepHeading icon="search" title={t('setup.s4Title')} onSpeak={() => readAloud('setup.s4Body')} />
          <Text style={s.body}>{t('setup.s4Body')}</Text>

          <Button
            title={searching ? t('setup.searching') : t('setup.searchNow')}
            icon="search"
            loading={searching}
            onPress={() => void findMaster(address)}
            style={s.action}
          />

          {findError ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={15} color={colors.danger} />
              <Text style={s.errorText}>{findError}</Text>
            </View>
          ) : null}

          {showManual ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={s.label}>{t('setup.addressLabel')}</Text>
              <TextInput
                style={s.input}
                value={address}
                onChangeText={setAddress}
                placeholder="drikr.local"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={s.hint}>{t('setup.addressHint')}</Text>
            </View>
          ) : null}

          <SkipLink label={t('setup.skipUseSimulated')} onPress={() => navigation.goBack()} />
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- 5. Confirm nodes */}
      {step === 'nodes' && status ? (
        <>
          <Card tone="ok">
            <View style={s.foundRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.ok} />
              <View style={{ flex: 1 }}>
                <Text style={s.foundTitle}>{t('setup.foundTitle')}</Text>
                <Text style={s.hint}>
                  {status.mode === 'station' ? t('nodes.modeStation') : t('nodes.modeAp')} · {status.ip}
                </Text>
              </View>
            </View>
          </Card>

          <Card>
            <StepHeading icon="hardware-chip" title={t('setup.s5Title')} onSpeak={() => readAloud('setup.s5Body')} />
            <Text style={s.body}>
              {nodes.length > 0
                ? t('setup.s5Body', { count: nodes.length })
                : t('setup.s5NoNodes')}
            </Text>

            {nodes.map((n) => (
              <View key={n.id} style={s.nodeRow}>
                <Ionicons
                  name={n.online ? 'radio' : 'radio-outline'}
                  size={17}
                  color={n.online ? colors.ok : colors.warn}
                />
                <Text style={s.nodeName}>{n.id}</Text>
                <Badge
                  label={n.online ? t('nodes.statusOnline') : t('nodes.statusOffline')}
                  tone={n.online ? 'ok' : 'warn'}
                />
              </View>
            ))}

            {plots.length > 0 ? (
              <>
                <Text style={[s.label, { marginTop: spacing.lg }]}>{t('setup.whichField')}</Text>
                <View style={s.plotRow}>
                  {plots.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setPlotId(p.id)}
                      style={({ pressed }) => [
                        s.plotChip,
                        plotId === p.id && s.plotChipActive,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text style={[s.plotChipText, plotId === p.id && { color: '#fff' }]}>{p.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Button
              title={t('common.next')}
              icon="arrow-forward"
              onPress={() => setStep('calibrate')}
              style={s.action}
            />
          </Card>
        </>
      ) : null}

      {/* ---------------------------------------------------------------- 6. Calibrate probes */}
      {step === 'calibrate' ? (
        <Card>
          <StepHeading icon="options" title={t('setup.s6Title')} onSpeak={() => readAloud('setup.s6Body')} />
          <Text style={s.body}>{t('setup.s6Body')}</Text>

          {calChannel === null ? (
            <>
              {fittedList.map(({ key, ch }) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    setCalChannel(key);
                    setCalLow(String(ch.points.at[0]));
                    setCalHigh(String(ch.points.at[1]));
                  }}
                  style={({ pressed }) => [s.probeRow, pressed && { opacity: 0.75 }]}
                >
                  <Ionicons
                    name={ch.fitted ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={ch.fitted ? colors.ok : colors.textFaint}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.probeName}>{ch.label}</Text>
                    <Text style={s.hint}>
                      {ch.fitted ? t('setup.probeCalibrated') : t('setup.probeNotFitted')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
                </Pressable>
              ))}

              <Text style={s.hint}>{t('setup.s6SkipNote')}</Text>
              <Button title={t('common.next')} icon="arrow-forward" onPress={finish} style={s.action} />
            </>
          ) : (
            <>
              <Text style={s.probeName}>{resolveChannel(calChannel).label}</Text>

              <Text style={[s.label, { marginTop: spacing.md }]}>{t('setup.calLowLabel')}</Text>
              <Text style={s.hint}>{t('setup.calLowHint')}</Text>
              <TextInput
                style={s.input}
                value={calLow}
                onChangeText={(v) => setCalLow(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="2.80"
                placeholderTextColor={colors.textFaint}
              />

              <Text style={[s.label, { marginTop: spacing.md }]}>{t('setup.calHighLabel')}</Text>
              <Text style={s.hint}>{t('setup.calHighHint')}</Text>
              <TextInput
                style={s.input}
                value={calHigh}
                onChangeText={(v) => setCalHigh(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="1.20"
                placeholderTextColor={colors.textFaint}
              />

              <Text style={s.hint}>{t('setup.calBothNeeded')}</Text>

              <View style={s.calActions}>
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  onPress={() => setCalChannel(null)}
                  style={{ flex: 1 }}
                />
                <Button
                  title={t('common.save')}
                  icon="checkmark"
                  onPress={saveCalibration}
                  disabled={!calLow || !calHigh || calLow === calHigh}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- 7. Done */}
      {step === 'done' ? (
        <Card tone="ok">
          <StepHeading icon="checkmark-done" title={t('setup.s7Title')} onSpeak={() => readAloud('setup.s7Body')} />
          <Text style={s.body}>{t('setup.s7Body')}</Text>
          <Button
            title={t('setup.viewField')}
            icon="leaf"
            onPress={() => navigation.navigate('MainTabs')}
            style={s.action}
          />
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- Troubleshooting */}
      {showHelp ? (
        <Card>
          <Text style={s.helpTitle}>{t('setup.helpTitle')}</Text>
          <HelpRow q={t('setup.helpQ1')} a={t('setup.helpA1')} />
          <HelpRow q={t('setup.helpQ2')} a={t('setup.helpA2')} />
          <HelpRow q={t('setup.helpQ3')} a={t('setup.helpA3')} />
          <HelpRow q={t('setup.helpQ4')} a={t('setup.helpA4')} />
          <HelpRow q={t('setup.helpQ5')} a={t('setup.helpA5')} />
        </Card>
      ) : null}
    </Screen>
  );
}

function StepHeading({
  icon,
  title,
  onSpeak,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onSpeak: () => void;
}) {
  return (
    <View style={s.headingRow}>
      <View style={s.headingIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <Text style={s.headingText}>{title}</Text>
      <Pressable onPress={onSpeak} hitSlop={10} accessibilityLabel="Read aloud">
        <Ionicons name="volume-medium-outline" size={19} color={colors.brandLight} />
      </Pressable>
    </View>
  );
}

function NumberedLine({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.numberedRow}>
      <View style={s.numberBubble}>
        <Text style={s.numberText}>{n}</Text>
      </View>
      <Text style={s.numberedText}>{text}</Text>
    </View>
  );
}

function SkipLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.skip} hitSlop={8}>
      <Text style={s.skipText}>{label}</Text>
    </Pressable>
  );
}

function HelpRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen((v) => !v)} style={s.helpRow}>
      <View style={s.helpQRow}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.textMuted} />
        <Text style={s.helpQ}>{q}</Text>
      </View>
      {open ? <Text style={s.helpA}>{a}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headingIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingText: { ...typography.h3, color: colors.text, flex: 1 },
  body: { ...typography.body, color: colors.text, lineHeight: 22, marginTop: spacing.md },
  hint: { ...typography.tiny, color: colors.textMuted, marginTop: 5, lineHeight: 16 },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '700' },
  action: { marginTop: spacing.lg },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginTop: 6,
    ...typography.bodyStrong,
    color: colors.text,
  },
  numbered: { marginTop: spacing.lg, gap: spacing.md },
  numberedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  numberBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  numberedText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 21 },
  errorBox: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerBg,
  },
  errorText: { ...typography.small, color: colors.danger, flex: 1, lineHeight: 18 },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  foundTitle: { ...typography.bodyStrong, color: colors.ok },
  nodeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  nodeName: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  plotRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  plotChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  plotChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  plotChipText: { ...typography.small, color: colors.text, fontWeight: '600' },
  probeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  probeName: { ...typography.bodyStrong, color: colors.text },
  calActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  skip: { alignSelf: 'center', marginTop: spacing.lg, paddingVertical: 6 },
  skipText: { ...typography.small, color: colors.textMuted, textDecorationLine: 'underline' },
  helpTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  helpRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  helpQRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  helpQ: { ...typography.small, color: colors.text, fontWeight: '700', flex: 1 },
  helpA: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginTop: 6, paddingLeft: 21 },
});
