import React, { useState } from 'react';
import { Alert as RNAlert, Linking, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import env from '../config/env';
import { currentUid } from '../config/firebase';
import { deleteMyCloudData } from '../services/sync';
import { signOut } from '../store/slices/userSlice';
import { setSharePhotos } from '../store/slices/settingsSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, spacing, typography } from '../theme';
import { AppHeader, Button, Card, Screen, SectionTitle } from '../components/ui';

/**
 * Privacy notice and the farmer's rights under the Digital Personal Data
 * Protection Act, 2023: what is collected and why, a copy of their data, and
 * erasing it - here, in their own language, without writing to anyone.
 */
export default function PrivacyScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s);
  const profile = state.user.profile;
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const sharePhotos = state.settings.sharePhotos === true;

  const exportData = async () => {
    setBusy('export');
    try {
      const copy = {
        exportedAt: new Date().toISOString(),
        profile,
        fields: state.farm.plots,
        alerts: state.alerts.items,
        droneFlights: state.drone.missions,
        communityPosts: state.community.posts,
        settings: state.settings,
      };
      await Share.share({ title: t('privacy.exportTitle'), message: JSON.stringify(copy, null, 1) });
    } finally {
      setBusy(null);
    }
  };

  const erase = () =>
    RNAlert.alert(t('privacy.deleteTitle'), t('privacy.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('privacy.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          const cloudOk = await deleteMyCloudData(profile?.phoneNumber ?? null);
          await AsyncStorage.clear().catch(() => undefined);
          dispatch(signOut());
          setBusy(null);
          RNAlert.alert(cloudOk ? t('privacy.deleted') : t('privacy.deletedLocalOnly'));
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);

  const section = (title: string, body: string) => (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.h}>{title}</Text>
      <Text style={s.p}>{body}</Text>
    </View>
  );

  return (
    <Screen scroll>
      <AppHeader title={t('privacy.title')} onBack={() => navigation.goBack()} />
      <Card>
        {section(t('privacy.whatTitle'), t('privacy.what'))}
        {section(t('privacy.whyTitle'), t('privacy.why'))}
        {section(t('privacy.whereTitle'), t('privacy.where'))}
        {section(t('privacy.shareTitle'), t('privacy.share'))}
        {section(t('privacy.keepTitle'), t('privacy.keep'))}
        {section(t('privacy.rightsTitle'), t('privacy.rights'))}
        {env.privacyContact ? (
          <>
            <Text style={s.h}>{t('privacy.contactTitle')}</Text>
            <Text style={s.link} onPress={() => void Linking.openURL(`mailto:${env.privacyContact}`)}>
              {env.privacyContact}
            </Text>
          </>
        ) : null}
        <Text style={[s.p, { marginTop: spacing.md }]} onPress={() => void Linking.openURL('https://drikr.vercel.app/privacy')}>
          drikr.vercel.app/privacy
        </Text>
      </Card>

      {/* Consent for the crop AI, changeable any time. */}
      <SectionTitle title={t('photosCloud.title')} icon="images" />
      <Card>
        <View style={s.switchRow}>
          <Text style={[s.p, { flex: 1, marginTop: 0 }]}>{t('photosCloud.consent')}</Text>
          <Switch
            value={sharePhotos}
            onValueChange={(v) => void dispatch(setSharePhotos(v))}
            trackColor={{ true: colors.brandLight, false: colors.borderStrong }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      {profile ? (
        <>
          <SectionTitle title={t('privacy.yourData')} icon="person-circle" />
          <Card>
            <Button title={t('privacy.export')} icon="download" variant="secondary" loading={busy === 'export'} onPress={() => void exportData()} />
            <Button title={t('privacy.delete')} icon="trash" variant="danger" loading={busy === 'delete'} onPress={erase} style={{ marginTop: spacing.md }} />
            <Text style={s.p}>{t('privacy.deleteNote')}</Text>
          </Card>
          {currentUid() ? (
            <Card>
              {/* Experts are added by hand under experts/{uid}; this is how
                  they tell the team which uid is theirs. */}
              <Text style={s.h}>{t('privacy.appIdTitle')}</Text>
              <Text selectable style={s.mono}>{currentUid()}</Text>
              <Text style={s.p}>{t('privacy.appIdHelp')}</Text>
              <Button
                title={t('privacy.appIdShare')}
                icon="share-social"
                variant="secondary"
                onPress={() => void Share.share({ message: `Drikr app ID: ${currentUid()}` })}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  h: { ...typography.bodyStrong, color: colors.text, marginBottom: 4 },
  p: { ...typography.small, color: colors.textMuted, lineHeight: 19, marginTop: spacing.sm },
  link: { ...typography.small, color: colors.brand, fontWeight: '700' },
  mono: { ...typography.small, color: colors.text, fontFamily: 'monospace' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
