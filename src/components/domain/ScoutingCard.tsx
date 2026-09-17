import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { daysUntilDue, ScoutingPlan } from '../../services/scouting';
import { colors, radii, spacing, typography } from '../../theme';
import { Button, Card } from '../ui';

/**
 * What a field with no sensors gets instead of a risk score.
 *
 * The distinction this card has to carry is the whole reason it exists: a
 * sensor field says "moisture is 28%, which is below the floor for this stage",
 * and that is a measurement. A scouting field can only say "this is the
 * fortnight Late Blight appears in tomato, and the next three days suit it" —
 * which is a reason to go and look, not a finding about this field.
 *
 * So there is deliberately no score, no gauge and no percentage here. Putting a
 * number on a calendar prediction would make it look like the sensor path, and
 * a farmer cannot be expected to remember which screens are measuring and which
 * are guessing.
 */
export function ScoutingCard({
  plan,
  onSurvey,
  surveying,
}: {
  plan: ScoutingPlan;
  onSurvey?: () => void;
  surveying?: boolean;
}) {
  const { t } = useTranslation();
  const due = daysUntilDue(plan);
  const favoured = plan.open.some((o) => o.state === 'favoured');

  return (
    <Card tone={plan.overdue ? (favoured ? 'warn' : 'info') : undefined}>
      <View style={s.top}>
        <Ionicons
          name={favoured ? 'alert-circle' : 'scan'}
          size={19}
          color={favoured ? colors.warn : colors.info}
        />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('scouting.title')}</Text>
          <Text style={s.sub}>
            {t('scouting.day', { days: plan.daysAfterSowing })}
            {' · '}
            {plan.overdue
              ? t('scouting.dueNow')
              : t('scouting.dueIn', { days: Math.max(0, due) })}
          </Text>
        </View>
      </View>

      {/* No calendar for this crop is a real state, not an error. */}
      {!plan.cropKnown ? (
        <Text style={s.body}>{t('scouting.noCalendar')}</Text>
      ) : plan.open.length === 0 ? (
        <Text style={s.body}>{t('scouting.nothingOpen', { days: plan.intervalDays })}</Text>
      ) : (
        <>
          <Text style={s.body}>
            {favoured
              ? t('scouting.favouredLead', { days: plan.intervalDays })
              : t('scouting.openLead', { days: plan.intervalDays })}
          </Text>

          {plan.open.map((o) => (
            <View key={o.window.disease} style={s.window}>
              <View style={s.windowHead}>
                <Text style={s.windowName}>{o.window.disease}</Text>
                <View
                  style={[
                    s.tag,
                    { backgroundColor: o.state === 'favoured' ? colors.warnBg : colors.infoBg },
                  ]}
                >
                  <Text
                    style={[
                      s.tagText,
                      { color: o.state === 'favoured' ? colors.warn : colors.info },
                    ]}
                  >
                    {o.state === 'favoured' ? t('scouting.weatherSuits') : t('scouting.inSeason')}
                  </Text>
                </View>
              </View>
              <Text style={s.lookFor}>{o.window.lookFor}</Text>
              {/* The reasons are shown because "the weather suits it" is a claim
                  the farmer should be able to check against their own sky. */}
              {o.reasons.length > 0 ? (
                <Text style={s.reasons}>{o.reasons.join(' · ')}</Text>
              ) : null}
              <Text style={s.daysLeft}>{t('scouting.daysLeft', { days: o.window.toDay - plan.daysAfterSowing })}</Text>
            </View>
          ))}
        </>
      )}

      {/* Stated every time, because this is a calendar and not a measurement. */}
      <View style={s.caveat}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={s.caveatText}>{t('scouting.caveat')}</Text>
      </View>

      {onSurvey ? (
        <Button
          title={t('scouting.flySurvey')}
          icon="paper-plane"
          size="sm"
          loading={surveying}
          onPress={onSurvey}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  title: { ...typography.h3, color: colors.text },
  sub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  body: { ...typography.small, color: colors.text, lineHeight: 19 },
  window: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
  },
  windowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  windowName: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill },
  tagText: { ...typography.tiny, fontWeight: '700' },
  lookFor: { ...typography.small, color: colors.textMuted, marginTop: 5, lineHeight: 18 },
  reasons: { ...typography.tiny, color: colors.info, marginTop: 4, lineHeight: 16 },
  daysLeft: { ...typography.tiny, color: colors.textFaint, marginTop: 4 },
  caveat: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.md,
  },
  caveatText: { ...typography.tiny, color: colors.textMuted, flex: 1, lineHeight: 16 },
});
