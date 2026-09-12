import React, { useState } from 'react';
import { Alert as RNAlert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DOMAIN_LABELS } from '../config/agronomy';
import { hasCloudAi } from '../config/env';
import { telemetrySource } from '../services/telemetry';
import { cacheClear, outboxCount } from '../services/offline';
import { requestPermission } from '../services/notifications';
import { clearSession } from '../utils/session';
import { clearPersistedState } from '../store/persist';
import { LANGUAGES, useLanguage } from '../hooks/useLanguage';
import { resetToDemoFarm } from '../store/slices/farmSlice';
import { clearAlerts } from '../store/slices/alertsSlice';
import { clearMissions } from '../store/slices/droneSlice';
import { signOut } from '../store/slices/userSlice';
import {
  setAutoSpeak,
  setConfidenceThreshold,
  setNotificationsEnabled,
  setRefreshSeconds,
  setRequireDroneConfirmation,
  setVoiceEnabled,
  toggleMutedDomain,
} from '../store/slices/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { RiskDomain } from '../types';
import { AppHeader, Badge, Button, Card, Divider, Screen, SectionTitle } from '../components/ui';

const DOMAINS: RiskDomain[] = ['cropHealth', 'pest', 'nutrient', 'irrigation', 'climate'];
const REFRESH_OPTIONS = [10, 20, 60, 300];

/**
 * Profile and settings.
 *
 * The confidence threshold is the important control here. It is the deck's stated
 * false-alert mitigation, and putting it in the farmer's hands rather than hard-coding
 * it is what lets someone who has been burned by a bad warning raise the bar and keep
 * using the app.
 */
