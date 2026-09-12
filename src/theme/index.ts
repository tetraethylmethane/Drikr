/**
 * Drikr design tokens.
 *
 * Derived from the SIH 2026 deck (PS 26180) brand: dark-green primary on a light
 * surface, with a three-step semantic status scale (Normal / Low / Alert) that the
 * sensor tiles and health map both reuse.
 *
 * Every new screen must pull colors from here rather than inlining hex, so the
 * status scale stays consistent between the tiles, the heatmap and the alerts.
 */

export const colors = {
  // Brand
  brand: '#1B4332',
  brandDark: '#0F2C21',
  brandLight: '#2D6A4F',
  accent: '#40916C',

  // Surfaces
  bg: '#F4F6F4',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F4F1',
  surfaceSunken: '#E8EDE9',
  border: '#DDE4DE',
  borderStrong: '#C3CFC7',

  // Text
  text: '#14281D',
  textMuted: '#5A6B60',
  textFaint: '#8A998F',
  textOnBrand: '#FFFFFF',

  // Semantic status scale — used by StatTile, HealthLegend and AlertBanner
  ok: '#2D9A5F',
  okBg: '#E6F5EC',
  warn: '#C77A0A',
  warnBg: '#FDF3E2',
  danger: '#C4382E',
  dangerBg: '#FBEBE9',
  info: '#2563A8',
  infoBg: '#E8F0FA',

  // Crop health index gradient (healthy -> high risk), shared by map + legend
  health: ['#1A9850', '#66BD63', '#A6D96A', '#FEE08B', '#FDAE61', '#F46D43', '#D73027'],

  // Data series
  series: ['#2D6A4F', '#2563A8', '#C77A0A', '#8E44AD', '#C4382E', '#0E7490'],

  shadow: '#0F2C21',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6 },
  h1: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 14.5, fontWeight: '500' as const },
  bodyStrong: { fontSize: 14.5, fontWeight: '700' as const },
  small: { fontSize: 12.5, fontWeight: '500' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.3 },
  metric: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 },
} as const;

export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/** Severity -> foreground/background pair, so status rendering is never ad-hoc. */
export type StatusTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export function toneColors(tone: StatusTone): { fg: string; bg: string } {
  switch (tone) {
    case 'ok':
      return { fg: colors.ok, bg: colors.okBg };
    case 'warn':
      return { fg: colors.warn, bg: colors.warnBg };
    case 'danger':
      return { fg: colors.danger, bg: colors.dangerBg };
    case 'info':
      return { fg: colors.info, bg: colors.infoBg };
    default:
      return { fg: colors.textMuted, bg: colors.surfaceSunken };
  }
}

/** Map a 0-100 crop-health index onto the shared gradient. */
export function healthColor(index: number): string {
  const clamped = Math.max(0, Math.min(100, index));
  // index 100 = healthiest = first stop
  const pos = (100 - clamped) / 100;
  const scaled = pos * (colors.health.length - 1);
  return colors.health[Math.round(scaled)];
}

export const theme = { colors, spacing, radii, typography, shadow } as const;
export default theme;
