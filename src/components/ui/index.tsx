import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadow, spacing, StatusTone, toneColors, typography } from '../../theme';

/** Shared UI primitives. Every screen composes these so spacing and tone stay uniform. */

// --- Screen -----------------------------------------------------------------

export function Screen({
  children,
  scroll = false,
  edges = ['top'],
  style,
  refreshControl,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  style?: ViewStyle;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: ViewStyle;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[{ paddingBottom: spacing.xxxl * 2 }, contentStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <SafeAreaView style={[s.screen, style]} edges={edges}>
      {body}
    </SafeAreaView>
  );
}

// --- Header -----------------------------------------------------------------

export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
  compact,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[s.header, compact && { paddingVertical: spacing.sm }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// --- Card -------------------------------------------------------------------

export function Card({
  children,
  style,
  onPress,
  padded = true,
  tone,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  padded?: boolean;
  tone?: StatusTone;
}) {
  const toneStyle = tone
    ? { backgroundColor: toneColors(tone).bg, borderColor: toneColors(tone).fg + '33' }
    : null;
  const content = (
    <View style={[s.card, padded && { padding: spacing.lg }, toneStyle, style]}>{children}</View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}>
      {content}
    </Pressable>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
  icon,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={s.sectionTitle}>
      {icon ? <Ionicons name={icon} size={16} color={colors.brandLight} style={{ marginRight: 6 }} /> : null}
      <Text style={s.sectionTitleText}>{title}</Text>
      <View style={{ flex: 1 }} />
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --- Button -----------------------------------------------------------------

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  tone,
  size = 'md',
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  tone?: StatusTone;
  size?: 'sm' | 'md' | 'lg';
}) {
  const isDisabled = disabled || loading;

  const palette = (() => {
    if (variant === 'primary') return { bg: tone ? toneColors(tone).fg : colors.brand, fg: '#FFFFFF', border: 'transparent' };
    if (variant === 'danger') return { bg: colors.danger, fg: '#FFFFFF', border: 'transparent' };
    if (variant === 'secondary') return { bg: colors.surface, fg: colors.brand, border: colors.borderStrong };
    return { bg: 'transparent', fg: colors.brand, border: 'transparent' };
  })();

  const pad = size === 'lg' ? spacing.lg : size === 'sm' ? spacing.sm : spacing.md;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled) }}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'secondary' ? 1 : 0,
          paddingVertical: pad,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={palette.fg} style={{ marginRight: 7 }} /> : null}
          <Text style={[s.buttonText, { color: palette.fg, fontSize: size === 'sm' ? 13 : 15 }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// --- Badge / Pill -----------------------------------------------------------

export function Badge({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: StatusTone;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const { fg, bg } = toneColors(tone);
  return (
    <View style={[s.badge, { backgroundColor: bg }, style]}>
      {icon ? <Ionicons name={icon} size={11} color={fg} style={{ marginRight: 4 }} /> : null}
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Pill({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.pill,
        active && { backgroundColor: colors.brand, borderColor: colors.brand },
        pressed && { opacity: 0.85 },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={13} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 5 }} />
      ) : null}
      <Text style={[s.pillText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

/** Pulsing dot + "Live" label, matching the mockup's live indicator. */
export function LiveDot({ label = 'Live', stale }: { label?: string; stale?: boolean }) {
  const tone = stale ? colors.warn : colors.ok;
  return (
    <View style={s.liveWrap}>
      <View style={[s.liveDot, { backgroundColor: tone }]} />
      <Text style={[s.liveText, { color: tone }]}>{stale ? 'Stale' : label}</Text>
    </View>
  );
}

// --- Rows / lists -----------------------------------------------------------

export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  right,
  onPress,
  badge,
  tone,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  badge?: string;
  tone?: StatusTone;
}) {
  const body = (
    <View style={s.row}>
      {icon ? (
        <View style={[s.rowIcon, { backgroundColor: tone ? toneColors(tone).bg : colors.surfaceAlt }]}>
          <Ionicons name={icon} size={19} color={iconColor ?? (tone ? toneColors(tone).fg : colors.brandLight)} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? <Badge label={badge} tone={tone ?? 'neutral'} style={{ marginRight: 6 }} /> : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null)}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}>
      {body}
    </Pressable>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[s.divider, style]} />;
}

export function EmptyState({
  icon = 'leaf-outline',
  title,
  body,
  action,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.brandLight} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {action ? <Button title={action} onPress={onAction} variant="secondary" style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

/**
 * Confidence bar. Shown wherever the app makes a prediction, because a farmer
 * deciding whether to spend money on chemicals deserves to see how sure the
 * system actually is.
 */
export function ConfidenceBar({
  confidence,
  threshold,
  compact,
}: {
  confidence: number;
  threshold?: number;
  compact?: boolean;
}) {
  const pct = Math.round(confidence * 100);
  const tone: StatusTone = pct >= 75 ? 'ok' : pct >= 55 ? 'warn' : 'danger';
  const { fg } = toneColors(tone);
  return (
    <View style={{ marginTop: compact ? 4 : spacing.sm }}>
      <View style={s.confLabelRow}>
        <Text style={s.confLabel}>Model confidence</Text>
        <Text style={[s.confValue, { color: fg }]}>{pct}%</Text>
      </View>
      <View style={s.confTrack}>
        <View style={[s.confFill, { width: `${pct}%`, backgroundColor: fg }]} />
        {threshold != null ? (
          <View style={[s.confThreshold, { left: `${Math.round(threshold * 100)}%` }]} />
        ) : null}
      </View>
    </View>
  );
}

export function KeyValue({ label, value, tone }: { label: string; value: string; tone?: StatusTone }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={[s.kvValue, tone ? { color: toneColors(tone).fg } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  headerTitle: { ...typography.h1, color: colors.text },
  headerSubtitle: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitleText: { ...typography.h3, color: colors.text },
  sectionAction: { ...typography.small, color: colors.brandLight, fontWeight: '700' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { fontWeight: '700' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { ...typography.tiny },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  pillText: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  liveWrap: { flexDirection: 'row', alignItems: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  liveText: { ...typography.tiny },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowSubtitle: { ...typography.small, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  divider: { height: 1, backgroundColor: colors.border },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center' },
  emptyBody: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  confLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  confLabel: { ...typography.tiny, color: colors.textMuted },
  confValue: { ...typography.tiny },
  confTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
    position: 'relative',
  },
  confFill: { height: '100%', borderRadius: 3 },
  confThreshold: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 9,
    backgroundColor: colors.text,
    opacity: 0.55,
  },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  kvLabel: { ...typography.small, color: colors.textMuted, flex: 1 },
  kvValue: { ...typography.bodyStrong, color: colors.text, textAlign: 'right' },
});
