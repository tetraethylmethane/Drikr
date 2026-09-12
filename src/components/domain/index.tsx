import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DOMAIN_LABELS, cropProfile } from '../../config/agronomy';
import { missionEconomics, missionStatusLabel } from '../../services/drone';
import { colors, healthColor, radii, spacing, StatusTone, toneColors, typography } from '../../theme';
import {
  Alert,
  DroneMission,
  Plot,
  PlotSnapshot,
  RiskAssessment,
  RiskLevel,
  Severity,
} from '../../types';
import { Badge, Button, Card, ConfidenceBar } from '../ui';
import { DOMAIN_ICON, severityTone } from './AlertBanner';

export { StatTile, MiniStat } from './StatTile';
export { FieldHealthCanvas, HealthLegend } from './FieldHealthCanvas';
export { AlertBanner, DOMAIN_ICON, severityTone } from './AlertBanner';
export { RecommendationList } from './RecommendationCard';

export function riskTone(level: RiskLevel): StatusTone {
  return level === 'high' ? 'danger' : level === 'moderate' ? 'warn' : 'ok';
}

// --- Plot picker ------------------------------------------------------------

/** Header control for switching field, with each plot's live health beside it. */
export function PlotPicker({
  plots,
  selectedId,
  snapshots,
  onSelect,
}: {
  plots: Plot[];
  selectedId: string | null;
  snapshots: Record<string, PlotSnapshot>;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = plots.find((p) => p.id === selectedId) ?? plots[0];
  if (!current) return null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={s.pickerBtn} accessibilityLabel="Change field">
        <Ionicons name="map" size={14} color={colors.brand} />
        <Text style={s.pickerText}>{current.name}</Text>
        <Ionicons name="chevron-down" size={13} color={colors.brand} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.sheetTitle}>Select field</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {plots.map((p) => {
                const snap = snapshots[p.id];
                const active = p.id === current.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      onSelect(p.id);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [s.plotRow, active && s.plotRowActive, pressed && { opacity: 0.8 }]}
                  >
                    <View
                      style={[
                        s.plotSwatch,
                        { backgroundColor: snap ? healthColor(snap.healthIndex) : colors.surfaceSunken },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.plotName}>{p.name}</Text>
                      <Text style={s.plotMeta}>
                        {cropProfile(p.crop).label} · {p.areaAcres} acre · {p.stage}
                      </Text>
                    </View>
                    {snap ? (
                      <Badge label={`${snap.healthIndex}/100`} tone={riskTone(snap.risk)} />
                    ) : null}
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={colors.brand} style={{ marginLeft: 6 }} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// --- Risk breakdown ---------------------------------------------------------

/** One row per detection domain, so all five areas named in the PS are visible. */
export function RiskDomainRow({
  risk,
  threshold,
  onPress,
}: {
  risk: RiskAssessment;
  threshold: number;
  onPress?: () => void;
}) {
  const tone = riskTone(risk.level);
  const { fg, bg } = toneColors(tone);
  const suppressed = risk.confidence < threshold && risk.score >= 33;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.domainRow, pressed && onPress ? { opacity: 0.75 } : null]}
    >
      <View style={[s.domainIcon, { backgroundColor: bg }]}>
        <Ionicons name={DOMAIN_ICON[risk.domain]} size={16} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.domainTop}>
          <Text style={s.domainLabel}>{DOMAIN_LABELS[risk.domain]}</Text>
          <Text style={[s.domainScore, { color: fg }]}>{risk.score}</Text>
        </View>
        <View style={s.domainTrack}>
          <View style={[s.domainFill, { width: `${Math.max(2, risk.score)}%`, backgroundColor: fg }]} />
        </View>
        <Text style={s.domainTitle} numberOfLines={1}>
          {risk.title}
          {suppressed ? ' · below your alert threshold' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

// --- Drone mission ----------------------------------------------------------

export function DroneMissionCard({
  mission,
  plot,
  onConfirm,
  onAbort,
  onReschedule,
  compact,
}: {
  mission: DroneMission;
  plot: Plot | null;
  onConfirm?: () => void;
  onAbort?: () => void;
  onReschedule?: () => void;
  compact?: boolean;
}) {
  const econ = plot ? missionEconomics(mission, plot) : null;
  const tone: StatusTone =
    mission.status === 'blocked'
      ? 'danger'
      : mission.status === 'in_flight'
        ? 'info'
        : mission.status === 'completed'
          ? 'ok'
          : mission.status === 'proposed'
            ? 'warn'
            : 'neutral';

  const when = new Date(mission.scheduledAt);
  const timeLabel = when.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Card padded style={compact ? { marginHorizontal: 0 } : undefined}>
      <View style={s.missionTop}>
        <View style={[s.missionIcon, { backgroundColor: toneColors(tone).bg }]}>
          <Ionicons
            name={mission.type === 'spray' ? 'rainy' : 'eye'}
            size={18}
            color={toneColors(tone).fg}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.missionTitle}>
            {mission.type === 'spray' ? 'Precision spraying' : 'Aerial inspection'} · {mission.plotName}
          </Text>
          <Text style={s.missionMeta}>
            {timeLabel} · {mission.areaAcres} acre
            {mission.payload ? ` · ${mission.payload.litres} L` : ''}
          </Text>
        </View>
        <Badge label={missionStatusLabel(mission.status)} tone={tone} />
      </View>

      {mission.payload ? <Text style={s.missionPayload}>{mission.payload.chemical}</Text> : null}

      {mission.blockedReason ? (
        <View style={s.blockedRow}>
          <Ionicons name="warning" size={14} color={colors.danger} />
          <Text style={s.blockedText}>{mission.blockedReason}</Text>
        </View>
      ) : null}

      {mission.status === 'in_flight' && mission.coveragePct != null ? (
        <View style={{ marginTop: spacing.md }}>
          <View style={s.domainTrack}>
            <View
              style={[s.domainFill, { width: `${mission.coveragePct}%`, backgroundColor: colors.info }]}
            />
          </View>
          <Text style={s.missionMeta}>{mission.coveragePct}% coverage</Text>
        </View>
      ) : null}

      {econ && mission.type === 'spray' && mission.status !== 'completed' ? (
        <View style={s.econRow}>
          <EconStat label="Area treated" value={`${mission.areaAcres} / ${plot?.areaAcres} ac`} />
          <EconStat label="Chemical saved" value={`${econ.chemicalSavedPct}%`} tone="ok" />
          <EconStat label="Water" value={`${econ.waterLitres} L`} tone="ok" />
          <EconStat label="Cost" value={`₹${econ.droneCost}`} />
        </View>
      ) : null}

      {mission.status === 'completed' ? (
        <View style={s.econRow}>
          <EconStat label="Coverage" value={`${mission.coveragePct ?? 100}%`} tone="ok" />
          {econ ? <EconStat label="Saved vs manual" value={`₹${econ.saving}`} tone="ok" /> : null}
        </View>
      ) : null}

      {(onConfirm || onAbort || onReschedule) && mission.status !== 'completed' && mission.status !== 'aborted' ? (
        <View style={s.missionActions}>
          {mission.status === 'proposed' && onConfirm ? (
            <Button title="Confirm Schedule" onPress={onConfirm} style={{ flex: 1 }} />
          ) : null}
          {mission.status === 'blocked' && onReschedule ? (
            <Button title="Find next window" onPress={onReschedule} variant="secondary" style={{ flex: 1 }} />
          ) : null}
          {onAbort ? (
            <Button
              title={mission.status === 'proposed' ? 'Decline' : 'Abort'}
              onPress={onAbort}
              variant="secondary"
              style={mission.status === 'proposed' ? undefined : { flex: 1 }}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function EconStat({ label, value, tone }: { label: string; value: string; tone?: StatusTone }) {
  return (
    <View style={s.econStat}>
      <Text style={[s.econValue, tone ? { color: toneColors(tone).fg } : null]}>{value}</Text>
      <Text style={s.econLabel}>{label}</Text>
    </View>
  );
}

// --- Feedback ---------------------------------------------------------------

/**
 * Farmer confirmation on an alert.
 *
 * This is the feedback loop from the deck's model-improvement slide, and it is also
 * the honest way to handle false positives: the farmer is the ground truth, and
 * saying "no pest here" both clears the alert and records that the model was wrong.
 */
export function FeedbackPrompt({
  alert,
  onSubmit,
}: {
  alert: Alert;
  onSubmit: (wasAccurate: boolean) => void;
}) {
  if (alert.feedback) {
    return (
      <View style={s.feedbackDone}>
        <Ionicons
          name={alert.feedback.wasAccurate ? 'checkmark-circle' : 'close-circle'}
          size={15}
          color={alert.feedback.wasAccurate ? colors.ok : colors.textMuted}
        />
        <Text style={s.feedbackDoneText}>
          {alert.feedback.wasAccurate
            ? 'You confirmed this alert. Thank you — it helps the model.'
            : 'You marked this alert as inaccurate. The model will learn from it.'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={s.feedbackQ}>Was this alert correct for your field?</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
        <Button
          title="Yes, confirmed"
          icon="checkmark"
          onPress={() => onSubmit(true)}
          variant="secondary"
          size="sm"
          style={{ flex: 1 }}
        />
        <Button
          title="No, not accurate"
          icon="close"
          onPress={() => onSubmit(false)}
          variant="secondary"
          size="sm"
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

// --- Drivers ----------------------------------------------------------------

/** "Why did this fire?" — the evidence behind a risk score. */
export function DriverList({ drivers }: { drivers: RiskAssessment['drivers'] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {drivers.map((d, i) => (
        <View key={`${d.metric}-${i}`} style={s.driverRow}>
          <Text style={s.driverValue}>
            {d.value}
            <Text style={s.driverUnit}>{d.unit ? ` ${d.unit}` : ''}</Text>
          </Text>
          <Text style={s.driverNote}>{d.note}</Text>
        </View>
      ))}
    </View>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const label = severity.charAt(0).toUpperCase() + severity.slice(1);
  return <Badge label={label} tone={severityTone(severity)} />;
}

export function AlertConfidence({ alert, threshold }: { alert: Alert; threshold: number }) {
  return <ConfidenceBar confidence={alert.confidence} threshold={threshold} />;
}

const s = StyleSheet.create({
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerText: { ...typography.small, color: colors.brand, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: '#0F2C2199', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.md },
  plotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  plotRowActive: { backgroundColor: colors.surfaceAlt },
  plotSwatch: { width: 10, height: 32, borderRadius: 5 },
  plotName: { ...typography.bodyStrong, color: colors.text },
  plotMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  domainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  domainIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  domainTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  domainLabel: { ...typography.small, color: colors.text, fontWeight: '700' },
  domainScore: { ...typography.small, fontWeight: '800' },
  domainTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
    marginTop: 4,
  },
  domainFill: { height: '100%', borderRadius: 3 },
  domainTitle: { ...typography.tiny, color: colors.textMuted, marginTop: 4 },
  missionTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  missionIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionTitle: { ...typography.bodyStrong, color: colors.text },
  missionMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 3 },
  missionPayload: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: colors.dangerBg,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  blockedText: { ...typography.tiny, color: colors.danger, flex: 1 },
  econRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  econStat: { flex: 1 },
  econValue: { ...typography.bodyStrong, color: colors.text },
  econLabel: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint, marginTop: 2 },
  missionActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  feedbackQ: { ...typography.small, color: colors.text, fontWeight: '700' },
  feedbackDone: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedbackDoneText: { ...typography.tiny, color: colors.textMuted, flex: 1, lineHeight: 16 },
  driverRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  driverValue: { ...typography.bodyStrong, color: colors.text, minWidth: 70 },
  driverUnit: { ...typography.tiny, color: colors.textMuted },
  driverNote: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 18 },
});
