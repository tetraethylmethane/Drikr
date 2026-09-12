import React, { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COST_MODEL, cropProfile } from '../config/agronomy';
import { usePlotState } from '../hooks/useTelemetry';
import { colors, radii, spacing, toneColors, typography } from '../theme';
import { AppHeader, Badge, Card, Screen, SectionTitle } from '../components/ui';
import { CompareBars } from '../components/charts';

/**
 * Profit and loss, built on the deck's cost-reduction table.
 *
 * Inputs default from the selected plot and its crop profile so a farmer sees a
 * plausible number before typing anything, and the comparison is conventional
 * practice versus Drikr — the saving claim the deck makes, computed rather than
 * asserted.
 */
export default function ProfitLossScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { plot } = usePlotState();

  const crop = plot ? cropProfile(plot.crop) : cropProfile(undefined);

  const [acres, setAcres] = useState(String(plot?.areaAcres ?? 1));
  const [yieldPerAcre, setYieldPerAcre] = useState(String(crop.typicalYieldQuintalPerAcre));
  const [pricePerQuintal, setPricePerQuintal] = useState('2200');
  const [seedCost, setSeedCost] = useState('1800');

  const width = Dimensions.get('window').width - spacing.lg * 4;

  const calc = useMemo(() => {
    const a = Math.max(0, parseFloat(acres) || 0);
    const y = Math.max(0, parseFloat(yieldPerAcre) || 0);
    const price = Math.max(0, parseFloat(pricePerQuintal) || 0);
    const seed = Math.max(0, parseFloat(seedCost) || 0);

    const conv = COST_MODEL.conventional;
    const drikr = COST_MODEL.withDrikr;

    const conventionalPerAcre = conv.spray + conv.water + conv.labour + conv.other + seed;
    const drikrPerAcre =
      drikr.spray + drikr.water + drikr.labour + drikr.other + seed + COST_MODEL.subscriptionPerMonth / 4;

    const conventionalCost = conventionalPerAcre * a;
    const drikrCost = drikrPerAcre * a;

    // Earlier detection protects yield: the deck cites 20-40% loss conventionally
    // against 5-10% with the system. The midpoints are used here.
    const conventionalLoss = 0.3;
    const drikrLoss = 0.075;

    const conventionalYield = y * a * (1 - conventionalLoss);
    const drikrYield = y * a * (1 - drikrLoss);

    const conventionalRevenue = conventionalYield * price;
    const drikrRevenue = drikrYield * price;

    return {
      acres: a,
      conventionalCost: Math.round(conventionalCost),
      drikrCost: Math.round(drikrCost),
      conventionalRevenue: Math.round(conventionalRevenue),
      drikrRevenue: Math.round(drikrRevenue),
      conventionalProfit: Math.round(conventionalRevenue - conventionalCost),
      drikrProfit: Math.round(drikrRevenue - drikrCost),
      costSaving: Math.round(conventionalCost - drikrCost),
      yieldGain: Math.round((drikrYield - conventionalYield) * 10) / 10,
      savingPerAcre: a > 0 ? Math.round((conventionalCost - drikrCost) / a) : 0,
      costSavingPct:
        conventionalCost > 0 ? Math.round(((conventionalCost - drikrCost) / conventionalCost) * 100) : 0,
    };
  }, [acres, yieldPerAcre, pricePerQuintal, seedCost]);

  const profitTone = calc.drikrProfit >= 0 ? 'ok' : 'danger';

  return (
    <Screen scroll>
      <AppHeader
        title={t('profit.title')}
        subtitle={plot ? `${plot.name} · ${crop.label}` : t('profit.subtitle')}
        onBack={() => navigation.goBack()}
      />

      {/* Inputs */}
      <Card>
        <Field
          label={t('profit.area')}
          value={acres}
          onChange={setAcres}
          suffix={t('fields.acre')}
          icon="resize"
        />
        <Field
          label={t('profit.expectedYield')}
          value={yieldPerAcre}
          onChange={setYieldPerAcre}
          suffix={t('profit.quintalPerAcre')}
          icon="leaf"
          help={t('profit.yieldHelp', { crop: crop.label, value: crop.typicalYieldQuintalPerAcre })}
        />
        <Field
          label={t('profit.marketPrice')}
          value={pricePerQuintal}
          onChange={setPricePerQuintal}
          suffix={t('profit.perQuintal')}
          icon="pricetag"
        />
        <Field
          label={t('profit.seedCost')}
          value={seedCost}
          onChange={setSeedCost}
          suffix={t('profit.perAcre')}
          icon="cube"
        />
      </Card>

      {/* Headline */}
      <Card tone={profitTone}>
        <Text style={s.headlineLabel}>{t('profit.estimatedProfit')}</Text>
        <Text style={[s.headline, { color: toneColors(profitTone).fg }]}>
          ₹{calc.drikrProfit.toLocaleString('en-IN')}
        </Text>
        <View style={s.headlineRow}>
          <Badge
            label={`+₹${(calc.drikrProfit - calc.conventionalProfit).toLocaleString('en-IN')} ${t('profit.vsConventional')}`}
            tone="ok"
            icon="trending-up"
          />
        </View>
      </Card>

      {/* Comparison */}
      <SectionTitle title={t('profit.comparison')} icon="stats-chart" />
      <Card>
        <Text style={s.muted}>{t('profit.comparisonHelp')}</Text>
        <View style={{ alignItems: 'center', marginTop: spacing.md }}>
          <CompareBars
            width={width}
            items={[
              { label: t('profit.conventional'), value: calc.conventionalProfit, color: colors.textMuted },
              { label: t('profit.withDrikr'), value: calc.drikrProfit, color: colors.ok },
            ]}
          />
        </View>

        <View style={s.table}>
          <Row label={t('profit.totalCost')} conventional={calc.conventionalCost} drikr={calc.drikrCost} lowerBetter />
          <Row label={t('profit.revenue')} conventional={calc.conventionalRevenue} drikr={calc.drikrRevenue} />
          <Row label={t('profit.netProfit')} conventional={calc.conventionalProfit} drikr={calc.drikrProfit} bold />
        </View>
      </Card>

      {/* Where the saving comes from */}
      <SectionTitle title={t('profit.whereSaving')} icon="cash" />
      <Card>
        <SavingRow
          icon="rainy"
          label={t('profit.spraying')}
          before={COST_MODEL.conventional.spray}
          after={COST_MODEL.withDrikr.spray}
          note={t('profit.sprayingNote')}
        />
        <SavingRow
          icon="water"
          label={t('profit.water')}
          before={COST_MODEL.conventional.water}
          after={COST_MODEL.withDrikr.water}
          note={t('profit.waterNote')}
        />
        <SavingRow
          icon="people"
          label={t('profit.labour')}
          before={COST_MODEL.conventional.labour}
          after={COST_MODEL.withDrikr.labour}
          note={t('profit.labourNote')}
        />
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>{t('profit.savingPerAcre')}</Text>
          <Text style={s.totalValue}>
            ₹{calc.savingPerAcre.toLocaleString('en-IN')} ({calc.costSavingPct}%)
          </Text>
        </View>
      </Card>

      {/* Yield protection */}
      <Card>
        <View style={s.yieldRow}>
          <Ionicons name="shield-checkmark" size={20} color={colors.ok} />
          <View style={{ flex: 1 }}>
            <Text style={s.yieldTitle}>
              +{calc.yieldGain} {t('profit.quintalSaved')}
            </Text>
            <Text style={s.muted}>{t('profit.yieldProtectionNote')}</Text>
          </View>
        </View>
      </Card>

      <Text style={s.disclaimer}>{t('profit.disclaimer')}</Text>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  icon,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  icon: keyof typeof Ionicons.glyphMap;
  help?: string;
}) {
  return (
    <View style={s.field}>
      <View style={s.fieldTop}>
        <Ionicons name={icon} size={15} color={colors.brandLight} />
        <Text style={s.fieldLabel}>{label}</Text>
      </View>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.textFaint}
        />
        {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
      </View>
      {help ? <Text style={s.fieldHelp}>{help}</Text> : null}
    </View>
  );
}

