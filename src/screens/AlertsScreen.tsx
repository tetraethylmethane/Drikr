import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { sortAlerts, suppressedRisks } from '../services/alertEngine';
import { formatAge } from '../services/offline';
import { usePlotState } from '../hooks/useTelemetry';
import { useAppSelector } from '../store/hooks';
import { colors, radii, spacing, toneColors, typography } from '../theme';
import { Alert, AlertStatus } from '../types';
import { AppHeader, Card, EmptyState, ListRow, Pill, Screen } from '../components/ui';
import { DOMAIN_ICON, severityTone } from '../components/domain';

/**
 * Alerts feed.
 *
 * Also surfaces risks that were *suppressed* by the confidence threshold. Hiding
 * them entirely would leave the farmer wondering why an obvious problem produced no
 * warning; showing them as "below your threshold" makes the system's caution legible
 * and gives a reason to tune the setting.
 */
export default function AlertsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const alerts = useAppSelector((s) => s.alerts.items);
  const confidenceThreshold = useAppSelector((s) => s.settings.confidenceThreshold);
  const { assessment } = usePlotState();

  // Two lists a farmer thinks in: what needs me now, and what is done.
  const [filter, setFilter] = useState<'active' | 'all' | 'resolved'>('active');
  // "Watching, not warning" is for the curious; closed unless asked for.
  const [showWatching, setShowWatching] = useState(false);

  const filtered = useMemo(() => {
    const sorted = sortAlerts(alerts);
    if (filter === 'active') return sorted.filter((a) => a.status === 'new' || a.status === 'acknowledged');
    if (filter === 'resolved') return sorted.filter((a) => a.status === 'resolved' || a.status === 'dismissed');
    return sorted;
  }, [alerts, filter]);

  const suppressed = useMemo(
    () => (assessment ? suppressedRisks(assessment, confidenceThreshold) : []),
    [assessment, confidenceThreshold]
  );

  const counts = useMemo(
    () => ({
      active: alerts.filter((a) => a.status === 'new' || a.status === 'acknowledged').length,
      all: alerts.length,
      resolved: alerts.filter((a) => a.status === 'resolved' || a.status === 'dismissed').length,
    }),
    [alerts]
  );

  return (
    <Screen>
      <AppHeader title={t('alerts.title')} subtitle={t('alerts.subtitle')} />

      <View style={s.filters}>
        <Pill label={`${t('alerts.now')} (${counts.active})`} active={filter === 'active'} onPress={() => setFilter('active')} />
        <Pill label={`${t('alerts.earlier')} (${counts.resolved})`} active={filter === 'resolved'} onPress={() => setFilter('resolved')} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="shield-checkmark-outline"
            title={filter === 'active' ? t('alerts.emptyActive') : t('alerts.emptyAll')}
            body={t('alerts.emptyBody')}
          />
        }
        renderItem={({ item }) => (
          <AlertRow alert={item} onPress={() => navigation.navigate('AlertDetail', { alertId: item.id })} />
        )}
        ListFooterComponent={
          suppressed.length > 0 && filter !== 'resolved' ? (
            <>
              <Pressable style={s.watchToggle} onPress={() => setShowWatching((v) => !v)}>
                <Ionicons name={showWatching ? 'chevron-up' : 'chevron-down'} size={16} color={colors.brandLight} />
                <Text style={s.watchToggleText}>
                  {t('alerts.belowThreshold')} ({suppressed.length})
                </Text>
              </Pressable>
              {showWatching ? (
                <Card>
                  <Text style={s.suppressedIntro}>{t('alerts.belowThresholdBody')}</Text>
                  {suppressed.map(({ risk, reason }) => (
                    <View key={risk.domain} style={s.suppressedRow}>
                      <ListRow title={risk.title} subtitle={reason} icon={DOMAIN_ICON[risk.domain]} tone="neutral" />
                    </View>
                  ))}
                </Card>
              ) : null}
            </>
          ) : null
        }
      />
    </Screen>
  );
}

function statusLabel(status: AlertStatus, t: (k: string) => string): string {
  switch (status) {
    case 'new':
      return t('alerts.new');
    case 'acknowledged':
      return t('alerts.acknowledged');
    case 'resolved':
      return t('alerts.resolved');
    case 'dismissed':
      return t('alerts.dismissed');
  }
}

function AlertRow({ alert, onPress }: { alert: Alert; onPress: () => void }) {
  const { t } = useTranslation();
  const tone = severityTone(alert.severity);
  const { fg, bg } = toneColors(tone);
  const dim = alert.status === 'resolved' || alert.status === 'dismissed';

  return (
    <Card onPress={onPress} style={dim ? { opacity: 0.62 } : undefined}>
      <View style={s.row}>
        <View style={[s.icon, { backgroundColor: bg }]}>
          <Ionicons name={DOMAIN_ICON[alert.domain]} size={18} color={fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.rowTop}>
            <Text style={s.title} numberOfLines={1}>
              {alert.title}
            </Text>
            {alert.status === 'new' ? <View style={[s.unread, { backgroundColor: fg }]} /> : null}
          </View>
          <Text style={s.detail} numberOfLines={3}>
            {alert.detail}
          </Text>
          {alert.recommendations[0] && !dim ? (
            <View style={[s.doBox, { backgroundColor: bg }]}>
              <Text style={[s.doLabel, { color: fg }]}>{t('alerts.doThis')}</Text>
              <Text style={s.doText} numberOfLines={3}>
                {alert.recommendations[0].text}
              </Text>
            </View>
          ) : null}
          <View style={s.metaRow}>
            <Text style={s.meta}>
              {alert.plotName} · {formatAge(alert.createdAt)}
            </Text>
            {!dim ? <Text style={s.more}>{t('alerts.seeMore')} ›</Text> : null}
          </View>
          {alert.status !== 'new' ? (
            <Text style={s.status}>{statusLabel(alert.status, t)}</Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  filters: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  unread: { width: 8, height: 8, borderRadius: 4 },
  detail: { ...typography.small, color: colors.textMuted, marginTop: 3, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  meta: { ...typography.tiny, color: colors.textFaint },
  status: { ...typography.tiny, color: colors.textFaint, marginTop: 5, fontStyle: 'italic' },
  doBox: { marginTop: spacing.sm, padding: spacing.sm + 2, borderRadius: radii.sm },
  doLabel: { ...typography.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  doText: { ...typography.small, color: colors.text, marginTop: 2, lineHeight: 19, fontWeight: '600' },
  more: { ...typography.tiny, color: colors.brandLight, fontWeight: '700', marginLeft: 'auto' },
  watchToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  watchToggleText: { ...typography.small, color: colors.brandLight, fontWeight: '700' },
  suppressedIntro: { ...typography.small, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.sm },
  suppressedRow: { borderTopWidth: 1, borderTopColor: colors.border },
});
