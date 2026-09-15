import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { checkGeoref, MIN_ANCHOR_SEPARATION_M } from '../services/geo';
import { usePlotState } from '../hooks/useTelemetry';
import { updatePlot } from '../store/slices/farmSlice';
import { useAppDispatch } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { GeoAnchor } from '../types';
import { AppHeader, Button, Card, Divider, Screen, SectionTitle } from '../components/ui';

/**
 * Field Location — ties the field drawing to the real world.
 *
 * Until this is done, nothing can fly. The app knows the field's shape in
 * normalised 0..1 space and knows one centre coordinate, which is not enough to
 * say where grid cell 3,5 is: a centre point carries no bearing and no scale.
 *
 * The farmer picks two corners on the drawing and stands at each while the phone
 * takes a fix. Two corners rather than four because the dominant error is GPS
 * error, and that is reduced by putting the anchors *further apart*, not by
 * taking more of them — and each extra corner is another walk to the far end of
 * a field.
 *
 * The screen's real work is refusing a bad georeference. Two fixes taken too
 * close together, or the second one taken at the wrong corner, both produce a
 * transform that looks perfectly reasonable on screen and is badly wrong on the
 * ground. `checkGeoref` catches the second case by comparing the implied area
 * against the acreage the farmer already entered.
 */

const CANVAS = 260;

