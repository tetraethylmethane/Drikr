import React, { useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { cropProfile, searchCrops, stageForDays } from '../config/agronomy';
import indianDistricts from '../config/indianDistricts';
import { addPlot } from '../store/slices/farmSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { Plot } from '../types';
import { AppHeader, Badge, Button, Card, Pill, Screen, SectionTitle } from '../components/ui';

const IRRIGATION: Array<Plot['irrigationType']> = ['drip', 'sprinkler', 'flood', 'rainfed'];
const SOILS = ['Red sandy loam', 'Clay loam', 'Black cotton soil', 'Alluvial', 'Sandy', 'Laterite'];

/**
 * Add a field.
 *
 * Sowing date drives the crop stage, which drives every stage-dependent threshold in
 * the engine — so it is asked for as days-since-sowing, which a farmer knows, rather
 * than a calendar picker they have to work out.
 *
 * Two things here decide what the rest of the app is allowed to claim about this
 * field:
 *
 *  - **The crop** must be one we actually have agronomy for. `cropProfile` falls
 *    back to maize for anything unknown, so letting a farmer type a crop we do
 *    not model would score their field against maize's moisture floors without
 *    ever saying so. The search box only ever selects a real profile.
 *  - **The monitoring mode** decides whether sensor nodes exist at all. A
 *    `scouting` field gets none, which is what stops the engine producing risk
 *    scores for a field that has nothing measuring it — the absence of nodes is
 *    the mechanism, not a UI flag.
 */
export default function FieldSetupScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const plots = useAppSelector((s) => s.farm.plots);

  const [name, setName] = useState(`Plot ${String.fromCharCode(65 + plots.length)}${plots.length + 1}`);
  const [crop, setCrop] = useState('maize');
  const [cropQuery, setCropQuery] = useState('');
  const [monitoring, setMonitoring] = useState<'sensors' | 'scouting'>('scouting');
  const [acres, setAcres] = useState('2');
  const [daysSinceSowing, setDaysSinceSowing] = useState('30');
  const [soilType, setSoilType] = useState(SOILS[0]);
  const [irrigationType, setIrrigationType] = useState<Plot['irrigationType']>('drip');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);

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
      name: name.trim() || 'New Plot',
      crop,
      areaAcres: Math.round(a * 100) / 100,
      sowingDate: new Date(Date.now() - das * 86_400_000).toISOString(),
      stage: stageForDays(profile, das),
      // Default to a simple rectangle; a boundary walk can refine it later.
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

  return (
    <Screen scroll>
      <AppHeader title={t('setup.title')} subtitle={t('setup.subtitle')} onBack={() => navigation.goBack()} />

      <Card>
        <Label text={t('setup.fieldName')} icon="pricetag" />
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Plot A3"
          placeholderTextColor={colors.textFaint}
          maxLength={30}
        />

        <Label text={t('setup.area')} icon="resize" />
        <View style={s.inlineRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={acres}
            onChangeText={(v) => setAcres(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
          />
          <Text style={s.suffix}>{t('fields.acre')}</Text>
        </View>
      </Card>

      {/* Crop */}
      <SectionTitle title={t('setup.crop')} icon="leaf" />
      <Card>
        {/* Searchable, because a pill row does not scale and because a farmer
            types the word they use — aliases carry dhan, gehu, kapas, tamatar,
            ganna, moongphali, makka. */}
        <TextInput
          style={s.input}
          value={cropQuery}
          onChangeText={setCropQuery}
          placeholder={t('setup.cropSearch')}
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
          {searchCrops(cropQuery).map((p) => (
            <Pill key={p.key} label={p.label} active={crop === p.key} onPress={() => setCrop(p.key)} />
          ))}
        </ScrollView>
        {/* An empty result is told the truth rather than left looking broken.
            Picking a near-enough crop would silently apply the wrong thresholds,
            so the honest answer is that we do not have it yet. */}
        {searchCrops(cropQuery).length === 0 ? (
          <View style={s.noCropRow}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.warn} />
            <Text style={s.noCropText}>{t('setup.cropNotFound', { query: cropQuery.trim() })}</Text>
          </View>
        ) : null}

        <Label text={t('setup.daysSinceSowing')} icon="calendar" />
        <View style={s.inlineRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={daysSinceSowing}
            onChangeText={(v) => setDaysSinceSowing(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />
          <Badge label={stage} tone="info" />
        </View>
        <Text style={s.help}>{t('setup.stageHelp')}</Text>
      </Card>

      {/* How this field gets watched. Both modes are real; neither is a
          downgrade, and the difference is where the drone is sent. */}
      <SectionTitle title={t('setup.monitoring')} icon="eye" />
      <ModeCard
        active={monitoring === 'scouting'}
        onPress={() => setMonitoring('scouting')}
        icon="scan"
        title={t('setup.modeScoutTitle')}
        body={t('setup.modeScoutBody')}
        points={[t('setup.modeScoutP1'), t('setup.modeScoutP2'), t('setup.modeScoutP3')]}
      />
      <ModeCard
        active={monitoring === 'sensors'}
        onPress={() => setMonitoring('sensors')}
        icon="hardware-chip"
        title={t('setup.modeSensorTitle')}
        body={t('setup.modeSensorBody')}
        points={[t('setup.modeSensorP1'), t('setup.modeSensorP2'), t('setup.modeSensorP3')]}
      />

      {/* Soil & irrigation */}
      <SectionTitle title={t('setup.soilIrrigation')} icon="water" />
      <Card>
        <Label text={t('fields.soil')} icon="layers" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
          {SOILS.map((sl) => (
            <Pill key={sl} label={sl} active={soilType === sl} onPress={() => setSoilType(sl)} />
          ))}
        </ScrollView>

        <Label text={t('fields.irrigation')} icon="water" />
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

      {/* Location */}
      <SectionTitle title={t('setup.location')} icon="location" />
      <Card>
        <Text style={s.help}>{t('setup.locationHelp')}</Text>
        {coords ? (
          <View style={s.coordRow}>
            <Ionicons name="checkmark-circle" size={17} color={colors.ok} />
            <Text style={s.coordText}>
              {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
            </Text>
          </View>
        ) : null}
        <Button
          title={coords ? t('setup.updateLocation') : t('setup.useMyLocation')}
          icon="navigate"
          variant="secondary"
          onPress={() => void useMyLocation()}
          loading={locating}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      {/* Node provisioning notice */}
      <Card tone="info">
        <View style={s.noticeRow}>
          <Ionicons name="hardware-chip" size={17} color={colors.info} />
          <Text style={s.noticeText}>{t('setup.nodeNotice')}</Text>
        </View>
      </Card>

      <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
        <Button title={t('setup.save')} icon="checkmark" onPress={save} size="lg" />
      </View>
    </Screen>
  );
}

function Label({ text, icon }: { text: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.labelRow}>
      <Ionicons name={icon} size={14} color={colors.brandLight} />
      <Text style={s.label}>{text}</Text>
    </View>
  );
}

function ModeCard({
  active,
  onPress,
  icon,
  title,
  body,
  points,
}: {
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  points: string[];
}) {
  return (
    <Card onPress={onPress} tone={active ? 'info' : undefined}>
      <View style={s.modeTop}>
        <Ionicons name={icon} size={20} color={active ? colors.info : colors.textMuted} />
        <Text style={[s.modeTitle, active ? { color: colors.text } : null]}>{title}</Text>
        <Ionicons
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={19}
          color={active ? colors.info : colors.border}
        />
      </View>
      <Text style={s.modeBody}>{body}</Text>
      {points.map((p, i) => (
        <View key={i} style={s.modePointRow}>
          <Ionicons name="ellipse" size={5} color={colors.textFaint} />
          <Text style={s.modePointText}>{p}</Text>
        </View>
      ))}
    </Card>
  );
}

const s = StyleSheet.create({
  modeTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  modeTitle: { ...typography.h3, color: colors.textMuted, flex: 1 },
  modeBody: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm },
  modePointRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  modePointText: { ...typography.tiny, color: colors.textMuted, flex: 1, lineHeight: 16 },
  noCropRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  noCropText: { ...typography.tiny, color: colors.warn, flex: 1, lineHeight: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.md, marginBottom: 6 },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    ...typography.bodyStrong,
    color: colors.text,
  },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  suffix: { ...typography.small, color: colors.textMuted, minWidth: 48 },
  pillRow: { paddingVertical: 2, paddingRight: spacing.lg },
  help: { ...typography.tiny, color: colors.textFaint, marginTop: 6, lineHeight: 16 },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  coordText: { ...typography.small, color: colors.text, fontWeight: '600' },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noticeText: { ...typography.tiny, color: colors.info, flex: 1, lineHeight: 16 },
});
