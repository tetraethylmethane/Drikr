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
import { GeoAnchor, GeoPoint } from '../types';
import { AppHeader, Button, Card, Divider, Screen, SectionTitle } from '../components/ui';
import { SatelliteMap, satelliteMapAvailable } from '../components/domain/SatelliteMap';

/**
 * Field Location — ties the field drawing to the real world.
 *
 * Until this is done, nothing can fly. The app knows the field's shape in
 * normalised 0..1 space and knows one centre coordinate, which is not enough to
 * say where grid cell 3,5 is: a centre point carries no bearing and no scale.
 *
 * Two corners fix that, and there are two honest ways to get them. Neither is
 * better in general, so the farmer picks:
 *
 *  - **Walk there.** Stand at each corner for a GPS fix. Accurate to GPS
 *    (±3-5 m), needs no network, and is the only option that works in a field
 *    with no signal. Costs a walk to two corners.
 *  - **Tap a satellite map.** No walking, and it can be done at home on wifi.
 *    But it needs internet for map tiles, satellite imagery is often offset by
 *    more than GPS error, and it asks the farmer to recognise their own field
 *    from above, which is genuinely hard on a smallholding.
 *
 * Both produce the same thing — two `GeoAnchor`s — and both go through the same
 * `checkGeoref` guards. The methods differ only in how latitude and longitude
 * are obtained.
 *
 * The screen's real work is refusing a bad georeference. Anchors taken too
 * close together, or a second point placed at the wrong corner, both produce a
 * transform that looks perfectly reasonable on screen and is badly wrong on the
 * ground.
 */

const CANVAS = 260;

type Method = 'walk' | 'map';

