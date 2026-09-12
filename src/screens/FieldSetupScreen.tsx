import React, { useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { CROPS, CROP_KEYS, cropProfile, stageForDays } from '../config/agronomy';
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
 * Four sensor nodes are provisioned automatically to match the deck's BOM.
 */
export default function FieldSetupScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const plots = useAppSelector((s) => s.farm.plots);

  const [name, setName] = useState(`Plot ${String.fromCharCode(65 + plots.length)}${plots.length + 1}`);
  const [crop, setCrop] = useState('maize');
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
          {CROP_KEYS.map((key) => (
            <Pill key={key} label={CROPS[key].label} active={crop === key} onPress={() => setCrop(key)} />
          ))}
        </ScrollView>

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

const s = StyleSheet.create({
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
