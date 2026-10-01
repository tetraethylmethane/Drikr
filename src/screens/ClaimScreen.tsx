import React, { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cropProfile } from '../config/agronomy';
import { fetchDroneData } from '../services/flightEvidence';
import { usePlotState } from '../hooks/useTelemetry';
import { useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { AppHeader, Button, Card, EmptyState, Pill, Screen, SectionTitle } from '../components/ui';

/**
 * Crop insurance (PMFBY) claim pack.
 *
 * Under PMFBY a localised loss (hail, flood, landslide, cloudburst, fire, pest
 * attack...) has to be reported within 72 hours, to the insurance company,
 * the bank, the agriculture office, the Crop Insurance app or the 14447
 * helpline. What usually sinks a claim is proof: when, where, how much. This
 * screen puts the field, the crop, the date and geotagged photos - including the
 * drone's - into one PDF the farmer can share on WhatsApp or print.
 *
 * It does not file the claim. Filing is with the insurer; the screen says so
 * and gives the numbers.
 */

const CAUSES = ['flood', 'drought', 'hail', 'unseasonalRain', 'cyclone', 'pest', 'disease', 'fire', 'other'] as const;
type Cause = (typeof CAUSES)[number];

interface Photo {
  uri: string;
  dataUri: string;
  lat?: number;
  lon?: number;
  at: number;
  fromDrone?: boolean;
}

const esc = (x: string) =>
  x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export default function ClaimScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { plot } = usePlotState();
  const profile = useAppSelector((s) => s.user.profile);

  const today = new Date().toISOString().slice(0, 10);
  const [cause, setCause] = useState<Cause | null>(null);
  const [lossDate, setLossDate] = useState(today);
  const [area, setArea] = useState(plot ? String(plot.areaAcres) : '');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!plot) {
    return (
      <Screen>
        <AppHeader title={t('claim.title')} onBack={() => navigation.goBack()} />
        <EmptyState icon="shield-outline" title={t('drone.noPlot')} action={t('fields.add')} onAction={() => navigation.navigate('FieldSetup')} />
      </Screen>
    );
  }

  const takePhoto = async () => {
    setMsg(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setMsg(t('claim.cameraDenied'));
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, exif: false });
    if (shot.canceled || !shot.assets[0]?.base64) return;
    let lat: number | undefined;
    let lon: number | undefined;
    try {
      const loc = await Location.requestForegroundPermissionsAsync();
      if (loc.granted) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      }
    } catch {
      /* the photo is still evidence without coordinates */
    }
    const a = shot.assets[0];
    setPhotos((p) => [...p, { uri: a.uri, dataUri: `data:image/jpeg;base64,${a.base64}`, lat, lon, at: Date.now() }]);
  };

  const addDronePhotos = async () => {
    setBusy('drone');
    setMsg(null);
    try {
      const { photos: rows } = await fetchDroneData();
      const withImg = rows.filter((r) => r.dataUri).slice(0, 8);
      if (withImg.length === 0) setMsg(t('claim.noDronePhotos'));
      setPhotos((p) => [
        ...p,
        ...withImg.map((r) => ({ uri: r.dataUri!, dataUri: r.dataUri!, lat: r.lat, lon: r.lon, at: r.timeMs, fromDrone: true })),
      ]);
    } catch {
      setMsg(t('claim.noDronePhotos'));
    } finally {
      setBusy(null);
    }
  };

  const makePdf = async () => {
    if (!cause) return setMsg(t('claim.pickCause'));
    setBusy('pdf');
    setMsg(null);
    try {
      const crop = cropProfile(plot.crop).label;
      const loc = plot.georef?.anchors?.[0] ?? plot.centroid;
      const rows: Array<[string, string]> = [
        [t('claim.farmer'), profile?.name ?? '—'],
        [t('claim.phone'), profile?.phoneNumber ?? '—'],
        [t('claim.place'), [profile?.district, profile?.state].filter(Boolean).join(', ') || '—'],
        [t('claim.field'), plot.name],
        [t('fields.crop'), crop],
        [t('claim.sown'), plot.sowingDate.slice(0, 10)],
        [t('claim.fieldArea'), `${plot.areaAcres} ${t('fields.acre')}`],
        [t('claim.affected'), `${area || '—'} ${t('fields.acre')}`],
        [t('claim.cause'), t(`claim.c_${cause}`)],
        [t('claim.lossDate'), lossDate],
        [t('claim.location'), loc && 'lat' in loc ? `${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}` : '—'],
      ];
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
body{font-family:sans-serif;padding:24px;color:#1b2b22}
h1{font-size:20px;margin:0 0 4px} .sub{color:#666;font-size:12px;margin-bottom:16px}
table{border-collapse:collapse;width:100%;font-size:13px} td{border:1px solid #ccc;padding:6px 8px;vertical-align:top}
td:first-child{width:38%;color:#555} .note{margin-top:14px;font-size:13px;white-space:pre-wrap}
.photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px} .ph{width:48%;font-size:11px;color:#555}
.ph img{width:100%;border-radius:6px} .foot{margin-top:18px;font-size:11px;color:#777}
</style></head><body>
<h1>${esc(t('claim.pdfTitle'))}</h1>
<div class="sub">${esc(t('claim.pdfSub', { date: new Date().toLocaleString('en-IN') }))}</div>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
${note.trim() ? `<div class="note"><b>${esc(t('claim.whatHappened'))}</b><br/>${esc(note.trim())}</div>` : ''}
<div class="photos">${photos
        .map(
          (p) =>
            `<div class="ph"><img src="${p.dataUri}"/>${esc(new Date(p.at).toLocaleString('en-IN'))}${
              p.lat != null && p.lon != null ? ` · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : ''
            }${p.fromDrone ? ` · ${esc(t('claim.fromDrone'))}` : ''}</div>`
        )
        .join('')}</div>
<div class="foot">${esc(t('claim.pdfFoot'))}</div>
</body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('claim.share') });
      } else {
        setMsg(t('claim.savedAt', { path: uri }));
      }
    } catch {
      setMsg(t('claim.pdfFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll>
      <AppHeader title={t('claim.title')} subtitle={`${plot.name} · ${cropProfile(plot.crop).label}`} onBack={() => navigation.goBack()} />

      <Card tone="warn">
        <View style={s.row}>
          <Ionicons name="time" size={20} color={colors.warn} />
          <Text style={s.urgent}>{t('claim.within72')}</Text>
        </View>
        <View style={s.actions}>
          <Button title={t('claim.call14447')} icon="call" size="sm" onPress={() => void Linking.openURL('tel:14447')} style={{ flex: 1 }} />
          <Button
            title={t('claim.website')}
            icon="open-outline"
            size="sm"
            variant="secondary"
            onPress={() => void Linking.openURL('https://pmfby.gov.in')}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      <SectionTitle title={t('claim.cause')} icon="alert-circle" />
      <Card>
        <View style={s.pills}>
          {CAUSES.map((c) => (
            <Pill key={c} label={t(`claim.c_${c}`)} active={cause === c} onPress={() => setCause(c)} />
          ))}
        </View>
        <Text style={s.label}>{t('claim.lossDate')}</Text>
        <TextInput style={s.input} value={lossDate} onChangeText={setLossDate} keyboardType="numbers-and-punctuation" />
        <Text style={s.label}>{t('claim.affectedAcres')}</Text>
        <TextInput style={s.input} value={area} onChangeText={setArea} keyboardType="decimal-pad" />
        <Text style={s.label}>{t('claim.whatHappened')}</Text>
        <TextInput
          style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
          value={note}
          onChangeText={setNote}
          multiline
          placeholder={t('claim.notePlaceholder')}
          placeholderTextColor={colors.textFaint}
          maxLength={1000}
        />
      </Card>

      <SectionTitle title={t('claim.photos')} icon="images" />
      <Card>
        <Text style={s.help}>{t('claim.photosHelp')}</Text>
        <View style={s.actions}>
          <Button title={t('claim.takePhoto')} icon="camera" size="sm" onPress={() => void takePhoto()} style={{ flex: 1 }} />
          <Button
            title={t('claim.dronePhotos')}
            icon="paper-plane"
            size="sm"
            variant="secondary"
            loading={busy === 'drone'}
            onPress={() => void addDronePhotos()}
            style={{ flex: 1 }}
          />
        </View>
        {photos.length > 0 ? (
          <View style={s.thumbs}>
            {photos.map((p, i) => (
              <Pressable key={`${p.at}-${i}`} onLongPress={() => setPhotos((x) => x.filter((_, j) => j !== i))}>
                <Image source={{ uri: p.uri }} style={s.thumb} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {photos.length > 0 ? <Text style={s.help}>{t('claim.removeHint')}</Text> : null}
      </Card>

      {msg ? <Text style={s.msg}>{msg}</Text> : null}
      <Button
        title={t('claim.makePdf')}
        icon="document-text"
        loading={busy === 'pdf'}
        onPress={() => void makePdf()}
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}
      />
      <Text style={[s.help, { marginHorizontal: spacing.lg }]}>{t('claim.notFiled')}</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  urgent: { ...typography.small, color: colors.text, flex: 1, lineHeight: 19, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
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
  help: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  thumb: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  msg: { ...typography.small, color: colors.warn, marginHorizontal: spacing.lg, marginTop: spacing.md },
});