function Row({
  label,
  conventional,
  drikr,
  bold,
  lowerBetter,
}: {
  label: string;
  conventional: number;
  drikr: number;
  bold?: boolean;
  lowerBetter?: boolean;
}) {
  const better = lowerBetter ? drikr < conventional : drikr > conventional;
  return (
    <View style={s.tableRow}>
      <Text style={[s.tableLabel, bold && { fontWeight: '800', color: colors.text }]}>{label}</Text>
      <Text style={[s.tableValue, bold && { fontWeight: '800' }]}>
        ₹{conventional.toLocaleString('en-IN')}
      </Text>
      <Text
        style={[
          s.tableValue,
          { fontWeight: '800' },
          better ? { color: colors.ok } : { color: colors.text },
        ]}
      >
        ₹{drikr.toLocaleString('en-IN')}
      </Text>
    </View>
  );
}

function SavingRow({
  icon,
  label,
  before,
  after,
  note,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  before: number;
  after: number;
  note: string;
}) {
  const pct = Math.round(((before - after) / before) * 100);
  return (
    <View style={s.savingRow}>
      <View style={s.savingIcon}>
        <Ionicons name={icon} size={16} color={colors.ok} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.savingLabel}>{label}</Text>
        <Text style={s.savingNote}>{note}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.savingDelta}>
          ₹{before} → ₹{after}
        </Text>
        <Badge label={`−${pct}%`} tone="ok" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  muted: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  field: { paddingVertical: spacing.sm },
  fieldTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldLabel: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 5 },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    ...typography.bodyStrong,
    color: colors.text,
  },
  suffix: { ...typography.small, color: colors.textMuted, minWidth: 92 },
  fieldHelp: { ...typography.tiny, color: colors.textFaint, marginTop: 4 },
  headlineLabel: { ...typography.tiny, color: colors.textMuted },
  headline: { fontSize: 34, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  headlineRow: { flexDirection: 'row', marginTop: spacing.sm },
  table: { marginTop: spacing.lg },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tableLabel: { flex: 1.5, ...typography.small, color: colors.textMuted },
  tableValue: { flex: 1, ...typography.small, color: colors.textMuted, textAlign: 'right' },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  savingIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.okBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingLabel: { ...typography.bodyStrong, color: colors.text },
  savingNote: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  savingDelta: { ...typography.tiny, color: colors.textMuted, marginBottom: 3 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { ...typography.bodyStrong, color: colors.text },
  totalValue: { ...typography.h3, color: colors.ok },
  yieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  yieldTitle: { ...typography.h3, color: colors.ok },
  disclaimer: {
    ...typography.tiny,
    color: colors.textFaint,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    lineHeight: 16,
  },
});
