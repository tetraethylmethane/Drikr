import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../../theme';
import { Recommendation } from '../../types';

/**
 * "Recommended Action" list from the mockup.
 *
 * Each line carries its own urgency window and a drone badge when the action can be
 * executed autonomously — the farmer can see at a glance what they must do by hand
 * and what the system can do for them.
 */
export function RecommendationList({
  recommendations,
  onSpeak,
  onDrone,
  max,
}: {
  recommendations: Recommendation[];
  onSpeak?: (text: string) => void;
  onDrone?: (rec: Recommendation) => void;
  max?: number;
}) {
  const items = max ? recommendations.slice(0, max) : recommendations;

  if (items.length === 0) {
    return (
      <View style={s.clear}>
        <Ionicons name="checkmark-circle" size={17} color={colors.ok} />
        <Text style={s.clearText}>No action needed right now. Keep to your routine schedule.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((r) => (
        <View key={r.id} style={s.item}>
          <View style={s.bullet} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.text}>{r.text}</Text>
            <View style={s.metaRow}>
              <View style={s.window}>
                <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                <Text style={s.windowText}>
                  {r.windowHours <= 24
                    ? `within ${r.windowHours}h`
                    : `within ${Math.round(r.windowHours / 24)}d`}
                </Text>
              </View>
              {r.inputHint ? <Text style={s.hint}>{r.inputHint}</Text> : null}
            </View>
          </View>

          <View style={{ gap: 4 }}>
            {r.droneEligible && onDrone ? (
              <Pressable
                onPress={() => onDrone(r)}
                hitSlop={8}
                style={s.droneBtn}
                accessibilityLabel="Schedule drone for this action"
              >
                <Ionicons name="paper-plane" size={13} color={colors.brand} />
              </Pressable>
            ) : null}
            {onSpeak ? (
              <Pressable
                onPress={() => onSpeak(r.text)}
                hitSlop={8}
                style={s.speakBtn}
                accessibilityLabel="Read this aloud"
              >
                <Ionicons name="volume-medium" size={13} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  text: { ...typography.body, color: colors.text, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3, flexWrap: 'wrap' },
  window: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  windowText: { ...typography.tiny, color: colors.textMuted },
  hint: { ...typography.tiny, color: colors.textFaint, fontStyle: 'italic' },
  droneBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clear: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clearText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 18 },
});
