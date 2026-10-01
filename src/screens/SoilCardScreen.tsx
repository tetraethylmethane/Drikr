import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { cropProfile } from '../config/agronomy';
import { fertiliserPlan, Rating } from '../services/soilCard';
import { usePlotState } from '../hooks/useTelemetry';
import { updatePlot } from '../store/slices/farmSlice';
import { useAppDispatch } from '../store/hooks';
import { colors, radii, spacing, StatusTone, typography } from '../theme';
import { SoilCard } from '../types';
import { AppHeader, Badge, Button, Card, EmptyState, Screen, SectionTitle } from '../components/ui';

/**
 * The farmer types in their Soil Health Card, and gets back a fertiliser plan
 * for this field in bags: urea, DAP and potash, sized to the soil and the area.
 */
export default function SoilCardScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { plot } = usePlotState();

  const card = plot?.soilCard;
  const [form, setForm] = useState<Record<keyof SoilCard, string>>({
    n: card?.n != null ? String(card.n) : '',
    p: card?.p != null ? String(card.p) : '',
    k: card?.k != null ? String(card.k) : '',
    ph: card?.ph != null ? String(card.ph) : '',
    ec: card?.ec != null ? String(card.ec) : '',
    oc: card?.oc != null ? String(card.oc) : '',
    testedOn: card?.testedOn ?? '',
  });
  const [saved, setSaved] = useState(false);

  if (!plot) {
    return (
      <Screen>
        <AppHeader title={t('soil.title')} onBack={() => navigation.goBack()} />
        <EmptyState icon="leaf-outline" title={t('drone.noPlot')} action={t('fields.add')} onAction={() => navigation.navigate('FieldSetup')} />
      </Screen>
    );
  }

  const num = (v: string) => {
    const x = parseFloat(v.replace(',', '.'));
    return Number.isFinite(x) && x >= 0 ? x : undefined;
  };
  const ready = num(form.n) != null && num(form.p) != null && num(form.k) != null;

  const save = () => {
    if (!ready) return;
    const next: SoilCard = {
      n: num(form.n)!,
      p: num(form.p)!,
      k: num(form.k)!,
      ...(num(form.ph) != null ? { ph: num(form.ph) } : null),
      ...(num(form.ec) != null ? { ec: num(form.ec) } : null),
      ...(num(form.oc) != null ? { oc: num(form.oc) } : null),
      ...(form.testedOn.trim() ? { testedOn: form.testedOn.trim() } : null),
    };
    dispatch(updatePlot({ id: plot.id, changes: { soilCard: next } }));
    setSaved(true);
  };

  const plan = plot.soilCard ? fertiliserPlan(plot.soilCard, plot.crop, plot.areaAcres) : null;
  const tone = (r: Rating): StatusTone => (r === 'low' ? 'warn' : r === 'high' ? 'info' : 'ok');

  const field = (key: keyof SoilCard, label: string, unit: string) => (
    <View style={s.field} key={key}>
      <Text style={s.label}>
        {label} <Text style={s.unit}>{unit}</Text>
      </Text>
      <TextInput
        style={s.input}
        value={form[key]}
        onChangeText={(v) => {
          setForm((f) => ({ ...f, [key]: v }));
          setSaved(false);
        }}
        keyboardType={key === 'testedOn' ? 'numbers-and-punctuation' : 'decimal-pad'}
        placeholder={key === 'testedOn' ? '2026-06-15' : '—'}
        placeholderTextColor={colors.textFaint}
      />
    </View>
  );

  return (
    <Screen scroll>
      <AppHeader title={t('soil.title')} subtitle={`${plot.name} · ${cropProfile(plot.crop).label}`} onBack={() => navigation.goBack()} />

      <Card>
        <Text style={s.body}>{t('soil.lead')}</Text>
        <Button
          title={t('soil.findCard')}
          icon="open-outline"
          variant="ghost"
          size="sm"
          onPress={() => void Linking.openURL('https://soilhealth.dac.gov.in')}
          style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
        />
      </Card>

      <SectionTitle title={t('soil.enter')} icon="create" />
      <Card>
        <View style={s.grid}>
          {field('n', t('soil.n'), 'kg/ha')}
          {field('p', t('soil.p'), 'kg/ha')}
          {field('k', t('soil.k'), 'kg/ha')}
          {field('ph', t('soil.ph'), '')}
          {field('ec', t('soil.ec'), 'dS/m')}
          {field('oc', t('soil.oc'), '%')}
        </View>
        {field('testedOn', t('soil.testedOn'), '')}
        <Button title={saved ? t('soil.saved') : t('common.save')} icon={saved ? 'checkmark' : 'save'} onPress={save} disabled={!ready} style={{ marginTop: spacing.md }} />
        {!ready ? <Text style={s.hint}>{t('soil.needNpk')}</Text> : null}
      </Card>

      {plot.soilCard && plan ? (
        <>
          <SectionTitle title={t('soil.yourSoil')} icon="analytics" />
          <Card>
            <View style={s.badges}>
              <Badge label={`N · ${t(`soil.r_${plan.ratings.n}`)}`} tone={tone(plan.ratings.n)} />
              <Badge label={`P · ${t(`soil.r_${plan.ratings.p}`)}`} tone={tone(plan.ratings.p)} />
              <Badge label={`K · ${t(`soil.r_${plan.ratings.k}`)}`} tone={tone(plan.ratings.k)} />
              {plan.ratings.oc ? <Badge label={`${t('soil.ocShort')} · ${t(`soil.r_${plan.ratings.oc}`)}`} tone={tone(plan.ratings.oc)} /> : null}
            </View>
            {plan.ph === 'acidic' ? <Text style={s.note}>{t('soil.acidic')}</Text> : null}
            {plan.ph === 'alkaline' ? <Text style={s.note}>{t('soil.alkaline')}</Text> : null}
            {plan.salty ? <Text style={s.note}>{t('soil.salty')}</Text> : null}
            {plan.ratings.oc === 'low' ? <Text style={s.note}>{t('soil.lowOc')}</Text> : null}
          </Card>

          <SectionTitle title={t('soil.planTitle', { acres: plot.areaAcres })} icon="cart" />
          <Card>
            <Bag name={t('soil.urea')} kg={plan.urea} bag={45} />
            <Bag name={t('soil.dap')} kg={plan.dap} bag={50} />
            <Bag name={t('soil.mop')} kg={plan.mop} bag={50} />
            <Text style={s.hint}>{t('soil.planNote', { n: plan.n, p: plan.p, k: plan.k })}</Text>
            <Text style={s.hint}>{t('soil.split')}</Text>
            <Text style={[s.hint, { color: colors.textFaint }]}>{t('soil.disclaimer')}</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function Bag({ name, kg, bag }: { name: string; kg: number; bag: number }) {
  const { t } = useTranslation();
  return (
    <View style={s.bagRow}>
      <Text style={s.bagName}>{name}</Text>
      <Text style={s.bagKg}>{kg} kg</Text>
      <Text style={s.bagCount}>{t('soil.bags', { n: Math.round((kg / bag) * 10) / 10, size: bag })}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  body: { ...typography.body, color: colors.text, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  field: { width: '31%', flexGrow: 1, marginBottom: spacing.sm },
  label: { ...typography.tiny, color: colors.textMuted, fontWeight: '700', marginBottom: 4 },
  unit: { fontWeight: '400', color: colors.textFaint },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  hint: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { ...typography.small, color: colors.text, marginTop: spacing.md, lineHeight: 19 },
  bagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  bagName: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  bagKg: { ...typography.h3, color: colors.brand },
  bagCount: { ...typography.tiny, color: colors.textMuted, width: 90, textAlign: 'right' },
});
