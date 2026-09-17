import React, { useCallback, useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DRONE_LIMITS } from '../config/agronomy';
import { droneFlightCheck } from '../services/decisionEngine';
import { missionEconomics, nextStatus, proposeMission } from '../services/drone';
import { activeLink, buildFlightPlan, describePlan } from '../services/droneLink';
import { scheduleMissionReminder } from '../services/notifications';
import { enqueue } from '../services/offline';
import { nextCalmWindow } from '../services/weather';
import { usePlotState } from '../hooks/useTelemetry';
import {
  abortMission,
  confirmMission,
  proposeMissionAction,
  rescheduleMission,
  syncMission,
} from '../store/slices/droneSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, toneColors, typography } from '../theme';
import { AppHeader, Badge, Button, Card, EmptyState, Screen, SectionTitle } from '../components/ui';
import { CompareBars } from '../components/charts';
import { DroneMissionCard } from '../components/domain';

/**
 * Drone operations.
 *
 * Confirmation is mandatory by default: a mission sits as "proposed" until the
 * farmer approves it. The flight-check panel is shown above the queue because a
 * farmer needs to know *why* a spray is not happening — wind over the limit is a
 * legitimate reason, and hiding it makes the system look broken.
 */
export default function DroneScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const { plot, snapshot, map, forecast } = usePlotState();
  const missions = useAppSelector((s) => s.drone.missions);
  const requireConfirmation = useAppSelector((s) => s.settings.requireDroneConfirmation);

  const width = Dimensions.get('window').width - spacing.lg * 4;

  // Advance scheduled flights on a ticker so progress is visible without a backend.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      for (const m of missions) {
        const next = nextStatus(m, now);
        if (next !== m) dispatch(syncMission(next));
      }
    }, 5000);
    return () => clearInterval(id);
  }, [missions, dispatch]);

  const flight = useMemo(
    // Passing null when there is no snapshot is deliberate: droneFlightCheck
    // then judges from the forecast, which is the only thing a scouting field
    // has. Reporting a flat "no data" would have made the Drone screen useless
    // for every field without sensors.
    () => droneFlightCheck(snapshot?.reading ?? null, forecast),
    [snapshot, forecast, t]
  );

  const calmWindow = useMemo(
    () => nextCalmWindow(forecast, DRONE_LIMITS.maxWindKmh, DRONE_LIMITS.maxRainMm),
    [forecast]
  );

  const pending = missions.filter(
    (m) => m.status === 'proposed' || m.status === 'scheduled' || m.status === 'in_flight' || m.status === 'blocked'
  );
  const history = missions.filter((m) => m.status === 'completed' || m.status === 'aborted');

  const handleConfirm = useCallback(
    (id: string) => {
      dispatch(confirmMission(id));
      const mission = missions.find((m) => m.id === id);
      if (mission) {
        void scheduleMissionReminder({ ...mission, status: 'scheduled' });
        void enqueue('mission', { id, action: 'confirm' });
      }
    },
    [dispatch, missions]
  );

  const createMission = (type: 'spray' | 'inspect') => {
    if (!plot || !snapshot) return;
    const mission = proposeMission({ plot, type, map, reading: snapshot.reading, forecast });
    dispatch(proposeMissionAction(mission));
  };

  const totals = useMemo(() => {
    const done = missions.filter((m) => m.status === 'completed');
    const acres = done.reduce((s, m) => s + m.areaAcres, 0);
    const litres = done.reduce((s, m) => s + (m.payload?.litres ?? 0), 0);
    return { count: done.length, acres: Math.round(acres * 100) / 100, litres: Math.round(litres) };
  }, [missions]);

  const econ = plot && pending[0] ? missionEconomics(pending[0], plot) : null;

  // The plan for the mission the farmer is currently deciding on. Built here
  // rather than in proposeMission because a mission is a set of grid cells and
  // stays valid if the field is georeferenced later — baking coordinates into it
  // would freeze a georeference that may not exist yet.
  const link = activeLink();
  const plan = useMemo(
    () => (plot && pending[0] ? buildFlightPlan(pending[0], plot) : null),
    [plot, pending]
  );

  return (
    <Screen scroll>
      <AppHeader
        title={t('drone.title')}
        subtitle={plot ? `${plot.name} · ${plot.areaAcres} ${t('fields.acre')}` : undefined}
        onBack={() => navigation.goBack()}
      />

      {/* Flight conditions */}
      <Card tone={flight.ok ? 'ok' : 'danger'}>
        <View style={s.flightRow}>
          <Ionicons
            name={flight.ok ? 'checkmark-circle' : 'warning'}
            size={20}
            color={flight.ok ? colors.ok : colors.danger}
          />
          <View style={{ flex: 1 }}>
            <Text style={[s.flightTitle, { color: flight.ok ? colors.ok : colors.danger }]}>
              {flight.ok ? t('drone.clearToFly') : t('drone.notClear')}
            </Text>
            <Text style={s.flightReason}>
              {flight.ok ? t('drone.withinLimits') : flight.reason}
            </Text>
          </View>
        </View>

        {snapshot ? (
          <View style={s.limitRow}>
            <LimitStat
              label={t('weather.wind')}
              value={`${Math.round(snapshot.reading.windSpeed)} km/h`}
              limit={`≤ ${DRONE_LIMITS.maxWindKmh}`}
              ok={snapshot.reading.windSpeed <= DRONE_LIMITS.maxWindKmh}
            />
            <LimitStat
              label={t('weather.rain')}
              value={`${snapshot.reading.rainfall} mm`}
              limit={`≤ ${DRONE_LIMITS.maxRainMm}`}
              ok={snapshot.reading.rainfall <= DRONE_LIMITS.maxRainMm}
            />
            <LimitStat
              label={t('drone.daylight')}
              value={`${new Date(snapshot.at).getHours()}:00`}
              limit={`${DRONE_LIMITS.minVisibilityHour}-${DRONE_LIMITS.maxVisibilityHour}`}
              ok={
                new Date(snapshot.at).getHours() >= DRONE_LIMITS.minVisibilityHour &&
                new Date(snapshot.at).getHours() <= DRONE_LIMITS.maxVisibilityHour
              }
            />
          </View>
        ) : null}

        {!flight.ok && calmWindow ? (
          <Text style={s.calmNote}>
            {t('drone.nextWindow')}:{' '}
            {new Date(calmWindow).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        ) : null}
      </Card>

      {/* Create */}
      <View style={s.createRow}>
        <Button
          title={t('drone.newSpray')}
          icon="rainy"
          onPress={() => createMission('spray')}
          style={{ flex: 1 }}
          disabled={!plot || !snapshot}
        />
        <Button
          title={t('drone.newInspect')}
          icon="eye"
          variant="secondary"
          onPress={() => createMission('inspect')}
          style={{ flex: 1 }}
          disabled={!plot || !snapshot}
        />
      </View>

      {/* Flight plan — the coordinates, and whether they can be trusted */}
      {plan ? (
        <>
          <SectionTitle title={t('drone.flightPlan')} icon="navigate" />
          <Card tone={plan.problems.length > 0 ? 'warn' : undefined}>
            {plan.problems.length > 0 ? (
              <>
                {plan.problems.map((p, i) => (
                  <View key={i} style={s.planProblemRow}>
                    <Ionicons name="alert-circle" size={15} color={colors.warn} />
                    <Text style={s.planProblemText}>{p}</Text>
                  </View>
                ))}
                {/* The usual problem is a field that has never been georeferenced,
                    which is fixable in one screen — so link straight to it. */}
                {!plot?.georef ? (
                  <Button
                    title={t('drone.setFieldLocation')}
                    icon="location"
                    size="sm"
                    onPress={() => navigation.navigate('FieldLocation')}
                    style={{ marginTop: spacing.md }}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Text style={s.planLead}>
                  {t('drone.waypointCount', { count: plan.waypoints.length })}
                </Text>
                {/* Printed in full because the only way to fly this drone is for
                    the farmer to type them into its own app. */}
                {describePlan(plan).map((line, i) => (
                  <Text key={i} style={s.planLine}>
                    {line}
                  </Text>
                ))}
                {plan.warnings.map((w, i) => (
                  <View key={`w${i}`} style={s.planProblemRow}>
                    <Ionicons name="warning" size={15} color={colors.warn} />
                    <Text style={s.planProblemText}>{w}</Text>
                  </View>
                ))}
                <View style={s.linkRow}>
                  <Ionicons
                    name={link.canCommand ? 'radio' : 'create-outline'}
                    size={15}
                    color={colors.info}
                  />
                  <Text style={s.linkText}>
                    {link.canCommand
                      ? t('drone.linkReady', { name: link.label })
                      : t('drone.linkManual')}
                  </Text>
                </View>
              </>
            )}
          </Card>
        </>
      ) : null}

      {/* Pending */}
      <SectionTitle title={t('drone.queue')} icon="list" />
      {pending.length === 0 ? (
        <Card>
          <Text style={s.muted}>{t('drone.queueEmpty')}</Text>
        </Card>
      ) : (
        <View style={{ gap: 0 }}>
          {pending.map((m) => (
            <DroneMissionCard
              key={m.id}
              mission={m}
              plot={plot}
              onConfirm={m.status === 'proposed' ? () => handleConfirm(m.id) : undefined}
              onAbort={() => dispatch(abortMission(m.id))}
              onReschedule={
                m.status === 'blocked' && calmWindow
                  ? () => dispatch(rescheduleMission({ id: m.id, at: calmWindow }))
                  : undefined
              }
            />
          ))}
        </View>
      )}

      {/* Savings from precision targeting */}
      {econ && pending[0]?.type === 'spray' ? (
        <>
          <SectionTitle title={t('drone.savings')} icon="cash" />
          <Card>
            <Text style={s.muted}>{t('drone.savingsBody')}</Text>
            <View style={{ alignItems: 'center', marginTop: spacing.md }}>
              <CompareBars
                width={width}
                items={[
                  { label: t('drone.manual'), value: econ.conventionalCost, color: colors.textMuted },
                  { label: t('drone.withDrikr'), value: econ.droneCost, color: colors.ok },
                ]}
              />
            </View>
            <View style={s.savingsRow}>
              <Badge label={`${econ.chemicalSavedPct}% ${t('drone.lessChemical')}`} tone="ok" />
              <Badge
                label={`${econ.conventionalWaterLitres - econ.waterLitres} L ${t('drone.lessWater')}`}
                tone="ok"
              />
              <Badge label={`₹${econ.saving} ${t('drone.saved')}`} tone="ok" />
            </View>
          </Card>
        </>
      ) : null}

      {/* Confirmation policy */}
      <Card>
        <View style={s.policyRow}>
          <Ionicons
            name={requireConfirmation ? 'lock-closed' : 'lock-open'}
            size={17}
            color={requireConfirmation ? colors.ok : colors.warn}
          />
          <Text style={s.policyText}>
            {requireConfirmation ? t('drone.policyOn') : t('drone.policyOff')}
          </Text>
        </View>
      </Card>

      {/* History */}
      {history.length > 0 ? (
        <>
          <SectionTitle title={t('drone.history')} icon="time" />
          <Card>
            <View style={s.totalsRow}>
              <TotalStat label={t('drone.missions')} value={String(totals.count)} />
              <TotalStat label={t('drone.acresTreated')} value={`${totals.acres}`} />
              <TotalStat label={t('drone.sprayUsed')} value={`${totals.litres} L`} />
            </View>
          </Card>
          {history.slice(0, 6).map((m) => (
            <DroneMissionCard key={m.id} mission={m} plot={plot} />
          ))}
        </>
      ) : null}

      {!plot ? <EmptyState icon="paper-plane-outline" title={t('drone.noPlot')} /> : null}
    </Screen>
  );
}

function LimitStat({
  label,
  value,
  limit,
  ok,
}: {
  label: string;
  value: string;
  limit: string;
  ok: boolean;
}) {
  const { fg } = toneColors(ok ? 'ok' : 'danger');
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.limitValue, { color: fg }]}>{value}</Text>
      <Text style={s.limitLabel}>{label}</Text>
      <Text style={s.limitLimit}>{limit}</Text>
    </View>
  );
}

function TotalStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.totalValue}>{value}</Text>
      <Text style={s.limitLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  planLead: { ...typography.small, color: colors.text, fontWeight: '600', marginBottom: spacing.sm },
  planLine: {
    ...typography.tiny,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
  },
  planProblemRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  planProblemText: { ...typography.tiny, color: colors.warn, flex: 1, lineHeight: 16 },
  linkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.sm + 2,
    backgroundColor: colors.infoBg,
    borderRadius: radii.sm,
  },
  linkText: { ...typography.tiny, color: colors.info, flex: 1, lineHeight: 16 },
  muted: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  flightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flightTitle: { ...typography.bodyStrong },
  flightReason: { ...typography.small, color: colors.text, marginTop: 2, lineHeight: 18 },
  limitRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  limitValue: { ...typography.bodyStrong },
  limitLabel: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint, marginTop: 2 },
  limitLimit: { fontSize: 9, fontWeight: '500', color: colors.textFaint, marginTop: 1 },
  calmNote: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.md },
  createRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  savingsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: spacing.md },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  policyText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 18 },
  totalsRow: { flexDirection: 'row' },
  totalValue: { ...typography.h2, color: colors.text },
});