export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language, change } = useLanguage();

  const profile = useAppSelector((s) => s.user.profile);
  const settings = useAppSelector((s) => s.settings);
  const { plots, usingDemoFarm } = useAppSelector((s) => s.farm);
  const alerts = useAppSelector((s) => s.alerts.items);
  const online = useAppSelector((s) => s.telemetry.online);

  const [queued, setQueued] = useState<number | null>(null);

  React.useEffect(() => {
    void outboxCount().then(setQueued);
  }, [alerts.length]);

  const handleSignOut = () => {
    RNAlert.alert(t('profile.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.signOut'),
        style: 'destructive',
        onPress: async () => {
          await clearSession();
          dispatch(signOut());
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  const handleResetData = () => {
    RNAlert.alert(t('profile.resetData'), t('profile.resetConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.reset'),
        style: 'destructive',
        onPress: async () => {
          dispatch(clearAlerts());
          dispatch(clearMissions());
          dispatch(resetToDemoFarm());
          await cacheClear();
          await clearPersistedState();
        },
      },
    ]);
  };

  const thresholdPct = Math.round(settings.confidenceThreshold * 100);

  return (
    <Screen scroll>
      <AppHeader title={t('profile.title')} />

      {/* Identity */}
      <Card>
        <View style={s.profileRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {(profile?.name ?? profile?.phoneNumber ?? 'DR').slice(-2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name}>{profile?.name ?? t('profile.farmer')}</Text>
            <Text style={s.phone}>{profile?.phoneNumber ?? t('profile.notSignedIn')}</Text>
            <View style={s.chipRow}>
              <Badge label={`${plots.length} ${t('profile.fields')}`} tone="neutral" icon="map" />
              {profile?.fpo ? <Badge label={profile.fpo} tone="info" icon="people" /> : null}
              {!online ? <Badge label={t('common.offline')} tone="warn" icon="cloud-offline" /> : null}
            </View>
          </View>
        </View>
      </Card>

      {/* Language */}
      <SectionTitle title={t('profile.language')} icon="language" />
      <Card>
        <Text style={s.help}>{t('profile.languageHelp')}</Text>
        <View style={s.langRow}>
          {LANGUAGES.map((l) => (
            <Pressable
              key={l.code}
              onPress={() => change(l.code)}
              style={({ pressed }) => [
                s.langBtn,
                language === l.code && s.langBtnActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[s.langNative, language === l.code && { color: '#fff' }]}>{l.native}</Text>
              <Text style={[s.langLabel, language === l.code && { color: '#FFFFFFBB' }]}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* Alerts & confidence */}
      <SectionTitle title={t('profile.alerts')} icon="notifications" />
      <Card>
        <ToggleRow
          icon="notifications"
          label={t('profile.pushAlerts')}
          help={t('profile.pushAlertsHelp')}
          value={settings.notificationsEnabled}
          onChange={async (v) => {
            if (v) {
              const granted = await requestPermission();
              dispatch(setNotificationsEnabled(granted));
              if (!granted) RNAlert.alert(t('profile.permissionNeeded'), t('profile.permissionBody'));
            } else {
              dispatch(setNotificationsEnabled(false));
            }
          }}
        />
        <Divider />

        <View style={s.thresholdBlock}>
          <View style={s.thresholdHeader}>
            <Ionicons name="shield-checkmark" size={17} color={colors.brandLight} />
            <Text style={s.rowLabel}>{t('profile.confidenceThreshold')}</Text>
            <Text style={s.thresholdValue}>{thresholdPct}%</Text>
          </View>
          <Text style={s.help}>{t('profile.confidenceHelp')}</Text>
          <View style={s.stepper}>
            {[40, 55, 70, 85].map((pct) => (
              <Pressable
                key={pct}
                onPress={() => dispatch(setConfidenceThreshold(pct / 100))}
                style={({ pressed }) => [
                  s.stepBtn,
                  thresholdPct === pct && s.stepBtnActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[s.stepText, thresholdPct === pct && { color: '#fff' }]}>{pct}%</Text>
                <Text style={[s.stepHint, thresholdPct === pct && { color: '#FFFFFFAA' }]}>
                  {pct <= 40 ? t('profile.moreAlerts') : pct >= 85 ? t('profile.fewerAlerts') : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Divider />

        <Text style={[s.rowLabel, { marginTop: spacing.md }]}>{t('profile.muteDomains')}</Text>
        <Text style={s.help}>{t('profile.muteHelp')}</Text>
        <View style={s.muteRow}>
          {DOMAINS.map((d) => {
            const muted = settings.mutedDomains.includes(d);
            return (
              <Pressable
                key={d}
                onPress={() => dispatch(toggleMutedDomain(d))}
                style={({ pressed }) => [s.muteChip, muted && s.muteChipOff, pressed && { opacity: 0.8 }]}
              >
                <Ionicons
                  name={muted ? 'notifications-off' : 'notifications'}
                  size={12}
                  color={muted ? colors.textFaint : colors.brand}
                />
                <Text style={[s.muteText, muted && { color: colors.textFaint }]}>{DOMAIN_LABELS[d]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Voice */}
      <SectionTitle title={t('profile.voice')} icon="mic" />
      <Card>
        <ToggleRow
          icon="mic"
          label={t('profile.voiceInput')}
          help={t('profile.voiceInputHelp')}
          value={settings.voiceEnabled}
          onChange={(v) => dispatch(setVoiceEnabled(v))}
        />
        <Divider />
        <ToggleRow
          icon="volume-high"
          label={t('profile.autoSpeak')}
          help={t('profile.autoSpeakHelp')}
          value={settings.autoSpeak}
          onChange={(v) => dispatch(setAutoSpeak(v))}
        />
      </Card>

      {/* Drone safety */}
      <SectionTitle title={t('profile.droneSafety')} icon="paper-plane" />
      <Card>
        <ToggleRow
          icon="lock-closed"
          label={t('profile.requireConfirmation')}
          help={t('profile.requireConfirmationHelp')}
          value={settings.requireDroneConfirmation}
          onChange={(v) => {
            if (!v) {
              RNAlert.alert(t('profile.autonomyWarning'), t('profile.autonomyBody'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('profile.iUnderstand'),
                  style: 'destructive',
                  onPress: () => dispatch(setRequireDroneConfirmation(false)),
                },
              ]);
            } else {
              dispatch(setRequireDroneConfirmation(true));
            }
          }}
        />
      </Card>

      {/* Data & sync */}
      <SectionTitle title={t('profile.dataSync')} icon="cloud" />
      <Card>
        <Text style={s.rowLabel}>{t('profile.refreshInterval')}</Text>
        <Text style={s.help}>{t('profile.refreshHelp')}</Text>
        <View style={s.stepper}>
          {REFRESH_OPTIONS.map((sec) => (
            <Pressable
              key={sec}
              onPress={() => dispatch(setRefreshSeconds(sec))}
              style={({ pressed }) => [
                s.stepBtn,
                settings.refreshSeconds === sec && s.stepBtnActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[s.stepText, settings.refreshSeconds === sec && { color: '#fff' }]}>
                {sec < 60 ? `${sec}s` : `${sec / 60}m`}
              </Text>
            </Pressable>
          ))}
        </View>

        <Divider style={{ marginVertical: spacing.md }} />

        <InfoRow label={t('profile.telemetrySource')} value={telemetrySource() === 'simulated' ? t('profile.simulated') : t('profile.hardware')} />
        <InfoRow label={t('profile.aiMode')} value={hasCloudAi() ? t('profile.cloudAi') : t('profile.onDeviceAi')} />
        <InfoRow label={t('profile.queuedWrites')} value={queued != null ? String(queued) : '—'} />
        <InfoRow label={t('profile.dataSet')} value={usingDemoFarm ? t('profile.demoFarm') : t('profile.ownFarm')} />
      </Card>

      {/* About */}
      <SectionTitle title={t('profile.about')} icon="information-circle" />
      <Card>
        <InfoRow label={t('profile.problemStatement')} value="SIH 2026 · PS 26180" />
        <InfoRow label={t('profile.team')} value="Drikr · H043" />
        <InfoRow label={t('profile.version')} value="1.0.0" />
        <Text style={s.aboutBody}>{t('profile.aboutBody')}</Text>
      </Card>

      <View style={s.dangerZone}>
        <Button title={t('profile.resetData')} variant="secondary" icon="refresh" onPress={handleResetData} />
        <Button title={t('profile.signOut')} variant="danger" icon="log-out" onPress={handleSignOut} />
      </View>
    </Screen>
  );
}

function ToggleRow({
  icon,
  label,
  help,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.toggleRow}>
      <Ionicons name={icon} size={18} color={colors.brandLight} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {help ? <Text style={s.help}>{help}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brandLight, false: colors.borderStrong }}
        thumbColor="#fff"
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  name: { ...typography.h2, color: colors.text },
  phone: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  help: { ...typography.tiny, color: colors.textMuted, marginTop: 3, lineHeight: 16 },
  rowLabel: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  langRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  langBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  langBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  langNative: { ...typography.bodyStrong, color: colors.text },
  langLabel: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint, marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  thresholdBlock: { paddingVertical: spacing.md },
  thresholdHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thresholdValue: { ...typography.h3, color: colors.brand },
  stepper: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  stepBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepText: { ...typography.small, color: colors.text, fontWeight: '700' },
  stepHint: { fontSize: 8.5, fontWeight: '600', color: colors.textFaint, marginTop: 1 },
  muteRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: spacing.md },
  muteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.brandLight + '44',
    backgroundColor: colors.surfaceAlt,
  },
  muteChipOff: { borderColor: colors.border, backgroundColor: colors.surfaceSunken },
  muteText: { ...typography.tiny, color: colors.brand },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md },
  infoLabel: { ...typography.small, color: colors.textMuted, flex: 1 },
  infoValue: { ...typography.small, color: colors.text, fontWeight: '700', textAlign: 'right' },
  aboutBody: {
    ...typography.tiny,
    color: colors.textFaint,
    marginTop: spacing.md,
    lineHeight: 17,
  },
  dangerZone: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.lg },
});
