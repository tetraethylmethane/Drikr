import React, { useEffect, useState } from 'react';
import { Alert as RNAlert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ensureSignedIn } from '../config/firebase';
import { cancelSensorKit, requestSensorKit, watchMySensorKit } from '../services/sync';
import { useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { SensorKitRequest } from '../types';
import { AppHeader, Button, Card, Screen } from '../components/ui';

/**
 * Free sensors. Drikr gives the kit and installs it; the farmer only asks.
 *
 * The request carries the field's location and size so the team can plan the
 * visit, and the status (asked, visit fixed, installed) comes back live. Once
 * installed, the next step is pairing the phone with the base station.
 */
export default function SensorKitScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const profile = useAppSelector((s) => s.user.profile);
  const { plots, selectedPlotId, usingDemoFarm } = useAppSelector((s) => s.farm);
  const online = useAppSelector((s) => s.telemetry.online);
  const plot = usingDemoFarm ? null : plots.find((p) => p.id === selectedPlotId) ?? plots[0] ?? null;

  const [kit, setKit] = useState<SensorKitRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = () => {};
    void ensureSignedIn().then(() => {
      stop = watchMySensorKit(setKit);
    });
    return () => stop();
  }, []);

  const ask = async () => {
    setBusy(true);
    const ok = await requestSensorKit({
      phone: profile?.phoneNumber,
      name: profile?.name,
      district: profile?.district,
      plotId: plot?.id,
      plotName: plot?.name,
      acres: plot?.areaAcres,
      crop: plot?.crop,
      lat: plot?.centroid?.lat,
      lon: plot?.centroid?.lon,
    });
    setBusy(false);
    RNAlert.alert(t('kit.title'), ok ? t('kit.sent') : t('kit.failed'));
  };

  const status = kit && kit.status !== 'cancelled' ? kit.status : null;
  const steps: { key: SensorKitRequest['status']; label: string }[] = [
    { key: 'requested', label: t('kit.s_requested') },
    { key: 'scheduled', label: t('kit.s_scheduled') },
    { key: 'installed', label: t('kit.s_installed') },
  ];
  const reached = status ? steps.findIndex((s) => s.key === status) : -1;

  return (
    <Screen scroll>
      <AppHeader title={t('kit.title')} onBack={() => navigation.goBack()} />

      <Card>
        <View style={s.hero}>
          <Ionicons name="gift" size={34} color={colors.brand} />
          <Text style={s.heroTitle}>{t('kit.free')}</Text>
        </View>
        <Text style={s.body}>{t('kit.what')}</Text>
        {[t('kit.item1'), t('kit.item2'), t('kit.item3')].map((x) => (
          <View key={x} style={s.item}>
            <Ionicons name="checkmark-circle" size={18} color={colors.ok} />
            <Text style={s.itemText}>{x}</Text>
          </View>
        ))}
      </Card>

      {status ? (
        <Card>
          <Text style={s.h}>{t('kit.statusTitle')}</Text>
          {steps.map((st, i) => (
            <View key={st.key} style={s.step}>
              <Ionicons
                name={i <= reached ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={i <= reached ? colors.ok : colors.textFaint}
              />
              <Text style={[s.stepText, i <= reached && { color: colors.text, fontWeight: '700' }]}>{st.label}</Text>
            </View>
          ))}
          {kit?.visitOn ? <Text style={s.body}>{t('kit.visitOn', { date: kit.visitOn })}</Text> : null}
          {status === 'installed' ? (
            <Button title={t('kit.connect')} icon="link" onPress={() => navigation.navigate('SensorSetup')} style={{ marginTop: spacing.md }} />
          ) : (
            <Button
              title={t('kit.cancel')}
              variant="secondary"
              onPress={() => void cancelSensorKit()}
              style={{ marginTop: spacing.md }}
            />
          )}
        </Card>
      ) : (
        <View style={{ marginHorizontal: spacing.lg }}>
          {!plot ? <Text style={s.warn}>{t('kit.addFieldFirst')}</Text> : null}
          {!online ? <Text style={s.warn}>{t('kit.offline')}</Text> : null}
          <Button title={t('kit.request')} icon="gift" size="lg" loading={busy} onPress={() => void ask()} />
          <Button
            title={t('kit.haveSensors')}
            variant="secondary"
            onPress={() => navigation.navigate('SensorSetup')}
            style={{ marginTop: spacing.md }}
          />
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroTitle: { ...typography.h2, color: colors.text, flex: 1 },
  h: { ...typography.bodyStrong, color: colors.text, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textMuted, marginTop: spacing.md, lineHeight: 22 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  itemText: { ...typography.body, color: colors.text, flex: 1 },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
  stepText: { ...typography.body, color: colors.textMuted },
  warn: {
    ...typography.small,
    color: colors.warn,
    backgroundColor: colors.warnBg,
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
});
