import React, { useEffect, useMemo, useState } from 'react';
import { Alert as RNAlert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import indianDistricts from '../config/indianDistricts';
import { cropProfile } from '../config/agronomy';
import { ensureSignedIn } from '../config/firebase';
import { hasFirebase } from '../config/env';
import {
  acceptBooking,
  bookingContact,
  createBooking,
  setBookingStatus,
  watchDistrictBookings,
  watchMyBookings,
  watchMyJobs,
} from '../services/sync';
import { formatAge } from '../services/offline';
import { usePlotState } from '../hooks/useTelemetry';
import { updateProfile } from '../store/slices/userSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, StatusTone, typography } from '../theme';
import { DroneBooking } from '../types';
import { AppHeader, Badge, Button, Card, EmptyState, Pill, Screen, SectionTitle } from '../components/ui';

/**
 * Shared drones: one drone per village instead of one per farmer.
 *
 * A farmer asks for a spray or a check on a date; operators in the same district
 * (an FPO, a Custom Hiring Centre, a trained "Drone Didi") see open jobs and take
 * one. Phone numbers are exchanged only once a job is accepted. Payment is
 * between the two of them, per acre - the app shows the usual rate as a guide.
 */
export default function DroneBookingScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { plot } = usePlotState();
  const profile = useAppSelector((s) => s.user.profile);

  const [mode, setMode] = useState<'farmer' | 'operator'>('farmer');
  const [uid, setUid] = useState<string | null>(null);
  const [state, setState] = useState(profile?.state ?? '');
  const [district, setDistrict] = useState(profile?.district ?? '');
  const [picker, setPicker] = useState<'state' | 'district' | null>(null);
  const [job, setJob] = useState<'spray' | 'survey'>('spray');
  const [acres, setAcres] = useState(plot ? String(plot.areaAcres) : '');
  const [wantedOn, setWantedOn] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [mine, setMine] = useState<DroneBooking[]>([]);
  const [open, setOpen] = useState<DroneBooking[]>([]);
  const [jobs, setJobs] = useState<DroneBooking[]>([]);
  const [contacts, setContacts] = useState<Record<string, string | null>>({});

  useEffect(() => {
    void ensureSignedIn().then(setUid);
  }, []);
  useEffect(() => (uid ? watchMyBookings(uid, setMine) : undefined), [uid]);
  useEffect(() => (uid ? watchMyJobs(uid, setJobs) : undefined), [uid]);
  useEffect(() => (uid && district ? watchDistrictBookings(district, setOpen) : undefined), [uid, district]);

  // The farmer's number, for jobs this phone accepted.
  useEffect(() => {
    for (const j of jobs) {
      if (j.status === 'accepted' && contacts[j.id] === undefined) {
        void bookingContact(j.id).then((p) => setContacts((c) => ({ ...c, [j.id]: p })));
      }
    }
  }, [jobs, contacts]);

  const openJobs = useMemo(() => open.filter((b) => b.status === 'open' && b.farmerUid !== uid), [open, uid]);
  const name = profile?.name?.trim() || t('community.farmer');

  if (!hasFirebase()) {
    return (
      <Screen>
        <AppHeader title={t('book.title')} onBack={() => navigation.goBack()} />
        <EmptyState icon="cloud-offline-outline" title={t('book.offline')} />
      </Screen>
    );
  }

  const request = async () => {
    const a = parseFloat(acres);
    if (!district || !(a > 0)) return RNAlert.alert(t('book.needDetails'));
    setBusy(true);
    dispatch(updateProfile({ state: state || undefined, district }));
    const b: DroneBooking = {
      id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      farmerUid: uid ?? '',
      farmerName: name,
      state: state || undefined,
      district,
      crop: plot ? cropProfile(plot.crop).key : '',
      acres: a,
      job,
      wantedOn,
      ...(note.trim() ? { note: note.trim() } : null),
      status: 'open',
      at: Date.now(),
    };
    const clean = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as unknown as DroneBooking;
    const ok = await createBooking(clean, profile?.phoneNumber ?? null);
    setBusy(false);
    RNAlert.alert(ok ? t('book.sent') : t('book.failed'));
    if (ok) setNote('');
  };

  const accept = (b: DroneBooking) =>
    RNAlert.alert(t('book.acceptTitle'), t('book.acceptBody', { acres: b.acres, district: b.district }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('book.accept'),
        onPress: () =>
          void acceptBooking(b.id, name, profile?.phoneNumber ?? null).then((ok) => !ok && RNAlert.alert(t('book.failed'))),
      },
    ]);

  const statusTone = (st: DroneBooking['status']): StatusTone =>
    st === 'open' ? 'info' : st === 'accepted' ? 'ok' : st === 'done' ? 'neutral' : 'warn';

  const row = (b: DroneBooking, kind: 'mine' | 'open' | 'job') => (
    <Card key={`${kind}-${b.id}`}>
      <View style={s.top}>
        <Ionicons name={b.job === 'spray' ? 'water' : 'scan'} size={18} color={colors.brand} />
        <Text style={s.title}>
          {t(b.job === 'spray' ? 'book.spray' : 'book.survey')} · {b.acres} {t('fields.acre')}
          {b.crop ? ` · ${cropProfile(b.crop).label}` : ''}
        </Text>
        <Badge label={t(`book.s_${b.status}`)} tone={statusTone(b.status)} />
      </View>
      <Text style={s.meta}>
        {t('book.on', { date: b.wantedOn })} · {[b.village, b.district].filter(Boolean).join(', ')} · {formatAge(b.at)}
      </Text>
      {kind !== 'mine' ? <Text style={s.meta}>{b.farmerName}</Text> : null}
      {b.note ? <Text style={s.note}>{b.note}</Text> : null}

      {kind === 'mine' && b.status === 'accepted' ? (
        <View style={s.contact}>
          <Text style={s.meta}>{t('book.operator', { name: b.operatorName ?? '' })}</Text>
          {b.operatorPhone ? (
            <Button title={t('book.call')} icon="call" size="sm" onPress={() => void Linking.openURL(`tel:${b.operatorPhone}`)} />
          ) : null}
        </View>
      ) : null}
      {kind === 'mine' && (b.status === 'open' || b.status === 'accepted') ? (
        <Button title={t('book.cancel')} variant="ghost" size="sm" onPress={() => void setBookingStatus(b.id, 'cancelled')} style={{ alignSelf: 'flex-start' }} />
      ) : null}

      {kind === 'open' ? <Button title={t('book.accept')} size="sm" icon="checkmark" onPress={() => accept(b)} style={{ marginTop: spacing.sm }} /> : null}

      {kind === 'job' && b.status === 'accepted' ? (
        <View style={s.actions}>
          {contacts[b.id] ? (
            <Button title={t('book.call')} icon="call" size="sm" onPress={() => void Linking.openURL(`tel:${contacts[b.id]}`)} style={{ flex: 1 }} />
          ) : null}
          <Button title={t('book.done')} icon="checkmark-done" size="sm" variant="secondary" onPress={() => void setBookingStatus(b.id, 'done')} style={{ flex: 1 }} />
          <Button title={t('book.giveBack')} size="sm" variant="ghost" onPress={() => void setBookingStatus(b.id, 'open')} />
        </View>
      ) : null}
    </Card>
  );

  const districts = indianDistricts[state] ?? [];

  return (
    <Screen scroll>
      <AppHeader title={t('book.title')} subtitle={t('book.subtitle')} onBack={() => navigation.goBack()} />

      <View style={s.modes}>
        <Pill label={t('book.needDrone')} active={mode === 'farmer'} onPress={() => setMode('farmer')} icon="person" />
        <Pill label={t('book.iFly')} active={mode === 'operator'} onPress={() => setMode('operator')} icon="paper-plane" />
      </View>

      <Card>
        <Text style={s.label}>{t('book.where')}</Text>
        <View style={s.actions}>
          <Pressable style={s.select} onPress={() => setPicker('state')}>
            <Text style={s.selectText} numberOfLines={1}>{state || t('market.selectState')}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.brand} />
          </Pressable>
          <Pressable style={s.select} onPress={() => state && setPicker('district')}>
            <Text style={s.selectText} numberOfLines={1}>{district || t('market.selectDistrict')}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.brand} />
          </Pressable>
        </View>
      </Card>

      {mode === 'farmer' ? (
        <>
          <Card>
            <View style={s.modes}>
              <Pill label={t('book.spray')} active={job === 'spray'} onPress={() => setJob('spray')} icon="water" />
              <Pill label={t('book.survey')} active={job === 'survey'} onPress={() => setJob('survey')} icon="scan" />
            </View>
            <Text style={s.label}>{t('book.acres')}</Text>
            <TextInput style={s.input} value={acres} onChangeText={setAcres} keyboardType="decimal-pad" />
            <Text style={s.label}>{t('book.date')}</Text>
            <TextInput style={s.input} value={wantedOn} onChangeText={setWantedOn} keyboardType="numbers-and-punctuation" />
            <Text style={s.label}>{t('book.noteLabel')}</Text>
            <TextInput
              style={s.input}
              value={note}
              onChangeText={setNote}
              placeholder={t('book.notePlaceholder')}
              placeholderTextColor={colors.textFaint}
              maxLength={300}
            />
            <Text style={s.help}>{t('book.rate')}</Text>
            <Button title={t('book.request')} icon="send" loading={busy} onPress={() => void request()} style={{ marginTop: spacing.md }} />
            <Text style={s.help}>{t('book.privacy')}</Text>
          </Card>
          <SectionTitle title={t('book.myRequests')} icon="list" />
          {mine.length === 0 ? <Text style={s.empty}>{t('book.none')}</Text> : mine.map((b) => row(b, 'mine'))}
        </>
      ) : (
        <>
          <Card>
            <Text style={s.help}>{t('book.operatorLead')}</Text>
          </Card>
          <SectionTitle title={t('book.myJobs')} icon="briefcase" />
          {jobs.filter((j) => j.status === 'accepted').length === 0 ? (
            <Text style={s.empty}>{t('book.noJobs')}</Text>
          ) : (
            jobs.filter((j) => j.status === 'accepted').map((b) => row(b, 'job'))
          )}
          <SectionTitle title={t('book.openJobs', { district: district || '—' })} icon="search" />
          {!district ? (
            <Text style={s.empty}>{t('book.pickDistrict')}</Text>
          ) : openJobs.length === 0 ? (
            <Text style={s.empty}>{t('book.noOpen')}</Text>
          ) : (
            openJobs.map((b) => row(b, 'open'))
          )}
        </>
      )}

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={s.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 440 }}>
              {(picker === 'state' ? Object.keys(indianDistricts) : districts).map((item) => (
                <Pressable
                  key={item}
                  style={s.option}
                  onPress={() => {
                    if (picker === 'state') {
                      setState(item);
                      setDistrict('');
                    } else setDistrict(item);
                    setPicker(null);
                  }}
                >
                  <Text style={s.optionText}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  modes: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm, flexWrap: 'wrap' },
  label: { ...typography.tiny, color: colors.textMuted, fontWeight: '700', marginTop: spacing.md, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  select: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectText: { ...typography.small, color: colors.brand, fontWeight: '700', flex: 1 },
  help: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  empty: { ...typography.small, color: colors.textMuted, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  meta: { ...typography.tiny, color: colors.textMuted, marginTop: 4 },
  note: { ...typography.small, color: colors.text, marginTop: spacing.sm },
  contact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: '#0F2C2199', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg },
  option: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  optionText: { ...typography.body, color: colors.text },
});