export default function FieldLocationScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { plot } = usePlotState();

  // Draft anchors, keyed by the boundary vertex they belong to, so a farmer can
  // redo one fix without losing the other.
  const [draft, setDraft] = useState<Record<number, GeoAnchor>>(() => {
    const existing = plot?.georef?.anchors;
    if (!existing || !plot) return {};
    // Match each saved anchor back to the boundary vertex it was taken at, so
    // reopening the screen shows those corners already ticked and lets the
    // farmer redo just one of them.
    const out: Record<number, GeoAnchor> = {};
    for (const a of existing) {
      const vertex = plot.boundary.findIndex(
        (p) => Math.abs(p.x - a.x) < 1e-6 && Math.abs(p.y - a.y) < 1e-6
      );
      if (vertex >= 0) out[vertex] = a;
    }
    return out;
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const anchors = useMemo(
    () =>
      Object.entries(draft)
        .map(([k, v]) => ({ vertex: Number(k), anchor: v }))
        .sort((a, b) => a.anchor.at - b.anchor.at),
    [draft]
  );

  // Only the first two anchors count; a third replaces the oldest.
  const pair = anchors.slice(-2);

  const check = useMemo(() => {
    if (!plot || pair.length < 2) return null;
    return checkGeoref(plot, {
      anchors: [pair[0].anchor, pair[1].anchor],
    });
  }, [plot, pair]);

  const takeFix = useCallback(async () => {
    if (!plot || selected == null) return;
    setError(null);
    setFixing(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError(t('fieldLoc.permissionDenied'));
        return;
      }
      // BestForNavigation rather than Balanced: Balanced can fall back to
      // network positioning, which in a rural area can be kilometres out and
      // would produce a confidently wrong georeference.
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const vertex = plot.boundary[selected];
      setDraft((prev) => ({
        ...prev,
        [selected]: {
          x: vertex.x,
          y: vertex.y,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? undefined,
          at: Date.now(),
        },
      }));
      setSaved(false);
      setSelected(null);
    } catch {
      setError(t('fieldLoc.fixFailed'));
    } finally {
      setFixing(false);
    }
  }, [plot, selected, t]);

  const save = useCallback(() => {
    if (!plot || pair.length < 2 || !check?.ok) return;
    dispatch(
      updatePlot({
        id: plot.id,
        changes: { georef: { anchors: [pair[0].anchor, pair[1].anchor] } },
      })
    );
    setSaved(true);
  }, [plot, pair, check, dispatch]);

  if (!plot) {
    return (
      <Screen scroll>
        <AppHeader title={t('fieldLoc.title')} onBack={() => navigation.goBack()} />
        <Card>
          <Text style={s.muted}>{t('fields.emptyBody')}</Text>
        </Card>
      </Screen>
    );
  }

  const points = plot.boundary.map((p) => `${p.x * CANVAS},${p.y * CANVAS}`).join(' ');

  return (
    <Screen scroll>
      <AppHeader
        title={t('fieldLoc.title')}
        subtitle={`${plot.name} · ${plot.areaAcres} ${t('fields.acre')}`}
        onBack={() => navigation.goBack()}
      />

      <Card>
        <Text style={s.lead}>{t('fieldLoc.lead')}</Text>
        <Text style={s.muted}>{t('fieldLoc.why', { metres: MIN_ANCHOR_SEPARATION_M })}</Text>
      </Card>

      {/* Tap a corner */}
      <SectionTitle title={t('fieldLoc.pickCorner')} icon="location" />
      <Card>
        <View style={s.canvasWrap}>
          <Svg width={CANVAS} height={CANVAS}>
            <Polygon
              points={points}
              fill={colors.surfaceAlt}
              stroke={colors.border}
              strokeWidth={1.5}
            />
            {plot.boundary.map((p, i) => {
              const done = Boolean(draft[i]);
              const active = selected === i;
              return (
                <React.Fragment key={i}>
                  <Circle
                    cx={p.x * CANVAS}
                    cy={p.y * CANVAS}
                    r={active ? 13 : 11}
                    fill={done ? colors.ok : active ? colors.brand : colors.surface}
                    stroke={done ? colors.ok : colors.brand}
                    strokeWidth={2}
                    onPress={() => {
                      setSelected(i);
                      setError(null);
                    }}
                  />
                  <SvgText
                    x={p.x * CANVAS}
                    y={p.y * CANVAS + 4}
                    fontSize={10}
                    fontWeight="700"
                    fill={done || active ? '#FFFFFF' : colors.brand}
                    textAnchor="middle"
                    onPress={() => {
                      setSelected(i);
                      setError(null);
                    }}
                  >
                    {done ? '✓' : String(i + 1)}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </View>

        {selected != null ? (
          <>
            <Divider style={{ marginVertical: spacing.md }} />
            <Text style={s.instruction}>
              {t('fieldLoc.standAt', { corner: selected + 1 })}
            </Text>
            <Button
              title={t('fieldLoc.takeFix')}
              icon="navigate"
              loading={fixing}
              onPress={() => void takeFix()}
              style={{ marginTop: spacing.md }}
            />
          </>
        ) : (
          <Text style={s.hint}>{t('fieldLoc.tapHint')}</Text>
        )}

        {error ? (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}
      </Card>

      {/* Fixes taken */}
      {pair.length > 0 ? (
        <>
          <SectionTitle title={t('fieldLoc.fixesTaken')} icon="pin" />
          <Card>
            {pair.map(({ vertex, anchor }, i) => (
              <View key={vertex} style={s.fixRow}>
                <View style={s.fixBadge}>
                  <Text style={s.fixBadgeText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fixCoord}>
                    {anchor.lat.toFixed(6)}, {anchor.lon.toFixed(6)}
                  </Text>
                  <Text style={s.muted}>
                    {t('fieldLoc.corner')} {vertex >= 0 ? vertex + 1 : '—'}
                    {anchor.accuracyM != null ? ` · ±${Math.round(anchor.accuracyM)} m` : ''}
                  </Text>
                </View>
              </View>
            ))}

            {check ? (
              <>
                <Divider style={{ marginVertical: spacing.md }} />
                <Text style={s.muted}>
                  {t('fieldLoc.separation', { m: Math.round(check.separationM) })}
                  {check.impliedAcres != null
                    ? ` · ${t('fieldLoc.implied', { acres: check.impliedAcres })}`
                    : ''}
                </Text>

                {/* Problems block the save. A georeference that is wrong is worse
                    than none at all: none of it stops a flight, and wrong sends
                    the aircraft somewhere confident and incorrect. */}
                {check.problems.map((p, i) => (
                  <View key={`p${i}`} style={s.errorRow}>
                    <Ionicons name="close-circle" size={15} color={colors.danger} />
                    <Text style={s.errorText}>{p}</Text>
                  </View>
                ))}
                {check.warnings.map((w, i) => (
                  <View key={`w${i}`} style={s.warnRow}>
                    <Ionicons name="warning" size={15} color={colors.warn} />
                    <Text style={s.warnText}>{w}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={s.hint}>{t('fieldLoc.needTwo')}</Text>
            )}

            {saved ? (
              <View style={s.okRow}>
                <Ionicons name="checkmark-circle" size={17} color={colors.ok} />
                <Text style={s.okText}>{t('fieldLoc.saved')}</Text>
              </View>
            ) : (
              <Button
                title={t('fieldLoc.save')}
                icon="save"
                onPress={save}
                disabled={!check?.ok}
                style={{ marginTop: spacing.md }}
              />
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  muted: { ...typography.tiny, color: colors.textMuted, lineHeight: 16 },
  lead: { ...typography.body, color: colors.text, marginBottom: spacing.sm, lineHeight: 20 },
  canvasWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  instruction: { ...typography.bodyStrong, color: colors.text, lineHeight: 20 },
  hint: { ...typography.tiny, color: colors.textFaint, marginTop: spacing.md, lineHeight: 16 },
  errorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  errorText: { ...typography.tiny, color: colors.danger, flex: 1, lineHeight: 16 },
  warnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  warnText: { ...typography.tiny, color: colors.warn, flex: 1, lineHeight: 16 },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  okText: { ...typography.small, color: colors.ok, fontWeight: '600', flex: 1 },
  fixRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  fixBadge: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixBadgeText: { ...typography.tiny, color: '#FFFFFF', fontWeight: '800' },
  fixCoord: { ...typography.small, color: colors.text, fontWeight: '600' },
});
