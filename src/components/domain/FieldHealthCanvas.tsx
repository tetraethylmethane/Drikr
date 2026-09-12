import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { isInsideBoundary } from '../../services/healthMap';
import { colors, healthColor, radii, spacing, typography } from '../../theme';
import { GridRef, HealthMap, Plot, SensorNode } from '../../types';

/**
 * The Field Health Map.
 *
 * Cells are clipped to the plot's real boundary polygon so an irregular field does
 * not render as a rectangle, and the whole grid is drawn in one SVG rather than as
 * 64 Views — one flat tree keeps the map smooth while telemetry ticks underneath.
 *
 * Tapping a cell selects it; the parent then shows that cell's interpolated sensor
 * readings, which is the interaction in the deck's second mockup.
 */

export function FieldHealthCanvas({
  plot,
  map,
  nodes,
  size,
  selected,
  onSelectCell,
  showNodes = true,
}: {
  plot: Plot;
  map: HealthMap | null;
  nodes: SensorNode[];
  size: number;
  selected?: GridRef | null;
  onSelectCell?: (ref: GridRef) => void;
  showNodes?: boolean;
}) {
  const rows = map?.rows ?? plot.grid.rows;
  const cols = map?.cols ?? plot.grid.cols;
  const cellW = size / cols;
  const cellH = size / rows;

  const polygon = useMemo(
    () => plot.boundary.map((p) => `${(p.x * size).toFixed(1)},${(p.y * size).toFixed(1)}`).join(' '),
    [plot.boundary, size]
  );

  // Cells whose centre falls inside the boundary; everything else is not the field.
  const cells = useMemo(() => {
    if (!map) return [];
    return map.cells.filter((c) => {
      const cx = (c.gridRef.col + 0.5) / cols;
      const cy = (c.gridRef.row + 0.5) / rows;
      return isInsideBoundary(plot, cx, cy);
    });
  }, [map, plot, rows, cols]);

  const worst = map?.worst ?? null;

  const handlePress = (e: { nativeEvent: { locationX: number; locationY: number } }) => {
    if (!onSelectCell) return;
    const { locationX, locationY } = e.nativeEvent;
    const col = Math.floor((locationX / size) * cols);
    const row = Math.floor((locationY / size) * rows);
    if (row < 0 || col < 0 || row >= rows || col >= cols) return;
    const cx = (col + 0.5) / cols;
    const cy = (row + 0.5) / rows;
    if (!isInsideBoundary(plot, cx, cy)) return;
    onSelectCell({ row, col });
  };

  return (
    <Pressable onPress={handlePress} accessibilityLabel={`${plot.name} health map, tap to inspect an area`}>
      <Svg width={size} height={size}>
        <Defs>
          <ClipPath id="fieldClip">
            <Polygon points={polygon} />
          </ClipPath>
        </Defs>

        {/* Ground outside the field */}
        <Rect x={0} y={0} width={size} height={size} fill={colors.surfaceSunken} rx={radii.md} />

        <G clipPath="url(#fieldClip)">
          {cells.map((c) => (
            <Rect
              key={`${c.gridRef.row}-${c.gridRef.col}`}
              x={c.gridRef.col * cellW}
              y={c.gridRef.row * cellH}
              width={cellW + 0.6}
              height={cellH + 0.6}
              fill={healthColor(c.healthIndex)}
              opacity={0.92}
            />
          ))}

          {/* Crop-row texture, so the block reads as a field rather than a chart */}
          {Array.from({ length: Math.floor(size / 9) }).map((_, i) => (
            <Line
              key={`row-${i}`}
              x1={0}
              y1={i * 9}
              x2={size}
              y2={i * 9}
              stroke="#0B3B1E"
              strokeOpacity={0.06}
              strokeWidth={1}
            />
          ))}
        </G>

        {/* Field outline */}
        <Polygon points={polygon} fill="none" stroke={colors.surface} strokeWidth={2.5} />
        <Polygon points={polygon} fill="none" stroke={colors.brandDark} strokeWidth={1.2} strokeOpacity={0.5} />

        {/* Selected cell */}
        {selected ? (
          <Rect
            x={selected.col * cellW}
            y={selected.row * cellH}
            width={cellW}
            height={cellH}
            fill="none"
            stroke={colors.surface}
            strokeWidth={2.5}
            rx={3}
          />
        ) : null}

        {/* Worst cell marker — the "High Risk" callout in the mockup */}
        {worst && worst.healthIndex < 60 ? (
          <G>
            <Circle
              cx={(worst.gridRef.col + 0.5) * cellW}
              cy={(worst.gridRef.row + 0.5) * cellH}
              r={11}
              fill={colors.danger}
              fillOpacity={0.22}
            />
            <Circle
              cx={(worst.gridRef.col + 0.5) * cellW}
              cy={(worst.gridRef.row + 0.5) * cellH}
              r={4.5}
              fill={colors.surface}
              stroke={colors.danger}
              strokeWidth={2.5}
            />
          </G>
        ) : null}

        {/* Sensor nodes */}
        {showNodes
          ? nodes.map((n) => (
              <G key={n.id}>
                <Circle
                  cx={(n.gridRef.col + 0.5) * cellW}
                  cy={(n.gridRef.row + 0.5) * cellH}
                  r={6}
                  fill={colors.surface}
                  stroke={n.status === 'online' ? colors.brandDark : colors.warn}
                  strokeWidth={2}
                />
                <Circle
                  cx={(n.gridRef.col + 0.5) * cellW}
                  cy={(n.gridRef.row + 0.5) * cellH}
                  r={2}
                  fill={n.status === 'online' ? colors.brandDark : colors.warn}
                />
              </G>
            ))
          : null}

        {/* North arrow */}
        <G>
          <Path
            d={`M${size - 20},${18} L${size - 15},${30} L${size - 20},${26} L${size - 25},${30} Z`}
            fill={colors.surface}
            stroke={colors.brandDark}
            strokeWidth={1}
          />
          <SvgText x={size - 20} y={14} fontSize="9" fontWeight="700" fill={colors.surface} textAnchor="middle">
            N
          </SvgText>
        </G>

        {/* Scale bar */}
        <G>
          <Rect x={12} y={size - 22} width={70} height={4} fill={colors.surface} opacity={0.92} rx={1} />
          <Rect x={12} y={size - 22} width={23.3} height={4} fill={colors.brandDark} opacity={0.75} rx={1} />
          <Rect x={58.6} y={size - 22} width={23.4} height={4} fill={colors.brandDark} opacity={0.75} rx={1} />
          <SvgText x={12} y={size - 26} fontSize="7.5" fill={colors.surface} textAnchor="start">
            0
          </SvgText>
          <SvgText x={82} y={size - 26} fontSize="7.5" fill={colors.surface} textAnchor="end">
            {Math.round(Math.sqrt(plot.areaAcres * 4047))} m
          </SvgText>
        </G>
      </Svg>
    </Pressable>
  );
}

/** The "Crop Health Index" gradient legend under the map. */
export function HealthLegend({ meanHealth }: { meanHealth?: number }) {
  return (
    <View style={s.legend}>
      <Text style={s.legendTitle}>
        Crop Health Index{meanHealth != null ? ` · field average ${meanHealth}/100` : ''}
      </Text>
      <View style={s.legendBar}>
        {colors.health.map((c) => (
          <View key={c} style={[s.legendSwatch, { backgroundColor: c }]} />
        ))}
      </View>
      <View style={s.legendLabels}>
        <Text style={s.legendLabel}>Healthy</Text>
        <Text style={s.legendLabel}>Moderate</Text>
        <Text style={s.legendLabel}>High Risk</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  legend: { marginTop: spacing.md },
  legendTitle: { ...typography.tiny, color: colors.textMuted, marginBottom: 5 },
  legendBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  legendSwatch: { flex: 1 },
  legendLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  legendLabel: { fontSize: 9.5, fontWeight: '600', color: colors.textFaint },
});
