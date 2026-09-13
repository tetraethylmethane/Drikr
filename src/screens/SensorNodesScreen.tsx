import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { telemetrySource } from '../services/telemetry';
import { MasterStatus, fetchStatus, isKnown, setOutput } from '../services/hardware';
import { formatAge } from '../services/offline';
import { calibrateNode } from '../store/slices/farmSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, StatusTone, toneColors, typography } from '../theme';
import { SensorNode } from '../types';
import { AppHeader, Badge, Button, Card, Divider, Screen, SectionTitle } from '../components/ui';

/**
 * Sensor node health.
 *
 * Two of the deck's named risks live on this screen: sensor failure/drift, mitigated
 * by surfacing calibration age with a one-tap recalibration record, and poor
 * connectivity, made visible as signal strength per node. A monitoring system that
 * cannot report on its own hardware is not trustworthy.
 */
export default function SensorNodesScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const { plots, nodes } = useAppSelector((s) => s.farm);
  const readings = useAppSelector((s) => s.telemetry.readings);

  const byPlot = useMemo(() => {
    return plots.map((plot) => ({
      plot,
      nodes: nodes.filter((n) => n.plotId === plot.id),
    }));
  }, [plots, nodes]);

  // Only polled in hardware mode; there is no master to ask in simulator mode.
  const isHardware = telemetrySource() === 'hardware';
  const [master, setMaster] = useState<MasterStatus | null>(null);
  const [masterChecked, setMasterChecked] = useState(false);

  useEffect(() => {
    if (!isHardware) return;
    let cancelled = false;
    const poll = async () => {
      const st = await fetchStatus();
      if (!cancelled) {
        setMaster(st);
        setMasterChecked(true);
      }
    };
    void poll();
    const id = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isHardware]);

  const [relayBusy, setRelayBusy] = useState<string | null>(null);
  const toggleRelay = useCallback(async (nodeLabel: string, output: 1 | 2, on: boolean) => {
    setRelayBusy(nodeLabel + '-' + output);
    await setOutput(nodeLabel, output, on);
    setRelayBusy(null);
  }, []);

  const totals = useMemo(() => {
    const online = nodes.filter((n) => n.status === 'online').length;
    // isKnown guards matter here: real LoRa nodes report no battery or
    // calibration date and carry UNKNOWN_METRIC (-1), which would otherwise be
    // counted as a flat battery and an overdue calibration on every node.
    const lowBattery = nodes.filter((n) => isKnown(n.batteryPct) && n.batteryPct < 25).length;
    const needsCalibration = nodes.filter(
      (n) => isKnown(n.daysSinceCalibration) && n.daysSinceCalibration > 30
    ).length;
    return { total: nodes.length, online, lowBattery, needsCalibration };
  }, [nodes]);

  return (
    <Screen scroll>
      <AppHeader title={t('nodes.title')} subtitle={t('nodes.subtitle')} onBack={() => navigation.goBack()} />

      <Card>
        <View style={s.summaryRow}>
          <Summary label={t('nodes.online')} value={`${totals.online}/${totals.total}`} tone={totals.online === totals.total ? 'ok' : 'warn'} />
          <Summary label={t('nodes.lowBattery')} value={String(totals.lowBattery)} tone={totals.lowBattery > 0 ? 'warn' : 'ok'} />
          <Summary
            label={t('nodes.needCalibration')}
            value={String(totals.needsCalibration)}
            tone={totals.needsCalibration > 0 ? 'warn' : 'ok'}
          />
        </View>
        <Text style={s.sourceNote}>
          {isHardware ? t('nodes.hardwareNote') : t('nodes.simulatedNote')}
        </Text>
      </Card>

      {isHardware ? (
        <Card tone={master ? (master.loraReady ? 'ok' : 'warn') : 'danger'}>
          <View style={s.masterRow}>
            <Ionicons
              name={master ? (master.loraReady ? 'radio' : 'warning') : 'cloud-offline'}
              size={18}
              color={master ? (master.loraReady ? colors.ok : colors.warn) : colors.danger}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.masterTitle}>
                {master
                  ? master.loraReady
                    ? t('nodes.masterOk')
                    : t('nodes.masterNoLora')
                  : masterChecked
                    ? t('nodes.masterUnreachable')
                    : t('nodes.masterChecking')}
              </Text>
              {master ? (
                <Text style={s.sourceNote}>
                  {master.mode === 'station' ? t('nodes.modeStation') : t('nodes.modeAp')}
                  {' \u00b7 '}
                  {master.ip}
                </Text>
              ) : masterChecked ? (
                <Text style={s.sourceNote}>{t('nodes.masterUnreachableHelp')}</Text>
              ) : null}
            </View>
          </View>
        </Card>
      ) : null}

      {byPlot.map(({ plot, nodes: plotNodes }) => (
        <React.Fragment key={plot.id}>
          <SectionTitle title={plot.name} icon="map" />
          {plotNodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              lastReadingAt={readings[node.id]?.at}
              onCalibrate={() => dispatch(calibrateNode(node.id))}
              onToggleRelay={isHardware ? toggleRelay : undefined}
              relayBusy={relayBusy}
            />
          ))}
        </React.Fragment>
      ))}

      {/* Hardware reference from the deck's BOM */}
      <SectionTitle title={t('nodes.hardware')} icon="hardware-chip" />
      <Card>
        <HardwareRow label={t('nodes.soilProbe')} detail="Soil moisture, pH, EC, NPK" />
        <HardwareRow label="BME688" detail={t('nodes.bme')} />
        <HardwareRow label={t('nodes.canopy')} detail="Leaf wetness, light, rain, wind" />
        <HardwareRow label={t('nodes.biosensor')} detail={t('nodes.biosensorDetail')} />
      </Card>
    </Screen>
  );
}

