import { GeoPoint, WeatherForecast } from '../types';

/**
 * Weather via Open-Meteo.
 *
 * Chosen over the usual providers because it needs no API key and no billing, which
 * matters for a project whose whole premise is affordability for small farmers — the
 * climate-risk feature works on a fresh clone with zero configuration.
 */

const BASE = 'https://api.open-meteo.com/v1/forecast';

const HOURLY = ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m'].join(',');
const DAILY = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'weather_code',
].join(',');
const CURRENT = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'wind_speed_10m',
  'weather_code',
  'is_day',
].join(',');

export async function fetchForecast(point: GeoPoint, timeoutMs = 9000): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lon),
    current: CURRENT,
    hourly: HOURLY,
    daily: DAILY,
    timezone: 'auto',
    forecast_days: '7',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
    const data = await res.json();

    const hourlyTimes: string[] = data?.hourly?.time ?? [];
    const hourly = hourlyTimes.map((t: string, i: number) => ({
      at: new Date(t).getTime(),
      temp: data.hourly.temperature_2m?.[i] ?? 0,
      humidity: data.hourly.relative_humidity_2m?.[i] ?? 0,
      precip: data.hourly.precipitation?.[i] ?? 0,
      wind: data.hourly.wind_speed_10m?.[i] ?? 0,
    }));

    const dailyTimes: string[] = data?.daily?.time ?? [];
    const daily = dailyTimes.map((d: string, i: number) => ({
      date: d,
      tempMax: data.daily.temperature_2m_max?.[i] ?? 0,
      tempMin: data.daily.temperature_2m_min?.[i] ?? 0,
      precipitation: data.daily.precipitation_sum?.[i] ?? 0,
      precipProbability: data.daily.precipitation_probability_max?.[i] ?? 0,
      windMax: data.daily.wind_speed_10m_max?.[i] ?? 0,
      code: data.daily.weather_code?.[i] ?? 0,
    }));

    return {
      fetchedAt: Date.now(),
      now: {
        at: data?.current?.time ? new Date(data.current.time).getTime() : Date.now(),
        temp: data?.current?.temperature_2m ?? 0,
        humidity: data?.current?.relative_humidity_2m ?? 0,
        windSpeed: data?.current?.wind_speed_10m ?? 0,
        precipitation: data?.current?.precipitation ?? 0,
        code: data?.current?.weather_code ?? 0,
        isDay: Boolean(data?.current?.is_day),
      },
      hourly,
      daily,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** WMO weather code -> label + Ionicons name, for the forecast strip. */
export function describeWeather(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Clear', icon: 'sunny' };
  if (code <= 2) return { label: 'Partly cloudy', icon: 'partly-sunny' };
  if (code === 3) return { label: 'Overcast', icon: 'cloud' };
  if (code <= 48) return { label: 'Fog', icon: 'cloudy' };
  if (code <= 57) return { label: 'Drizzle', icon: 'rainy' };
  if (code <= 67) return { label: 'Rain', icon: 'rainy' };
  if (code <= 77) return { label: 'Snow', icon: 'snow' };
  if (code <= 82) return { label: 'Showers', icon: 'rainy' };
  if (code <= 86) return { label: 'Snow showers', icon: 'snow' };
  if (code <= 99) return { label: 'Thunderstorm', icon: 'thunderstorm' };
  return { label: 'Unknown', icon: 'help-circle' };
}

/** Total rainfall over the next N hours — used by the irrigation deferral logic. */
export function rainNextHours(forecast: WeatherForecast | null, hours: number): number {
  if (!forecast) return 0;
  const now = Date.now();
  return forecast.hourly
    .filter((h) => h.at > now && h.at <= now + hours * 3600_000)
    .reduce((s, h) => s + h.precip, 0);
}

/** Next window in which drone flight is permitted by wind and rain. */
export function nextCalmWindow(
  forecast: WeatherForecast | null,
  maxWind: number,
  maxRain: number
): number | null {
  if (!forecast) return null;
  const now = Date.now();
  const slot = forecast.hourly.find((h) => {
    const hour = new Date(h.at).getHours();
    return h.at > now && h.wind <= maxWind && h.precip <= maxRain && hour >= 6 && hour <= 19;
  });
  return slot ? slot.at : null;
}
