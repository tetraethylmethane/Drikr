import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  cachedEvidence,
  fetchDroneData,
  fetchPodLog,
  joinFlight,
  PhotoRow,
  PodLog,
  TrackRow,
  WaypointEvidence,
} from '../../services/flightEvidence';
import { uploadLastFlight, UploadResult } from '../../services/flightUpload';
import { useAppSelector } from '../../store/hooks';
import { colors, radii, spacing, typography } from '../../theme';
import { Badge, Button, Card } from '../ui';

/**
 * After a flight: the drone's GPS track and photos (recorded on this phone
 * during the flight), the AS7343 spectra from the plant sensor,
 * and one row per waypoint.
 *
 * Two buttons, in order, because the pod hosts its own WiFi. Each download is
 * cached, so the farmer can switch networks in Settings and come back.
 */
export function FlightResults({
  autoLoad = false,
}: {
  /** Load the phone's own flight data straight away (the simple scout flow). */
  autoLoad?: boolean;
}) {
  const { t } = useTranslation();
  const cached = cachedEvidence();
  const [track, setTrack] = useState<TrackRow[] | null>(cached.track);
  const [photos, setPhotos] = useState<PhotoRow[] | null>(cached.photos);
  const [pod, setPod] = useState<PodLog | null>(cached.pod);
  const [busy, setBusy] = useState<'drone' | 'pod' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const sharePhotos = useAppSelector((s) => s.settings.sharePhotos);
  const plot = useAppSelector((s) => s.farm.plots.find((p) => p.id === s.farm.selectedPlotId) ?? s.farm.plots[0]);
  const [cloud, setCloud] = useState<UploadResult | 'sending' | null>(null);

  // With the farmer's consent, the flight's photos go to train the crop AI.
  // Right after landing the phone is often still on the drone's WiFi, with no
  // internet; a failed upload is retried at the next app start.
  const shareFlight = async () => {
    if (sharePhotos !== true) return;
    setCloud('sending');
    setCloud(await uploadLastFlight({ plotId: plot?.id, crop: plot?.crop, stage: plot?.stage }));
  };

  const evidence = useMemo(
    () => (track ? joinFlight(track, photos ?? [], pod) : null),
    [track, photos, pod]
  );

  const getBridge = async () => {
    setBusy('drone');
    setNote(null);
    try {
      const r = await fetchDroneData();
      setTrack(r.track);
      setPhotos(r.photos);
      setNote(t('drone.results.bridgeOk', { rows: r.track.length, photos: r.photos.length }));
      void shareFlight();
    } catch (e: any) {
      setNote(e?.message ?? t('drone.results.bridgeFailed'));
    } finally {
      setBusy(null);
    }
  };

  const getPod = async () => {
    setBusy('pod');
    setNote(null);
    try {
      const log = await fetchPodLog();
      setPod(log);
      setNote(
        log.skippedOtherBoot > 0
          ? t('drone.results.podOkSkipped', { rows: log.rows.length, skipped: log.skippedOtherBoot })
          : t('drone.results.podOk', { rows: log.rows.length })
      );
    } catch (e: any) {
      setNote(e?.message ?? t('drone.results.podFailed'));
    } finally {
      setBusy(null);
    }
  };

  // After a scout the photos are already on this phone: show them without
  // making the farmer find a button.
  useEffect(() => {
    if (autoLoad) void getBridge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  const lower = evidence?.waypoints.filter((w) => w.flag === 'lower').length ?? 0;

  return (
    <Card>
      <Text style={s.lead}>{t('drone.results.lead')}</Text>

      <View style={s.stepRow}>
        <Button
          title={track ? t('drone.results.bridgeAgain') : t('drone.results.getBridge')}
          icon={track ? 'checkmark' : 'airplane'}
          size="sm"
          variant={track ? 'secondary' : 'primary'}
          loading={busy === 'drone'}
          disabled={busy !== null}
          onPress={() => void getBridge()}
          style={{ flex: 1 }}
        />
        <Button
          title={pod ? t('drone.results.podAgain') : t('drone.results.getPod')}
          icon={pod ? 'checkmark' : 'color-palette'}
          size="sm"
          variant={pod ? 'secondary' : 'primary'}
          loading={busy === 'pod'}
          disabled={busy !== null}
          onPress={() => void getPod()}
          style={{ flex: 1 }}
        />
      </View>
      <Text style={s.hint}>{t('drone.results.wifiHintPhone')}</Text>
      {note ? <Text style={s.note}>{note}</Text> : null}
      {cloud && cloud !== 'none' ? (
        <View style={s.cloud}>
          <Ionicons
            name={cloud === 'failed' ? 'cloud-offline-outline' : cloud === 'sending' ? 'cloud-upload-outline' : 'cloud-done-outline'}
            size={15}
            color={cloud === 'failed' ? colors.warn : colors.ok}
          />
          <Text style={s.cloudText}>{t(`photosCloud.${cloud}`)}</Text>
        </View>
      ) : null}

      {evidence ? (
        evidence.waypoints.length === 0 ? (
          <Text style={s.hint}>{t('drone.results.noHolds')}</Text>
        ) : (
          <>
            <View style={s.summaryRow}>
              <Badge label={t('drone.results.points', { count: evidence.waypoints.length })} tone="info" />
              {pod ? (
                <Badge
                  label={t('drone.results.lowerCount', { count: lower })}
                  tone={lower > 0 ? 'warn' : 'ok'}
                />
              ) : (
                <Badge label={t('drone.results.noPodYet')} tone="neutral" />
              )}
            </View>
            {evidence.waypoints.map((w) => (
              <WaypointRow key={w.waypoint} w={w} />
            ))}
            {pod ? <Text style={s.hint}>{t('drone.results.relativeNote')}</Text> : null}
          </>
        )
      ) : null}
    </Card>
  );
}

function WaypointRow({ w }: { w: WaypointEvidence }) {
  const { t } = useTranslation();
  const tone = w.flag === 'lower' ? 'warn' : w.flag === 'normal' ? 'ok' : 'neutral';
  const label =
    w.flag === 'lower'
      ? t('drone.results.flagLower')
      : w.flag === 'normal'
        ? t('drone.results.flagNormal')
        : t('drone.results.flagNoData');

  return (
    <View style={s.wpRow}>
      {w.photo?.dataUri ? (
        <Image source={{ uri: w.photo.dataUri }} style={s.photo} resizeMode="cover" />
      ) : (
        <View style={[s.photo, s.noPhoto]}>
          <Ionicons name="image-outline" size={20} color={colors.textFaint} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={s.wpHead}>
          <Text style={s.wpTitle}>{t('drone.results.waypoint', { n: w.waypoint })}</Text>
          <Badge label={label} tone={tone} />
        </View>
        {/* "Walk me there": the maps app knows the way; a coordinate does not help a farmer. */}
        <Pressable
          onPress={() => void Linking.openURL(`https://maps.google.com/?q=${w.position.lat},${w.position.lon}`)}
          hitSlop={8}
        >
          <Text style={s.mapLink}>
            <Ionicons name="navigate" size={11} color={colors.info} /> {t('drone.results.showOnMap')}
          </Text>
        </Pressable>
        <Text style={s.meta}>
          {t('drone.results.holdSummary', {
            secs: Math.round((w.holdEndMs - w.holdStartMs) / 1000),
            samples: w.samples,
          })}
        </Text>
        {w.redEdgeRaw !== undefined ? (
          <Text style={s.meta}>
            {`Red-edge ${w.redEdgeRaw.toFixed(3)} · NDVI* ${w.ndviRaw!.toFixed(3)}`}
            {w.saturatedSamples ? ` · ${t('drone.results.tooBright', { n: w.saturatedSamples })}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cloud: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  cloudText: { ...typography.tiny, color: colors.textMuted, flex: 1 },
  lead: { ...typography.small, color: colors.text, lineHeight: 19 },
  stepRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  hint: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  note: { ...typography.tiny, color: colors.info, marginTop: spacing.sm, lineHeight: 16 },
  summaryRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: spacing.md },
  wpRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  photo: { width: 84, height: 56, borderRadius: radii.sm, backgroundColor: colors.border },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  wpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  wpTitle: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.tiny, color: colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  mapLink: { ...typography.tiny, color: colors.info, marginTop: 4, fontWeight: '600' },
});