function NodeCard({
  node,
  lastReadingAt,
  onCalibrate,
  onToggleRelay,
  relayBusy,
}: {
  node: SensorNode;
  lastReadingAt?: number;
  onCalibrate: () => void;
  onToggleRelay?: (nodeLabel: string, output: 1 | 2, on: boolean) => void;
  relayBusy?: string | null;
}) {
  const { t } = useTranslation();
  const statusTone: StatusTone =
    node.status === 'online' ? 'ok' : node.status === 'degraded' ? 'warn' : 'danger';
  const batteryTone: StatusTone = node.batteryPct < 20 ? 'danger' : node.batteryPct < 40 ? 'warn' : 'ok';
  const calTone: StatusTone =
    node.daysSinceCalibration > 45 ? 'danger' : node.daysSinceCalibration > 30 ? 'warn' : 'ok';

  const batteryIcon = !isKnown(node.batteryPct)
    ? 'battery-half'
    : node.batteryPct > 70
      ? 'battery-full'
      : node.batteryPct > 30
        ? 'battery-half'
        : 'battery-dead';

  return (
    <Card>
      <View style={s.nodeTop}>
        <View style={[s.nodeIcon, { backgroundColor: toneColors(statusTone).bg }]}>
          <Ionicons name="hardware-chip" size={18} color={toneColors(statusTone).fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.nodeName}>
            {node.label}
            {node.hasBiosensor ? ` · ${t('nodes.withBiosensor')}` : ''}
          </Text>
          <Text style={s.nodeMeta}>
            Grid {node.gridRef.row + 1},{node.gridRef.col + 1} ·{' '}
            {lastReadingAt ? formatAge(lastReadingAt) : formatAge(node.lastSeenAt)}
          </Text>
        </View>
        <Badge
          label={
            node.status === 'online'
              ? t('nodes.statusOnline')
              : node.status === 'degraded'
                ? t('nodes.statusDegraded')
                : t('nodes.statusOffline')
          }
          tone={statusTone}
        />
      </View>

      {/* A dash means the protocol carries no such field, not a reading of zero. */}
      <View style={s.metricsRow}>
        <NodeMetric
          icon={batteryIcon}
          label={t('nodes.battery')}
          value={isKnown(node.batteryPct) ? node.batteryPct + '%' : '\u2014'}
          tone={isKnown(node.batteryPct) ? batteryTone : 'neutral'}
        />
        <NodeMetric
          icon="cellular"
          label={t('nodes.signal')}
          value={isKnown(node.signalPct) ? node.signalPct + '%' : '\u2014'}
          tone={isKnown(node.signalPct) ? (node.signalPct < 30 ? 'warn' : 'ok') : 'neutral'}
        />
        <NodeMetric
          icon="options"
          label={t('nodes.calibrated')}
          value={isKnown(node.daysSinceCalibration) ? node.daysSinceCalibration + 'd' : '\u2014'}
          tone={isKnown(node.daysSinceCalibration) ? calTone : 'neutral'}
        />
      </View>

      {onToggleRelay ? (
        <>
          <Divider style={{ marginTop: spacing.md }} />
          <Text style={s.relayLabel}>{t('nodes.outputs')}</Text>
          <View style={s.relayRow}>
            <Button
              title={t('nodes.output') + ' 1'}
              icon="flash"
              size="sm"
              variant="secondary"
              loading={relayBusy === node.label + '-1'}
              onPress={() => onToggleRelay(node.label, 1, true)}
              style={{ flex: 1 }}
            />
            <Button
              title={t('nodes.output') + ' 2'}
              icon="flash"
              size="sm"
              variant="secondary"
              loading={relayBusy === node.label + '-2'}
              onPress={() => onToggleRelay(node.label, 2, true)}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={s.relayHelp}>{t('nodes.outputsHelp')}</Text>
        </>
      ) : null}

      {isKnown(node.daysSinceCalibration) && node.daysSinceCalibration > 30 ? (
        <View style={s.calibrateRow}>
          <Text style={s.calibrateNote}>{t('nodes.driftWarning')}</Text>
          <Button title={t('nodes.markCalibrated')} size="sm" variant="secondary" onPress={onCalibrate} />
        </View>
      ) : null}
    </Card>
  );
}

function NodeMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: StatusTone;
}) {
  const { fg } = toneColors(tone);
  return (
    <View style={s.nodeMetric}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={15} color={fg} />
      <Text style={[s.nodeMetricValue, { color: fg }]}>{value}</Text>
      <Text style={s.nodeMetricLabel}>{label}</Text>
    </View>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.summaryValue, { color: toneColors(tone).fg }]}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

function HardwareRow({ label, detail }: { label: string; detail: string }) {
  return (
    <View style={s.hwRow}>
      <Ionicons name="ellipse" size={6} color={colors.accent} style={{ marginTop: 7 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.hwLabel}>{label}</Text>
        <Text style={s.hwDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  summaryRow: { flexDirection: 'row' },
  summaryValue: { ...typography.h1 },
  summaryLabel: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  sourceNote: {
    ...typography.tiny,
    color: colors.textFaint,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    lineHeight: 16,
  },
  nodeTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nodeIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeName: { ...typography.bodyStrong, color: colors.text },
  nodeMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  metricsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nodeMetric: { flex: 1, alignItems: 'center', gap: 2 },
  nodeMetricValue: { ...typography.bodyStrong },
  nodeMetricLabel: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint },
  calibrateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.warnBg,
    borderRadius: radii.sm,
  },
  calibrateNote: { ...typography.tiny, color: colors.warn, flex: 1, lineHeight: 15 },
  masterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  masterTitle: { ...typography.bodyStrong, color: colors.text },
  relayLabel: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.md },
  relayRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  relayHelp: { ...typography.tiny, color: colors.textFaint, marginTop: 6, lineHeight: 15 },
  hwRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  hwLabel: { ...typography.bodyStrong, color: colors.text },
  hwDetail: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
});
