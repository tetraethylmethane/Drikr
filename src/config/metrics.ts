import { cropProfile, currentStage } from './agronomy';
import { StatusTone } from '../theme';
import { Plot, SensorMetric, SensorReading } from '../types';

/**
 * Presentation metadata for each sensor metric, plus the single place that decides
 * whether a value reads as Normal / Low / High / Alert.
 *
 * Centralising the status call is what keeps a tile, the health map and an alert from
 * disagreeing about the same number.
 */

export interface MetricMeta {
  key: SensorMetric;
  label: string;
  unit: string;
  icon: string;
  /** Decimal places for display. */
  dp: number;
  /** Metrics shown on the Home screen's headline grid, in order. */
  headline?: number;
}

export const METRICS: Record<SensorMetric, MetricMeta> = {
  airTemp: { key: 'airTemp', label: 'Temperature', unit: '°C', icon: 'thermometer', dp: 1, headline: 1 },
  soilMoisture: { key: 'soilMoisture', label: 'Soil Moisture', unit: '%', icon: 'water', dp: 0, headline: 2 },
  ph: { key: 'ph', label: 'Soil pH', unit: '', icon: 'flask', dp: 1, headline: 3 },
  nitrogen: { key: 'nitrogen', label: 'Soil Nitrogen', unit: 'ppm', icon: 'leaf', dp: 0, headline: 4 },
  humidity: { key: 'humidity', label: 'Humidity', unit: '%', icon: 'sunny', dp: 0, headline: 5 },
  pestActivity: { key: 'pestActivity', label: 'Pest Activity', unit: '', icon: 'bug', dp: 0, headline: 6 },
  soilTemp: { key: 'soilTemp', label: 'Soil Temp', unit: '°C', icon: 'thermometer-outline', dp: 1 },
  ec: { key: 'ec', label: 'Soil EC', unit: 'dS/m', icon: 'flash', dp: 2 },
  phosphorus: { key: 'phosphorus', label: 'Phosphorus', unit: 'ppm', icon: 'nutrition', dp: 0 },
  potassium: { key: 'potassium', label: 'Potassium', unit: 'ppm', icon: 'nutrition-outline', dp: 0 },
  leafWetness: { key: 'leafWetness', label: 'Leaf Wetness', unit: '%', icon: 'rainy', dp: 0 },
  light: { key: 'light', label: 'Light', unit: 'lux', icon: 'sunny-outline', dp: 0 },
  rainfall: { key: 'rainfall', label: 'Rainfall', unit: 'mm', icon: 'umbrella', dp: 1 },
  windSpeed: { key: 'windSpeed', label: 'Wind', unit: 'km/h', icon: 'navigate', dp: 1 },
  voc: { key: 'voc', label: 'VOC', unit: 'ppb', icon: 'analytics', dp: 0 },
};

export const HEADLINE_METRICS: SensorMetric[] = (Object.values(METRICS) as MetricMeta[])
  .filter((m) => m.headline != null)
  .sort((a, b) => (a.headline ?? 99) - (b.headline ?? 99))
  .map((m) => m.key);

export const SOIL_METRICS: SensorMetric[] = ['soilMoisture', 'soilTemp', 'ph', 'ec'];
export const NUTRIENT_METRICS: SensorMetric[] = ['nitrogen', 'phosphorus', 'potassium'];
export const CANOPY_METRICS: SensorMetric[] = ['airTemp', 'humidity', 'leafWetness', 'light', 'voc'];
export const WEATHER_METRICS: SensorMetric[] = ['airTemp', 'humidity', 'rainfall', 'windSpeed'];

export interface MetricStatus {
  tone: StatusTone;
  label: string;
}

/**
 * Status for one metric, against the crop's band for its current stage.
 * Pest activity and nutrients get bespoke treatment because "low" means the
 * opposite thing for each: low pest pressure is good, low nitrogen is not.
 */
export function metricStatus(
  metric: SensorMetric,
  value: number,
  plot: Plot | null
): MetricStatus {
  const crop = cropProfile(plot?.crop);

  if (metric === 'pestActivity') {
    if (value >= 62) return { tone: 'danger', label: 'Alert' };
    if (value >= 33) return { tone: 'warn', label: 'High' };
    return { tone: 'ok', label: 'Normal' };
  }

  if (metric === 'nitrogen' || metric === 'phosphorus' || metric === 'potassium') {
    const target =
      metric === 'nitrogen'
        ? crop.targetNpk.n
        : metric === 'phosphorus'
          ? crop.targetNpk.p
          : crop.targetNpk.k;
    const ratio = target > 0 ? value / target : 1;
    if (ratio < 0.62) return { tone: 'danger', label: 'Very low' };
    if (ratio < 0.82) return { tone: 'warn', label: 'Low' };
    if (ratio > 1.45) return { tone: 'warn', label: 'Excess' };
    return { tone: 'ok', label: 'Normal' };
  }

  if (metric === 'soilMoisture' && plot) {
    // Derived stage, not plot.stage — see currentStage() on why they must not diverge.
    const floor = crop.moistureFloorByStage[currentStage(plot)];
    const band = crop.bands.soilMoisture;
    if (band && value > band.critical[1]) return { tone: 'danger', label: 'Waterlogged' };
    if (value < floor * 0.8) return { tone: 'danger', label: 'Very low' };
    if (value < floor) return { tone: 'warn', label: 'Low' };
    return { tone: 'ok', label: 'Normal' };
  }

  const band = crop.bands[metric];
  if (!band) return { tone: 'neutral', label: '—' };

  if (value < band.critical[0]) return { tone: 'danger', label: 'Very low' };
  if (value > band.critical[1]) return { tone: 'danger', label: 'Very high' };
  if (value < band.ideal[0]) return { tone: 'warn', label: 'Low' };
  if (value > band.ideal[1]) return { tone: 'warn', label: 'High' };
  return { tone: 'ok', label: 'Normal' };
}

export function formatMetric(metric: SensorMetric, value: number): string {
  const meta = METRICS[metric];
  if (metric === 'light') return `${Math.round(value / 1000)}k`;
  if (metric === 'pestActivity') return String(Math.round(value));
  const v = meta.dp === 0 ? Math.round(value) : Number(value.toFixed(meta.dp));
  return String(v);
}

export function readMetric(reading: SensorReading, metric: SensorMetric): number {
  return (reading[metric] as number) ?? 0;
}

/** Series for a metric over recent readings, for the sparkline. */
export function metricSeries(history: SensorReading[], metric: SensorMetric): number[] {
  return history.map((r) => readMetric(r, metric));
}