export default function FieldLocationScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { plot } = usePlotState();

  const [method, setMethod] = useState<Method | null>(null);

  // Draft anchors keyed by the boundary vertex they belong to, so a farmer can
  // redo one fix without losing the other.
  const [draft, setDraft] = useState<Record<number, GeoAnchor>>(() => {
    const existing = plot?.georef?.anchors;
    if (!existing || !plot) return {};
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

  // Only the two most recent count; a third replaces the oldest.
  const pair = anchors.slice(-2);

  const check = useMemo(() => {
    if (!plot || pair.length < 2) return null;
    return checkGeoref(plot, { anchors: [pair[0].anchor, pair[1].anchor] });
  }, [plot, pair]);

  const record = useCallback(
    (vertex: number, p: GeoPoint, accuracyM?: number) => {
      if (!plot) return;
      const v = plot.boundary[vertex];
      setDraft((prev) => ({
        ...prev,
        [vertex]: { x: v.x, y: v.y, lat: p.lat, lon: p.lon, accuracyM, at: Date.now() },
      }));
      setSaved(false);
      setSelected(null);
    },
    [plot]
  );

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
      record(selected, { lat: pos.coords.latitude, lon: pos.coords.longitude }, pos.coords.accuracy ?? undefined);
    } catch {
      setError(t('fieldLoc.fixFailed'));
    } finally {
      setFixing(false);
    }
  }, [plot, selected, t, record]);

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
  const mapReady = satelliteMapAvailable();

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

      {/* Method choice, with the trade-offs stated rather than one silently
          chosen for them. Neither method is better in general. */}
      {method == null ? (
        <>
          <SectionTitle title={t('fieldLoc.chooseMethod')} icon="options" />
          <MethodCard
            icon="walk"
            title={t('fieldLoc.walkTitle')}
            pros={[t('fieldLoc.walkPro1'), t('fieldLoc.walkPro2'), t('fieldLoc.walkPro3')]}
            cons={[t('fieldLoc.walkCon1')]}
            onPress={() => setMethod('walk')}
          />
          <MethodCard
            icon="map"
            title={t('fieldLoc.mapTitle')}
            pros={[t('fieldLoc.mapPro1'), t('fieldLoc.mapPro2')]}
            cons={[t('fieldLoc.mapCon1'), t('fieldLoc.mapCon2'), t('fieldLoc.mapCon3')]}
            onPress={() => setMethod('map')}
            disabledNote={mapReady ? undefined : t('fieldLoc.mapNeedsBuild')}
          />
        </>
      ) : (
        <>
          <SectionTitle
            title={method === 'walk' ? t('fieldLoc.walkTitle') : t('fieldLoc.mapTitle')}
            icon={method === 'walk' ? 'walk' : 'map'}
            action={t('fieldLoc.change')}
            onAction={() => setMethod(null)}
          />

          {/* Step 1 of both flows: which corner are we placing? */}
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
                  const tap = () => {
                    setSelected(i);
                    setError(null);
                  };
                  return (
                    <React.Fragment key={i}>
                      <Circle
                        cx={p.x * CANVAS}
                        cy={p.y * CANVAS}
                        r={active ? 13 : 11}
                        fill={done ? colors.ok : active ? colors.brand : colors.surface}
                        stroke={done ? colors.ok : colors.brand}
                        strokeWidth={2}
                        onPress={tap}
                      />
                      <SvgText
                        x={p.x * CANVAS}
                        y={p.y * CANVAS + 4}
                        fontSize={10}
                        fontWeight="700"
                        fill={done || active ? '#FFFFFF' : colors.brand}
                        textAnchor="middle"
                        onPress={tap}
                      >
                        {done ? '✓' : String(i + 1)}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
              </Svg>
            </View>

            {selected == null ? (
              <Text style={s.hint}>{t('fieldLoc.tapHint')}</Text>
            ) : method === 'walk' ? (
              <>
                <Divider style={{ marginVertical: spacing.md }} />
                <Text style={s.instruction}>{t('fieldLoc.standAt', { corner: selected + 1 })}</Text>
                <Button
                  title={t('fieldLoc.takeFix')}
                  icon="navigate"
                  loading={fixing}
                  onPress={() => void takeFix()}
                  style={{ marginTop: spacing.md }}
                />
              </>
            ) : (
              <>
                <Divider style={{ marginVertical: spacing.md }} />
                <Text style={s.instruction}>{t('fieldLoc.tapOnMap', { corner: selected + 1 })}</Text>
              </>
            )}

            {error ? (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle" size={15} color={colors.danger} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
          </Card>

          {/* Step 2 of the map flow: tap the same corner on the imagery. */}
          {method === 'map' && selected != null ? (
            <Card>
              <SatelliteMap
                center={
                  pair[0] ? { lat: pair[0].anchor.lat, lon: pair[0].anchor.lon } : plot.centroid
                }
                picked={pair.map((p) => ({ lat: p.anchor.lat, lon: p.anchor.lon }))}
                labels={pair.map((p) => String(p.vertex + 1))}
                onPick={(p) => record(selected, p)}
                onTileError={() => setError(t('fieldLoc.tilesFailed'))}
              />
              <Text style={s.hint}>{t('fieldLoc.mapAccuracyNote')}</Text>
            </Card>
          ) : null}

          {/* Result */}
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
                        {t('fieldLoc.corner')} {vertex + 1}
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

                    {/* Problems block the save. A wrong georeference is worse
                        than none: none of it stops a flight, wrong sends the
                        aircraft somewhere confident and incorrect. */}
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
        </>
      )}
    </Screen>
  );
}

function MethodCard({
  icon,
  title,
  pros,
  cons,
  onPress,
  disabledNote,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  pros: string[];
  cons: string[];
  onPress: () => void;
  disabledNote?: string;
}) {
  return (
    <Card onPress={disabledNote ? undefined : onPress} tone={disabledNote ? undefined : 'info'}>
      <View style={s.methodTop}>
        <Ionicons name={icon} size={20} color={disabledNote ? colors.textFaint : colors.info} />
        <Text style={[s.methodTitle, disabledNote ? { color: colors.textMuted } : null]}>
          {title}
        </Text>
        {!disabledNote ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        ) : null}
      </View>
      {pros.map((p, i) => (
        <View key={`p${i}`} style={s.reasonRow}>
          <Ionicons name="checkmark" size={13} color={colors.ok} />
          <Text style={s.reasonText}>{p}</Text>
        </View>
      ))}
      {cons.map((c, i) => (
        <View key={`c${i}`} style={s.reasonRow}>
          <Ionicons name="remove" size={13} color={colors.warn} />
          <Text style={s.reasonText}>{c}</Text>
        </View>
      ))}
      {disabledNote ? <Text style={s.disabledNote}>{disabledNote}</Text> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  muted: { ...typography.tiny, color: colors.textMuted, lineHeight: 16 },
  lead: { ...typography.body, color: colors.text, marginBottom: spacing.sm, lineHeight: 20 },
  canvasWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  instruction: { ...typography.bodyStrong, color: colors.text, lineHeight: 20 },
  hint: { ...typography.tiny, color: colors.textFaint, marginTop: spacing.md, lineHeight: 16 },
  methodTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  methodTitle: { ...typography.h3, color: colors.text, flex: 1 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: 3 },
  reasonText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 18 },
  disabledNote: {
    ...typography.tiny,
    color: colors.warn,
    marginTop: spacing.md,
    lineHeight: 16,
  },
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
