import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import indianDistricts from '../config/indianDistricts';
import { cropProfile } from '../config/agronomy';
import { fetchPrices, sellSignal } from '../services/market';
import { formatAge } from '../services/offline';
import { usePlotState } from '../hooks/useTelemetry';
import { useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { MarketPrice } from '../types';
import { AppHeader, Badge, Button, Card, EmptyState, Pill, Screen, SectionTitle } from '../components/ui';

/**
 * Mandi prices from data.gov.in, with the farmer's own crop pulled to the top.
 *
 * State/district come from the bundled district map so the pickers work offline;
 * prices are cached, so the last known rates stay visible with their age shown
 * rather than the screen going blank on a dropped connection.
 */
export default function MarketScreen() {
  const { t } = useTranslation();
  const { plot } = usePlotState();
  const profile = useAppSelector((s) => s.user.profile);
  const online = useAppSelector((s) => s.telemetry.online);

  const [state, setState] = useState<string>(profile?.state ?? 'Tamil Nadu');
  const [district, setDistrict] = useState<string>(profile?.district ?? '');
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ at: number; cached: boolean; stale: boolean } | null>(null);
  const [picker, setPicker] = useState<'state' | 'district' | null>(null);
  const [onlyMyCrop, setOnlyMyCrop] = useState(false);

  const districts = useMemo(() => indianDistricts[state] ?? [], [state]);
  const myCrop = plot ? cropProfile(plot.crop).label : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPrices({ state, district: district || undefined, limit: 250 });
      setPrices(res.prices);
      setMeta({ at: res.fetchedAt, cached: res.fromCache, stale: res.stale });
      if (res.prices.length === 0) setError(t('market.noRecords'));
    } catch {
      setError(online ? t('market.fetchFailed') : t('market.offlineNoCache'));
      setPrices([]);
    } finally {
      setLoading(false);
    }
  }, [state, district, online, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!onlyMyCrop || !myCrop) return prices;
    return prices.filter((p) => p.commodity.toLowerCase().includes(myCrop.toLowerCase()));
  }, [prices, onlyMyCrop, myCrop]);

  const signal = useMemo(() => (myCrop ? sellSignal(prices, myCrop) : null), [prices, myCrop]);

  return (
    <Screen>
      <AppHeader
        title={t('market.title')}
        subtitle={t('market.subtitle')}
        right={meta ? <Badge label={formatAge(meta.at)} tone={meta.stale ? 'warn' : 'ok'} /> : undefined}
      />

      <View style={s.filters}>
        <Pressable style={s.filterBtn} onPress={() => setPicker('state')}>
          <Ionicons name="location" size={13} color={colors.brand} />
          <Text style={s.filterText} numberOfLines={1}>
            {state}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.brand} />
        </Pressable>
        <Pressable style={s.filterBtn} onPress={() => setPicker('district')}>
          <Ionicons name="business" size={13} color={colors.brand} />
          <Text style={s.filterText} numberOfLines={1}>
            {district || t('market.allDistricts')}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.brand} />
        </Pressable>
        <Pressable style={s.refreshBtn} onPress={() => void load()} accessibilityLabel={t('common.retry')}>
          <Ionicons name="refresh" size={16} color={colors.brand} />
        </Pressable>
      </View>

      {myCrop ? (
        <View style={s.pillRow}>
          <Pill
            label={`${t('market.onlyMyCrop')}: ${myCrop}`}
            active={onlyMyCrop}
            onPress={() => setOnlyMyCrop((v) => !v)}
            icon="leaf"
          />
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(p, i) => `${p.commodity}-${p.market}-${i}`}
        contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {meta?.cached ? (
              <Card tone="warn">
                <View style={s.cacheRow}>
                  <Ionicons name="cloud-offline" size={16} color={colors.warn} />
                  <Text style={s.cacheText}>
                    {t('market.showingCached', { age: formatAge(meta.at) })}
                  </Text>
                </View>
              </Card>
            ) : null}

            {signal && signal.best && myCrop ? (
              <Card>
                <Text style={s.signalTitle}>
                  {t('market.bestRate')} · {myCrop}
                </Text>
                <View style={s.signalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.signalPrice}>₹{signal.best.modalPrice.toLocaleString('en-IN')}</Text>
                    <Text style={s.signalMeta}>
                      {signal.best.market}, {signal.best.district}
                    </Text>
                  </View>
                  {signal.spreadPct > 0 ? (
                    <Badge label={`+${signal.spreadPct}% ${t('market.vsMedian')}`} tone="ok" icon="trending-up" />
                  ) : null}
                </View>
                <Text style={s.signalNote}>{t('market.spreadNote')}</Text>
              </Card>
            ) : null}

            {plot ? (
              <Card>
                <Text style={s.signalTitle}>{t('market.yieldValue')}</Text>
                <Text style={s.yieldBody}>
                  {t('market.yieldBody', {
                    crop: cropProfile(plot.crop).label,
                    yield: cropProfile(plot.crop).typicalYieldQuintalPerAcre,
                    acres: plot.areaAcres,
                    quintals: Math.round(
                      cropProfile(plot.crop).typicalYieldQuintalPerAcre * plot.areaAcres
                    ),
                  })}
                </Text>
                {signal && signal.best ? (
                  <Text style={s.yieldValue}>
                    ≈ ₹
                    {Math.round(
                      cropProfile(plot.crop).typicalYieldQuintalPerAcre *
                        plot.areaAcres *
                        signal.best.modalPrice
                    ).toLocaleString('en-IN')}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            {loading ? (
              <View style={s.loading}>
                <ActivityIndicator color={colors.brand} />
                <Text style={s.loadingText}>{t('market.loading')}</Text>
              </View>
            ) : null}

            {filtered.length > 0 ? <SectionTitle title={t('market.todayRates')} icon="pricetags" /> : null}
          </>
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="pricetag-outline"
              title={error ?? t('market.noRecords')}
              body={t('market.tryDifferent')}
              action={t('common.retry')}
              onAction={() => void load()}
            />
          )
        }
        renderItem={({ item }) => <PriceRow price={item} highlight={myCrop != null && item.commodity.toLowerCase().includes(myCrop.toLowerCase())} />}
      />

      {/* Picker */}
      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={s.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.sheetTitle}>
              {picker === 'state' ? t('market.selectState') : t('market.selectDistrict')}
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {picker === 'district' ? (
                <Pressable
                  style={s.optionRow}
                  onPress={() => {
                    setDistrict('');
                    setPicker(null);
                  }}
                >
                  <Text style={s.optionText}>{t('market.allDistricts')}</Text>
                </Pressable>
              ) : null}
              {(picker === 'state' ? Object.keys(indianDistricts) : districts).map((item) => (
                <Pressable
                  key={item}
                  style={s.optionRow}
                  onPress={() => {
                    if (picker === 'state') {
                      setState(item);
                      setDistrict('');
                    } else {
                      setDistrict(item);
                    }
                    setPicker(null);
                  }}
                >
                  <Text style={s.optionText}>{item}</Text>
                  {(picker === 'state' ? state : district) === item ? (
                    <Ionicons name="checkmark" size={17} color={colors.brand} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function PriceRow({ price, highlight }: { price: MarketPrice; highlight?: boolean }) {
  const { t } = useTranslation();
  return (
    <Card style={highlight ? { borderColor: colors.brandLight + '66', backgroundColor: colors.surfaceAlt } : undefined}>
      <View style={s.priceTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.commodity} numberOfLines={1}>
            {price.commodity}
            {price.variety ? <Text style={s.variety}> · {price.variety}</Text> : null}
          </Text>
          <Text style={s.marketName} numberOfLines={1}>
            {price.market}
            {price.district ? `, ${price.district}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.modal}>₹{price.modalPrice.toLocaleString('en-IN')}</Text>
          <Text style={s.unit}>{price.unit}</Text>
        </View>
      </View>
      <View style={s.rangeRow}>
        <Text style={s.rangeText}>
          {t('market.min')} ₹{price.minPrice.toLocaleString('en-IN')}
        </Text>
        <View style={s.rangeBar}>
          <View style={s.rangeFill} />
        </View>
        <Text style={s.rangeText}>
          {t('market.max')} ₹{price.maxPrice.toLocaleString('en-IN')}
        </Text>
      </View>
      {price.date ? <Text style={s.date}>{price.date}</Text> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterText: { ...typography.small, color: colors.brand, fontWeight: '700', flex: 1 },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  cacheRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cacheText: { ...typography.tiny, color: colors.warn, flex: 1, lineHeight: 16 },
  signalTitle: { ...typography.tiny, color: colors.textMuted, marginBottom: spacing.sm },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  signalPrice: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.7 },
  signalMeta: { ...typography.small, color: colors.textMuted, marginTop: 1 },
  signalNote: { ...typography.tiny, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 15 },
  yieldBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  yieldValue: { ...typography.h2, color: colors.ok, marginTop: spacing.sm },
  loading: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  loadingText: { ...typography.small, color: colors.textMuted },
  priceTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  commodity: { ...typography.bodyStrong, color: colors.text },
  variety: { ...typography.small, color: colors.textMuted, fontWeight: '500' },
  marketName: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  modal: { ...typography.h3, color: colors.brand },
  unit: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  rangeText: { ...typography.tiny, color: colors.textMuted },
  rangeBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  rangeFill: { height: '100%', backgroundColor: colors.accent, width: '100%', opacity: 0.5 },
  date: { ...typography.tiny, color: colors.textFaint, marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: '#0F2C2199', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.md },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  optionText: { ...typography.body, color: colors.text },
});
