import React, { useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { cropProfile, searchCrops, stageForDays } from '../config/agronomy';
import { addPlot } from '../store/slices/farmSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { Plot } from '../types';
import { AppHeader, Button, Card, Pill, Screen } from '../components/ui';
import { soilName, stageName } from '../i18n/tr';

const IRRIGATION: Array<Plot['irrigationType']> = ['drip', 'sprinkler', 'flood', 'rainfed'];
const SOILS = ['Red sandy loam', 'Clay loam', 'Black cotton soil', 'Alluvial', 'Sandy', 'Laterite'];

/** "When did you sow?" as a farmer says it, mapped to days since sowing. */
const SOWN: Array<{ key: string; days: number }> = [
  { key: 'week', days: 4 },
  { key: 'twoWeeks', days: 14 },
  { key: 'month', days: 30 },
  { key: 'twoMonths', days: 60 },
  { key: 'threeMonths', days: 90 },
  { key: 'fourMonths', days: 120 },
];
const SIZES = ['0.5', '1', '2', '5'];

/**
 * Add a field, as three short questions:
 *
 *   1. What are you growing?      (name + crop)
 *   2. When did you sow it?       (tap "about a month ago")
 *   3. How big is it, and where?  (tap a size, tap "Use my location")
 *
 * Everything has a sensible default, so a farmer can tap Next three times and
 * have a working field. Soil, irrigation and sensors are real inputs to the
 * engine but are not needed to start, so they sit under "More options".
 *
 * What the choices still decide, unchanged from the long form:
 *
 *  - **The crop** must be one we have agronomy for. `cropProfile` falls back to
 *    maize for anything unknown, so the search only ever selects a real profile.
 *  - **Sowing date** drives the crop stage, which drives every stage-dependent
 *    threshold in the engine.
 *  - **Sensors or not** decides whether sensor nodes exist at all. A field with
 *    no sensors gets none, which is what stops the engine producing risk scores
 *    for a field that has nothing measuring it.
 */
export default function FieldSetupScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const plots = useAppSelector((s) => s.farm.plots);

  const [step, setStep] = useState(1);
  const [name, setName] = useState(t('setup.defaultName', { n: plots.length + 1 }));
  const [crop, setCrop] = useState('maize');
  const [cropQuery, setCropQuery] = useState('');
  const [monitoring, setMonitoring] = useState<'sensors' | 'scouting'>('scouting');
  const [acres, setAcres] = useState('1');
  const [daysSinceSowing, setDaysSinceSowing] = useState('30');
  const [soilType, setSoilType] = useState(SOILS[0]);
  const [irrigationType, setIrrigationType] = useState<Plot['irrigationType']>('drip');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        RNAlert.alert(t('setup.locationDenied'), t('setup.locationDeniedBody'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch {
      RNAlert.alert(t('setup.locationFailed'), t('setup.locationFailedBody'));
    } finally {
      setLocating(false);
    }
  };

  const save = () => {
    const a = Math.max(0.1, parseFloat(acres) || 1);
    const das = Math.max(0, parseInt(daysSinceSowing, 10) || 0);
    const profile = cropProfile(crop);

    // Grid resolution scales with plot size so cells stay a sensible physical area.
    const dim = a < 1 ? 5 : a < 3 ? 7 : a < 6 ? 8 : 10;

    const plot: Plot = {
      id: `plot-${Date.now().toString(36)}`,
      name: name.trim() || t('setup.defaultName', { n: plots.length + 1 }),
      crop,
      areaAcres: Math.round(a * 100) / 100,
      sowingDate: new Date(Date.now() - das * 86_400_000).toISOString(),
      stage: stageForDays(profile, das),
      // Default to a simple rectangle; marking the corners later refines it.
      boundary: [
        { x: 0.1, y: 0.08 },
        { x: 0.9, y: 0.08 },
        { x: 0.9, y: 0.92 },
        { x: 0.1, y: 0.92 },
      ],
      centroid: coords ?? { lat: 11.0168, lon: 76.9558 },
      grid: { rows: dim, cols: dim },
      soilType,
      irrigationType,
      monitoring,
    };

    dispatch(addPlot(plot));
    navigation.goBack();
  };

  const stage = stageForDays(cropProfile(crop), parseInt(daysSinceSowing, 10) || 0);
  const crops = searchCrops(cropQuery);

  return (
    <Screen scroll>
      <AppHeader
        title={t('setup.title')}
        subtitle={t('setup.stepOf', { step, total: 3 })}
        onBack={() => (step > 1 ? setStep(step - 1) : navigation.goBack())}
      />

      {/* Progress */}
      <View style={s.dots}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[s.dot, n <= step && s.dotOn]} />
        ))}
      </View>

      {/* 1 - What are you growing? */}
      {step === 1 ? (
        <Card>
          <Text style={s.q}>{t('setup.q1')}</Text>

          {/* Searchable, because a farmer types the word they use - aliases
              carry dhan, gehu, kapas, tamatar, ganna, moongphali, makka. */}
          <TextInput
            style={s.input}
            value={cropQuery}
            onChangeText={setCropQuery}
            placeholder={t('setup.cropSearch')}
            placeholderTextColor={colors.textFaint}
            autoCorrect={false}
          />
          <View style={s.wrapRow}>
            {crops.map((p) => (
              <Pill key={p.key} label={p.label} active={crop === p.key} onPress={() => setCrop(p.key)} />
            ))}
          </View>
          {/* An empty result is told the truth: picking a near-enough crop would
              quietly apply the wrong advice to the field. */}
          {crops.length === 0 ? (
            <View style={s.noteRow}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.warn} />
              <Text style={s.noteText}>{t('setup.cropNotFound', { query: cropQuery.trim() })}</Text>
            </View>
          ) : null}

          <Text style={s.label}>{t('setup.fieldName')}</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholderTextColor={colors.textFaint}
            maxLength={30}
          />
          <Text style={s.help}>{t('setup.nameHelp')}</Text>
        </Card>
      ) : null}

      {/* 2 - When did you sow it? */}
      {step === 2 ? (
        <Card>
          <Text style={s.q}>{t('setup.q2', { crop: cropProfile(crop).label })}</Text>
          <View style={s.wrapRow}>
            {SOWN.map((o) => (
              <Pill
                key={o.key}
                label={t(`setup.sown_${o.key}`)}
                active={daysSinceSowing === String(o.days)}
                onPress={() => setDaysSinceSowing(String(o.days))}
              />
            ))}
          </View>

          <Text style={s.label}>{t('setup.orExactDays')}</Text>
          <View style={s.inlineRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={daysSinceSowing}
              onChangeText={(v) => setDaysSinceSowing(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
            <Text style={s.suffix}>{t('setup.daysAgo')}</Text>
          </View>
          <Text style={s.help}>{t('setup.stageNow', { stage: stageName(stage) })}</Text>
        </Card>
      ) : null}

      {/* 3 - How big is it, and where? */}
      {step === 3 ? (
        <>
          <Card>
            <Text style={s.q}>{t('setup.q3')}</Text>
            <View style={s.wrapRow}>
              {SIZES.map((sz) => (
                <Pill key={sz} label={`${sz} ${t('fields.acre')}`} active={acres === sz} onPress={() => setAcres(sz)} />
              ))}
            </View>
            <Text style={s.label}>{t('setup.orExactSize')}</Text>
            <View style={s.inlineRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={acres}
                onChangeText={(v) => setAcres(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
              />
              <Text style={s.suffix}>{t('fields.acre')}</Text>
            </View>
            <Text style={s.help}>{t('setup.sizeHelp')}</Text>
          </Card>

          <Card>
            <Text style={s.q}>{t('setup.qWhere')}</Text>
            <Text style={s.help}>{t('setup.locationHelp')}</Text>
            {coords ? (
              <View style={s.noteRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.ok} />
                <Text style={[s.noteText, { color: colors.ok, fontWeight: '700' }]}>{t('setup.locationSaved')}</Text>
              </View>
            ) : null}
            <Button
              title={coords ? t('setup.updateLocation') : t('setup.useMyLocation')}
              icon="navigate"
              variant={coords ? 'secondary' : 'primary'}
              onPress={() => void useMyLocation()}
              loading={locating}
              style={{ marginTop: spacing.md }}
            />
          </Card>

          {/* Real inputs, but none is needed to start. */}
          <Pressable style={s.moreToggle} onPress={() => setShowMore((v) => !v)}>
            <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={colors.brandLight} />
            <Text style={s.moreToggleText}>{showMore ? t('setup.lessOptions') : t('setup.moreOptions')}</Text>
          </Pressable>

          {showMore ? (
            <Card>
              <Text style={s.label}>{t('setup.monitoring')}</Text>
              <Choice
                active={monitoring === 'scouting'}
                onPress={() => setMonitoring('scouting')}
                title={t('setup.modeScoutTitle')}
                body={t('setup.modeScoutBody')}
              />
              <Choice
                active={monitoring === 'sensors'}
                onPress={() => setMonitoring('sensors')}
                title={t('setup.modeSensorTitle')}
                body={t('setup.modeSensorBody')}
              />

              <Text style={s.label}>{t('fields.soil')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
                {SOILS.map((sl) => (
                  <Pill key={sl} label={soilName(sl)} active={soilType === sl} onPress={() => setSoilType(sl)} />
                ))}
              </ScrollView>

              <Text style={s.label}>{t('fields.irrigation')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
                {IRRIGATION.map((ir) => (
                  <Pill
                    key={ir}
                    label={t(`setup.irrigation_${ir}`)}
                    active={irrigationType === ir}
                    onPress={() => setIrrigationType(ir)}
                  />
                ))}
              </ScrollView>
            </Card>
          ) : null}
        </>
      ) : null}

      <View style={s.nav}>
        {step < 3 ? (
          <Button title={t('common.next')} icon="arrow-forward" onPress={() => setStep(step + 1)} size="lg" />
        ) : (
          <Button title={t('setup.save')} icon="checkmark" onPress={save} size="lg" />
        )}
      </View>
    </Screen>
  );
}

function Choice({ active, onPress, title, body }: { active: boolean; onPress: () => void; title: string; body: string }) {
  return (
    <Pressable onPress={onPress} style={[s.choice, active && s.choiceOn]}>
      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.brand : colors.textFaint} />
      <View style={{ flex: 1 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        <Text style={s.choiceBody}>{body}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  dot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.brand },
  q: { fontSize: 19, fontWeight: '800', color: colors.text, lineHeight: 25, marginBottom: spacing.md },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '700', marginTop: spacing.lg, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    ...typography.bodyStrong,
    color: colors.text,
  },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  suffix: { ...typography.small, color: colors.textMuted, minWidth: 64 },
  pillRow: { paddingVertical: 2, paddingRight: spacing.lg },
  help: { ...typography.tiny, color: colors.textMuted, marginTop: 8, lineHeight: 16 },
  noteRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.md },
  noteText: { ...typography.tiny, color: colors.warn, flex: 1, lineHeight: 16 },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  moreToggleText: { ...typography.small, color: colors.brandLight, fontWeight: '700' },
  choice: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  choiceOn: { borderColor: colors.brand, backgroundColor: colors.surfaceAlt },
  choiceTitle: { ...typography.bodyStrong, color: colors.text },
  choiceBody: { ...typography.tiny, color: colors.textMuted, marginTop: 3, lineHeight: 16 },
  nav: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
});
