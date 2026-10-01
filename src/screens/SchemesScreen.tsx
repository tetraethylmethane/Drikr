import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '../theme';
import { AppHeader, Card, Divider, ListRow, Screen, SectionTitle } from '../components/ui';

/**
 * Government help, in one place and in the farmer's language: the schemes and
 * helplines a farmer actually uses, each one tap away. The app does not pretend
 * to be these services - it opens the official site or dials the official number.
 */

/**
 * Minimum Support Prices, ₹ per quintal, as announced by the Government of
 * India for Kharif 2025-26 and Rabi 2026-27. MSP is revised every season; the
 * season is shown with the table and the screen links to the official list.
 */
export const MSP: Array<{ key: string; price: number; season: 'kharif' | 'rabi' }> = [
  { key: 'paddy', price: 2369, season: 'kharif' },
  { key: 'jowar', price: 3699, season: 'kharif' },
  { key: 'bajra', price: 2775, season: 'kharif' },
  { key: 'ragi', price: 4886, season: 'kharif' },
  { key: 'maize', price: 2400, season: 'kharif' },
  { key: 'tur', price: 8000, season: 'kharif' },
  { key: 'moong', price: 8768, season: 'kharif' },
  { key: 'urad', price: 7800, season: 'kharif' },
  { key: 'groundnut', price: 7263, season: 'kharif' },
  { key: 'soybean', price: 5328, season: 'kharif' },
  { key: 'sunflower', price: 7721, season: 'kharif' },
  { key: 'cotton', price: 7710, season: 'kharif' },
  { key: 'wheat', price: 2585, season: 'rabi' },
  { key: 'barley', price: 2150, season: 'rabi' },
  { key: 'gram', price: 5875, season: 'rabi' },
  { key: 'masur', price: 7000, season: 'rabi' },
  { key: 'mustard', price: 6200, season: 'rabi' },
  { key: 'safflower', price: 6540, season: 'rabi' },
];

export default function SchemesScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const open = (url: string) => () => void Linking.openURL(url);

  return (
    <Screen scroll>
      <AppHeader title={t('schemes.title')} subtitle={t('schemes.subtitle')} onBack={() => navigation.goBack()} />

      <SectionTitle title={t('schemes.forYourField')} icon="leaf" />
      <Card padded={false}>
        <ListRow icon="flask" title={t('schemes.soilTitle')} subtitle={t('schemes.soilSub')} onPress={() => navigation.navigate('SoilCard')} />
        <Divider />
        <ListRow icon="shield-checkmark" title={t('schemes.claimTitle')} subtitle={t('schemes.claimSub')} onPress={() => navigation.navigate('Claim')} />
        <Divider />
        <ListRow icon="paper-plane" title={t('schemes.bookTitle')} subtitle={t('schemes.bookSub')} onPress={() => navigation.navigate('DroneBooking')} />
      </Card>

      <SectionTitle title={t('schemes.money')} icon="wallet" />
      <Card padded={false}>
        <ListRow
          icon="cash"
          title={t('schemes.pmkisanTitle')}
          subtitle={t('schemes.pmkisanSub')}
          onPress={open('https://pmkisan.gov.in/BeneficiaryStatus_New.aspx')}
        />
        <Divider />
        <ListRow icon="call" title={t('schemes.pmkisanCall')} subtitle="155261" onPress={open('tel:155261')} />
        <Divider />
        <ListRow icon="storefront" title={t('schemes.enamTitle')} subtitle={t('schemes.enamSub')} onPress={open('https://enam.gov.in')} />
      </Card>

      <SectionTitle title={t('schemes.mspTitle')} icon="pricetags" />
      <Card>
        <Text style={s.help}>{t('schemes.mspLead')}</Text>
        {(['kharif', 'rabi'] as const).map((season) => (
          <View key={season} style={{ marginTop: spacing.md }}>
            <Text style={s.season}>{t(season === 'kharif' ? 'schemes.kharif' : 'schemes.rabi')}</Text>
            {MSP.filter((m) => m.season === season).map((m) => (
              <View key={m.key} style={s.mspRow}>
                <Text style={s.mspCrop}>{t(`msp.${m.key}`)}</Text>
                <Text style={s.mspPrice}>₹{m.price.toLocaleString('en-IN')}</Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={[s.help, { marginTop: spacing.md }]}>{t('schemes.mspNote')}</Text>
        <Text style={s.link} onPress={open('https://agriwelfare.gov.in')}>
          agriwelfare.gov.in
        </Text>
      </Card>

      <SectionTitle title={t('schemes.advice')} icon="help-buoy" />
      <Card padded={false}>
        <ListRow icon="call" title={t('schemes.kccTitle')} subtitle={t('schemes.kccSub')} onPress={open('tel:18001801551')} />
        <Divider />
        <ListRow icon="school" title={t('schemes.kvkTitle')} subtitle={t('schemes.kvkSub')} onPress={open('https://kvk.icar.gov.in')} />
        <Divider />
        <ListRow
          icon="cloudy"
          title={t('schemes.imdTitle')}
          subtitle={t('schemes.imdSub')}
          onPress={open('https://play.google.com/store/apps/details?id=com.aas.meghdoot')}
        />
      </Card>

      <SectionTitle title={t('schemes.droneRules')} icon="airplane" />
      <Card>
        <Text style={s.body}>{t('schemes.droneRulesBody')}</Text>
        <Text style={s.link} onPress={open('https://digitalsky.dgca.gov.in')}>
          digitalsky.dgca.gov.in
        </Text>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  help: { ...typography.tiny, color: colors.textMuted, lineHeight: 16 },
  body: { ...typography.small, color: colors.text, lineHeight: 20 },
  season: { ...typography.tiny, color: colors.brand, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  mspRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mspCrop: { ...typography.body, color: colors.text },
  mspPrice: { ...typography.bodyStrong, color: colors.text },
  link: { ...typography.small, color: colors.brand, fontWeight: '700', marginTop: spacing.sm },
});
