import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { DOMAIN_LABELS } from '../config/agronomy';
import { proposeMission } from '../services/drone';
import { enqueue } from '../services/offline';
import { formatAge } from '../services/offline';
import { usePlotState } from '../hooks/useTelemetry';
import { useLanguage } from '../hooks/useLanguage';
import { useVoice } from '../hooks/useVoice';
import {
  acknowledgeAlert,
  dismissAlert,
  resolveAlert,
  submitFeedback,
} from '../store/slices/alertsSlice';
import { proposeMissionAction } from '../store/slices/droneSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, spacing, typography } from '../theme';
import { AppHeader, Badge, Button, Card, ConfidenceBar, Screen, SectionTitle } from '../components/ui';
import {
  DriverList,
  FeedbackPrompt,
  RecommendationList,
  SeverityBadge,
} from '../components/domain';

/**
 * One alert in full: what fired, the evidence behind it, what to do, and the
 * feedback control. The evidence section is not optional decoration — it is how a
 * farmer decides whether to trust a warning enough to spend money acting on it.
 */
export default function AlertDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { speak } = useVoice({ language });

  const alertId: string = route.params?.alertId;
  const alert = useAppSelector((s) => s.alerts.items.find((a) => a.id === alertId));
  const confidenceThreshold = useAppSelector((s) => s.settings.confidenceThreshold);
  const plots = useAppSelector((s) => s.farm.plots);

  const { map, snapshot, forecast } = usePlotState(alert?.plotId);
  const plot = useMemo(() => plots.find((p) => p.id === alert?.plotId) ?? null, [plots, alert?.plotId]);

  if (!alert) {
    return (
      <Screen>
        <AppHeader title={t('alerts.detailTitle')} onBack={() => navigation.goBack()} />
        <Card>
          <Text style={s.muted}>{t('alerts.notFound')}</Text>
        </Card>
      </Screen>
    );
  }

  const handleFeedback = (wasAccurate: boolean) => {
    const feedback = { wasAccurate, at: Date.now() };
    dispatch(submitFeedback({ alertId: alert.id, feedback }));
    // Queued rather than sent directly: field connectivity cannot be assumed, and
    // this is training signal we must not lose.
    void enqueue('alertFeedback', { alertId: alert.id, ...feedback });
  };

  const handleDrone = () => {
    if (!plot || !snapshot) return;
    const mission = proposeMission({
      plot,
      type: alert.domain === 'pest' || alert.domain === 'cropHealth' ? 'spray' : 'inspect',
      map,
      reading: snapshot.reading,
      forecast,
      alert,
    });
    dispatch(proposeMissionAction(mission));
    navigation.navigate('Drone');
  };

  const droneEligible = alert.recommendations.some((r) => r.droneEligible);

  return (
    <Screen scroll>
      <AppHeader
        title={alert.title}
        subtitle={`${alert.plotName} · ${formatAge(alert.createdAt)}`}
        onBack={() => navigation.goBack()}
      />

      <Card>
        <View style={s.badges}>
          <SeverityBadge severity={alert.severity} />
          <Badge label={DOMAIN_LABELS[alert.domain]} tone="neutral" />
          {alert.gridRef ? (
            <Badge label={`Grid ${alert.gridRef.row + 1},${alert.gridRef.col + 1}`} tone="info" icon="location" />
          ) : null}
        </View>

        <Text style={s.detail}>{alert.detail}</Text>

        <ConfidenceBar confidence={alert.confidence} threshold={confidenceThreshold} />
        <Text style={s.confNote}>
          {alert.confidence >= confidenceThreshold
            ? t('alerts.confAbove')
            : t('alerts.confBelow')}
        </Text>

        <View style={s.actionRow}>
          <Button
            title={t('alerts.readAloud')}
            icon="volume-medium"
            variant="secondary"
            size="sm"
            onPress={() => speak(`${alert.title}. ${alert.detail}`)}
            style={{ flex: 1 }}
          />
          {alert.gridRef ? (
            <Button
              title={t('alerts.viewOnMap')}
              icon="map"
              variant="secondary"
              size="sm"
              onPress={() => navigation.navigate('FieldHealthMap')}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      </Card>

      {/* Evidence */}
      <SectionTitle title={t('alerts.whyFired')} icon="analytics" />
      <Card>
        <DriverList drivers={alert.drivers} />
      </Card>

      {/* Actions */}
      <SectionTitle title={t('home.recommendedAction')} icon="bulb" />
      <Card>
        <RecommendationList recommendations={alert.recommendations} onSpeak={speak} />
        {droneEligible ? (
          <Button
            title={t('alerts.scheduleDrone')}
            icon="paper-plane"
            onPress={handleDrone}
            style={{ marginTop: spacing.lg }}
          />
        ) : null}
      </Card>

      {/* Feedback loop */}
      <SectionTitle title={t('alerts.yourConfirmation')} icon="chatbox-ellipses" />
      <Card>
        <FeedbackPrompt alert={alert} onSubmit={handleFeedback} />
      </Card>

      {/* Status controls */}
      <Card>
        <View style={{ gap: spacing.sm }}>
          {alert.status === 'new' ? (
            <Button
              title={t('alerts.acknowledge')}
              icon="eye"
              variant="secondary"
              onPress={() => {
                dispatch(acknowledgeAlert(alert.id));
                void enqueue('alertStatus', { alertId: alert.id, status: 'acknowledged' });
              }}
            />
          ) : null}
          {alert.status !== 'resolved' ? (
            <Button
              title={t('alerts.markResolved')}
              icon="checkmark-done"
              onPress={() => {
                dispatch(resolveAlert(alert.id));
                void enqueue('alertStatus', { alertId: alert.id, status: 'resolved' });
                navigation.goBack();
              }}
            />
          ) : null}
          {alert.status !== 'dismissed' && alert.status !== 'resolved' ? (
            <Button
              title={t('alerts.dismiss')}
              variant="ghost"
              onPress={() => {
                dispatch(dismissAlert(alert.id));
                navigation.goBack();
              }}
            />
          ) : null}
        </View>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  muted: { ...typography.small, color: colors.textMuted },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: spacing.md },
  detail: { ...typography.body, color: colors.text, lineHeight: 21 },
  confNote: { ...typography.tiny, color: colors.textFaint, marginTop: 6, lineHeight: 15 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
