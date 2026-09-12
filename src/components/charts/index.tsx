import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { colors, radii, spacing, typography } from '../../theme';

/**
 * Charts drawn directly with react-native-svg.
 *
 * Hand-rolled rather than pulling a charting library. victory-native 36 was
 * once a dependency here but is built for the old React lifecycle and did not
 * survive the move to React 19, so it was dropped. These are small enough to
 * own outright, and doing so keeps full control of the theme tokens and the
 * axis/label behaviour on a narrow phone screen.
 */

function niceExtent(values: number[], pad = 0.08): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

function buildPath(
  values: number[],
  width: number,
  height: number,
  min: number,
  max: number,
  smooth: boolean
): string {
  const n = values.length;
  if (n === 0) return '';
  const stepX = n > 1 ? width / (n - 1) : 0;
  const scaleY = (v: number) => height - ((v - min) / (max - min || 1)) * height;

  const pts = values.map((v, i) => ({ x: i * stepX, y: scaleY(v) }));
  if (!smooth || n < 3) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  }
  // Catmull-Rom -> cubic bezier, for a readable trend line.
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

// --- Sparkline --------------------------------------------------------------

export function Sparkline({
  values,
  width = 92,
  height = 30,
  color = colors.brandLight,
  showDot = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  showDot?: boolean;
}) {
  const data = values.filter((v) => Number.isFinite(v));
  if (data.length < 2) return <View style={{ width, height }} />;

  const [min, max] = niceExtent(data, 0.12);
  const path = buildPath(data, width, height, min, max, true);
  const lastY = height - ((data[data.length - 1] - min) / (max - min || 1)) * height;
  const gradId = `sg-${color.replace('#', '')}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.26" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${gradId})`} />
      <Path d={path} stroke={color} strokeWidth={1.9} fill="none" strokeLinecap="round" />
      {showDot ? <Circle cx={width} cy={lastY} r={2.6} fill={color} /> : null}
    </Svg>
  );
}

// --- Trend chart ------------------------------------------------------------

export interface TrendSeries {
  label: string;
  values: number[];
  color?: string;
  unit?: string;
}

export function TrendChart({
  series,
  width,
  height = 170,
  xLabels,
  /** Horizontal reference line, e.g. the irrigation floor for this crop stage. */
  threshold,
  thresholdLabel,
}: {
  series: TrendSeries[];
  width: number;
  height?: number;
  xLabels?: string[];
  threshold?: number;
  thresholdLabel?: string;
}) {
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = xLabels?.length ? 22 : 10;
  const plotW = Math.max(10, width - padL - padR);
  const plotH = Math.max(10, height - padT - padB);

  const all = useMemo(
    () => series.flatMap((s) => s.values).concat(threshold != null ? [threshold] : []),
    [series, threshold]
  );
  const [min, max] = niceExtent(all);

  const scaleY = (v: number) => padT + plotH - ((v - min) / (max - min || 1)) * plotH;
  const ticks = [min, min + (max - min) / 2, max];

  return (
    <Svg width={width} height={height}>
      {/* gridlines + y axis labels */}
      {ticks.map((t, i) => (
        <G key={`t-${i}`}>
          <Line
            x1={padL}
            y1={scaleY(t)}
            x2={padL + plotW}
            y2={scaleY(t)}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray={i === 0 ? undefined : '3,4'}
          />
          <SvgText x={padL - 6} y={scaleY(t) + 3.5} fontSize="9" fill={colors.textFaint} textAnchor="end">
            {Math.abs(max - min) < 5 ? t.toFixed(1) : Math.round(t)}
          </SvgText>
        </G>
      ))}

      {threshold != null ? (
        <G>
          <Line
            x1={padL}
            y1={scaleY(threshold)}
            x2={padL + plotW}
            y2={scaleY(threshold)}
            stroke={colors.warn}
            strokeWidth={1.4}
            strokeDasharray="5,3"
          />
          {thresholdLabel ? (
            <SvgText x={padL + plotW} y={scaleY(threshold) - 4} fontSize="8.5" fill={colors.warn} textAnchor="end">
              {thresholdLabel}
            </SvgText>
          ) : null}
        </G>
      ) : null}

      {series.map((sr, si) => {
        const color = sr.color ?? colors.series[si % colors.series.length];
        const d = buildPath(sr.values, plotW, plotH, min, max, true);
        return (
          <G key={sr.label} x={padL} y={padT}>
            <Path d={d} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            {sr.values.length > 0 ? (
              <Circle
                cx={plotW}
                cy={plotH - ((sr.values[sr.values.length - 1] - min) / (max - min || 1)) * plotH}
                r={3.2}
                fill={color}
              />
            ) : null}
          </G>
        );
      })}

      {xLabels?.map((lbl, i) => {
        const step = xLabels.length > 1 ? plotW / (xLabels.length - 1) : 0;
        return (
          <SvgText
            key={`x-${i}`}
            x={padL + i * step}
            y={height - 5}
            fontSize="9"
            fill={colors.textFaint}
            textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
          >
            {lbl}
          </SvgText>
        );
      })}
    </Svg>
  );
}

