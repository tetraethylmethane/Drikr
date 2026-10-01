import React, { useEffect, useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useVoice } from '../hooks/useVoice';
import { useLanguage } from '../hooks/useLanguage';
import { normaliseNumber, requestSmsPermission, smsAvailable } from '../services/smsAlerts';
import { requestSensorKit } from '../services/sync';
import { setSetupDone, setSharePhotos, setSmsNumbers } from '../store/slices/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { Button, Screen } from '../components/ui';

type Step = 'field' | 'sensors' | 'sms' | 'photos' | 'voice';
const STEPS: Step[] = ['field', 'sensors', 'sms', 'photos', 'voice'];
const ICON: Record<Step, keyof typeof Ionicons.glyphMap> = {
  field: 'map',
  sensors: 'gift',
  sms: 'chatbubble-ellipses',
  photos: 'images',
  voice: 'mic',
};

/**
 * Right after sign-up: five questions, one per screen, each read aloud.
 *
 * Field, free sensor kit, family SMS, photo sharing for the crop AI, and how
 * to talk to the app. Every step can be skipped - nothing here is required to
 * use Drikr - and anything skipped is offered again from Home.
 */
export default function GuidedSetupScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const autoSpeak = useAppSelector((s) => s.settings.autoSpeak);
  const { plots, usingDemoFarm } = useAppSelector((s) => s.farm);
  const profile = useAppSelector((s) => s.user.profile);
  const hasField = !usingDemoFarm && plots.length > 0;

  const [i, setI] = useState(0);
  const [sms, setSms] = useState('');
  const [busy, setBusy] = useState(false);
  const step = STEPS[i];
  const { speak, stopSpeaking } = useVoice({ language });

  const title = t(`setup2.${step}Title`);
  const body = t(`setup2.${step}Body`);

  // Read each step aloud as it appears.
  useEffect(() => {
    if (autoSpeak) speak(`${title}. ${body}`);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, language]);

  // Coming back from Add Field with a field saved moves straight on.
  useEffect(() => {
    if (step === 'field' && hasField) setI(1);
  }, [step, hasField]);

  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : finish());
  const finish = () => {
    stopSpeaking();
    dispatch(setSetupDone(true));
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  const askKit = async () => {
    setBusy(true);
    const plot = plots[0];
    const ok = await requestSensorKit({
      phone: profile?.phoneNumber,
      name: profile?.name,
      district: profile?.district,
      plotId: hasField ? plot?.id : undefined,
      plotName: hasField ? plot?.name : undefined,
      acres: hasField ? plot?.areaAcres : undefined,
      crop: hasField ? plot?.crop : undefined,
      lat: hasField ? plot?.centroid?.lat : undefined,
      lon: hasField ? plot?.centroid?.lon : undefined,
    });
    setBusy(false);
    // Warn, never block: a failed request can be sent again from Home.
    RNAlert.alert(t('kit.title'), ok ? t('kit.sent') : t('kit.failed'));
    next();
  };

  const saveSms = async () => {
    const n = normaliseNumber(sms);
    if (!n) {
      RNAlert.alert(t('sms.title'), t('sms.bad', { n: sms }));
      return;
    }
    if (smsAvailable() && !(await requestSmsPermission())) {
      RNAlert.alert(t('sms.title'), t('sms.noPermission'));
    }
    dispatch(setSmsNumbers([n]));
    next();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={s.top}>
        <View style={s.dots}>
          {STEPS.map((st, k) => (
            <View key={st} style={[s.dot, k <= i && s.dotOn]} />
          ))}
        </View>
        <Pressable onPress={finish} hitSlop={10}>
          <Text style={s.skipAll}>{t('setup2.skipAll')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.iconWrap}>
          <Ionicons name={ICON[step]} size={44} color={colors.brand} />
        </View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.body}>{body}</Text>
        <Pressable onPress={() => speak(`${title}. ${body}`)} style={s.listen} hitSlop={8}>
          <Ionicons name="volume-high" size={18} color={colors.brand} />
          <Text style={s.listenText}>{t('setup2.listen')}</Text>
        </Pressable>

        {step === 'sms' ? (
          <TextInput
            value={sms}
            onChangeText={setSms}
            placeholder={t('sms.placeholder')}
            placeholderTextColor={colors.textFaint}
            keyboardType="phone-pad"
            style={s.input}
          />
        ) : null}
      </ScrollView>

      <View style={s.actions}>
        {step === 'field' ? (
          <>
            <Button title={t('setup2.fieldGo')} icon="add-circle" size="lg" onPress={() => navigation.navigate('FieldSetup')} />
            <Button title={t('setup2.later')} variant="secondary" onPress={next} style={s.gap} />
          </>
        ) : null}
        {step === 'sensors' ? (
          <>
            <Button title={t('kit.request')} icon="gift" size="lg" loading={busy} onPress={() => void askKit()} />
            <Button title={t('kit.haveSensors')} variant="secondary" onPress={() => { next(); navigation.navigate('SensorSetup'); }} style={s.gap} />
            <Button title={t('setup2.later')} variant="ghost" onPress={next} style={s.gap} />
          </>
        ) : null}
        {step === 'sms' ? (
          <>
            <Button title={t('sms.save')} icon="save" size="lg" disabled={!sms.trim()} onPress={() => void saveSms()} />
            <Button title={t('setup2.later')} variant="secondary" onPress={next} style={s.gap} />
          </>
        ) : null}
        {step === 'photos' ? (
          <>
            <Button
              title={t('setup2.photosYes')}
              icon="checkmark"
              size="lg"
              onPress={() => {
                dispatch(setSharePhotos(true));
                next();
              }}
            />
            <Button
              title={t('setup2.photosNo')}
              variant="secondary"
              onPress={() => {
                dispatch(setSharePhotos(false));
                next();
              }}
              style={s.gap}
            />
          </>
        ) : null}
        {step === 'voice' ? <Button title={t('setup2.start')} icon="arrow-forward" size="lg" onPress={finish} /> : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 22, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.brand },
  skipAll: { ...typography.small, color: colors.textMuted, fontWeight: '700' },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xl, alignItems: 'center' },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brand + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginTop: spacing.xl },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, lineHeight: 23, fontSize: 16 },
  listen: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.lg },
  listenText: { ...typography.small, color: colors.brand, fontWeight: '700' },
  input: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  actions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  gap: { marginTop: spacing.sm },
});