export function ChartLegend({ series }: { series: TrendSeries[] }) {
  return (
    <View style={s.legend}>
      {series.map((sr, i) => (
        <View key={sr.label} style={s.legendItem}>
          <View
            style={[s.legendSwatch, { backgroundColor: sr.color ?? colors.series[i % colors.series.length] }]}
          />
          <Text style={s.legendText}>
            {sr.label}
            {sr.unit ? ` (${sr.unit})` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

// --- Gauge ------------------------------------------------------------------

/** Semicircular gauge for the 0-100 Crop Health Index. */
export function Gauge({
  value,
  size = 128,
  label,
  color,
  max = 100,
}: {
  value: number;
  size?: number;
  label?: string;
  color?: string;
  max?: number;
}) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));

  const arc = (from: number, to: number) => {
    const a0 = Math.PI + from * Math.PI;
    const a1 = Math.PI + to * Math.PI;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
  };

  return (
    <View style={{ width: size, height: size / 2 + 26, alignItems: 'center' }}>
      <Svg width={size} height={size / 2 + 8}>
        <Path d={arc(0, 1)} stroke={colors.surfaceSunken} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        <Path
          d={arc(0, 1)}
          stroke={color ?? colors.ok}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct},${circumference}`}
        />
      </Svg>
      <View style={{ alignItems: 'center', marginTop: -size / 2 + 16 }}>
        <Text style={[typography.display, { color: colors.text }]}>{Math.round(value)}</Text>
        {label ? <Text style={s.gaugeLabel}>{label}</Text> : null}
      </View>
    </View>
  );
}

// --- Bar comparison ---------------------------------------------------------

export function CompareBars({
  items,
  width,
  height = 150,
  unit = '₹',
}: {
  items: Array<{ label: string; value: number; color?: string }>;
  width: number;
  height?: number;
  unit?: string;
}) {
  const padB = 30;
  const padT = 18;
  const plotH = height - padB - padT;
  const max = Math.max(1, ...items.map((i) => i.value));
  const slot = width / Math.max(1, items.length);
  const barW = Math.min(56, slot * 0.54);

  return (
    <Svg width={width} height={height}>
      {items.map((item, i) => {
        const h = (item.value / max) * plotH;
        const x = i * slot + (slot - barW) / 2;
        const y = padT + plotH - h;
        const color = item.color ?? colors.series[i % colors.series.length];
        return (
          <G key={item.label}>
            <Rect x={x} y={y} width={barW} height={Math.max(2, h)} rx={6} fill={color} />
            <SvgText x={x + barW / 2} y={y - 5} fontSize="10" fontWeight="700" fill={colors.text} textAnchor="middle">
              {unit}
              {Math.round(item.value).toLocaleString('en-IN')}
            </SvgText>
            <SvgText
              x={x + barW / 2}
              y={height - 10}
              fontSize="9.5"
              fill={colors.textMuted}
              textAnchor="middle"
            >
              {item.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

const s = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendSwatch: { width: 9, height: 9, borderRadius: 2.5, marginRight: 5 },
  legendText: { ...typography.tiny, color: colors.textMuted },
  gaugeLabel: { ...typography.tiny, color: colors.textMuted, marginTop: 1 },
});
