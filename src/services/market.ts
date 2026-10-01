import env from '../config/env';
import { MarketPrice } from '../types';
import { cacheGet, cacheSet } from './offline';
import { marketMatches } from '../config/agronomy';
import { GeoPoint } from '../types';

/**
 * Mandi prices from data.gov.in.
 *
 * The dataset's column names vary between revisions, so every field is read through
 * a candidate list rather than a fixed key — this was already the pattern in the app
 * and it is kept deliberately. Results are cached so prices remain visible offline.
 */

const BASE = 'https://api.data.gov.in/resource';

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '' && String(v) !== 'NA') return String(v).trim();
  }
  return '';
}

function num(row: Record<string, unknown>, keys: string[]): number {
  const raw = pick(row, keys);
  const parsed = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRecord(row: Record<string, unknown>): MarketPrice {
  return {
    commodity: pick(row, ['commodity', 'Commodity', 'commodity_name']),
    variety: pick(row, ['variety', 'Variety', 'variety_name']),
    market: pick(row, ['market', 'Market', 'market_name']),
    district: pick(row, ['district', 'District', 'district_name']),
    state: pick(row, ['state', 'State', 'state_name']),
    minPrice: num(row, ['min_price', 'Min_Price', 'min_price_per_quintal']),
    maxPrice: num(row, ['max_price', 'Max_Price', 'max_price_per_quintal']),
    modalPrice: num(row, ['modal_price', 'Modal_Price', 'modal_price_per_quintal', 'modal']),
    unit: pick(row, ['unit', 'unit_of_quantity']) || '₹/quintal',
    date: pick(row, ['arrival_date', 'Arrival_Date', 'date']),
  };
}

export interface MarketQuery {
  state?: string;
  district?: string;
  commodity?: string;
  limit?: number;
}

function cacheKey(q: MarketQuery): string {
  return `market:${q.state ?? ''}:${q.district ?? ''}:${q.commodity ?? ''}`;
}

export interface MarketResult {
  prices: MarketPrice[];
  fetchedAt: number;
  fromCache: boolean;
  stale: boolean;
}

export async function fetchPrices(query: MarketQuery): Promise<MarketResult> {
  const params = new URLSearchParams({
    'api-key': env.dataGovApiKey,
    format: 'json',
    limit: String(query.limit ?? 200),
  });
  if (query.state) params.append('filters[state.keyword]', query.state);
  if (query.district) params.append('filters[district.keyword]', query.district);
  if (query.commodity) params.append('filters[commodity.keyword]', query.commodity);

  const url = `${BASE}/${env.dataGovResourceId}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Market HTTP ${res.status}`);
    const data = await res.json();
    const records: Array<Record<string, unknown>> = Array.isArray(data?.records) ? data.records : [];
    const prices = records
      .map(mapRecord)
      .filter((p) => p.commodity && p.modalPrice > 0)
      .sort((a, b) => a.commodity.localeCompare(b.commodity));

    await cacheSet(cacheKey(query), prices, 12 * 3600_000);
    return { prices, fetchedAt: Date.now(), fromCache: false, stale: false };
  } catch (error) {
    // Serve the last known prices rather than an error screen.
    const hit = await cacheGet<MarketPrice[]>(cacheKey(query));
    if (hit) {
      return { prices: hit.value, fetchedAt: hit.at, fromCache: true, stale: hit.stale };
    }
    throw error;
  }
}

/** Distinct districts reported for a state, for the picker. */
export async function fetchDistricts(state: string): Promise<string[]> {
  const params = new URLSearchParams({
    'api-key': env.dataGovApiKey,
    format: 'json',
    limit: '1000',
    fields: 'district',
  });
  params.append('filters[state.keyword]', state);
  try {
    const res = await fetch(`${BASE}/${env.dataGovResourceId}?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    const records: Array<Record<string, unknown>> = Array.isArray(data?.records) ? data.records : [];
    const set = new Set(records.map((r) => pick(r, ['district', 'District', 'district_name'])).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * Advice on whether to sell now, comparing a commodity's modal price against the
 * spread across nearby markets. Useful only as a nudge — it is price dispersion,
 * not a forecast, and the UI says so.
 */
export function sellSignal(
  prices: MarketPrice[],
  cropKey: string
): { best: MarketPrice | null; median: number; spreadPct: number } | null {
  const rows = prices.filter((p) => marketMatches(cropKey, p.commodity));
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.modalPrice - b.modalPrice);
  const median = sorted[Math.floor(sorted.length / 2)].modalPrice;
  const best = sorted[sorted.length - 1];
  const spreadPct = median > 0 ? Math.round(((best.modalPrice - median) / median) * 100) : 0;
  return { best, median, spreadPct };
}

/* -------------------------------------------------- nearest mandi, after transport */

const geoKey = (market: string, district: string, state: string) => `mandi-geo:${state}:${district}:${market}`;

/** Earth distance in km. */
export function kmBetween(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Where a mandi is. The price feed has names, not coordinates, so the market
 * (or failing that its district) is looked up once in Open-Meteo's free
 * place-name search and remembered on the phone for a year. A market whose
 * name matches nowhere in its own state is left out rather than guessed.
 */
async function locateMandi(market: string, district: string, state: string): Promise<GeoPoint | null> {
  const key = geoKey(market, district, state);
  const hit = await cacheGet<GeoPoint | null>(key);
  if (hit) return hit.value;
  const tryName = async (name: string): Promise<GeoPoint | null> => {
    const q = name.replace(/\(.*?\)/g, '').replace(/\b(APMC|Mandi|Market|Yard)\b/gi, '').trim();
    if (!q) return null;
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json&countryCode=IN`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows: Array<Record<string, unknown>> = Array.isArray(data?.results) ? data.results : [];
    const st = state.toLowerCase();
    const r = rows.find((x) => String(x.admin1 ?? '').toLowerCase() === st) ?? null;
    return r ? { lat: Number(r.latitude), lon: Number(r.longitude) } : null;
  };
  try {
    const point = (await tryName(market)) ?? (district ? await tryName(district) : null);
    await cacheSet(key, point, 365 * 24 * 3600_000);
    return point;
  } catch {
    return null;
  }
}

export interface NearbyOffer {
  price: MarketPrice;
  km: number;
  /** Modal price minus the cost of carrying one quintal there. */
  net: number;
}

/**
 * The mandis within `maxKm` of the field that report this crop, best net price
 * first. `costPerQuintalKm` is the farmer's own transport cost, round trip
 * included, because a higher price 45 km away can pay less than the local one.
 */
export async function nearbyOffers(
  prices: MarketPrice[],
  cropKey: string,
  field: GeoPoint,
  costPerQuintalKm: number,
  maxKm = 50
): Promise<NearbyOffer[]> {
  const rows = prices.filter((p) => marketMatches(cropKey, p.commodity));
  const out: NearbyOffer[] = [];
  for (const p of rows.slice(0, 40)) {
    const at = await locateMandi(p.market, p.district, p.state);
    if (!at) continue;
    const km = Math.round(kmBetween(field, at));
    if (km > maxKm) continue;
    out.push({ price: p, km, net: Math.round(p.modalPrice - km * costPerQuintalKm) });
  }
  return out.sort((a, b) => b.net - a.net);
}

/* ------------------------------------------------------------- price trend */

const TREND_KEY = (state: string, cropKey: string) => `mandi-trend:${state}:${cropKey}`;

/**
 * The feed only has today's prices, so the trend is built on the phone: each
 * day the app sees a price, the state-wide median for the crop is kept. After a
 * few days the farmer sees which way it is moving. Up to 60 days are kept.
 */
export async function recordAndReadTrend(
  state: string,
  cropKey: string,
  prices: MarketPrice[]
): Promise<Array<{ day: string; median: number }>> {
  const hit = await cacheGet<Array<{ day: string; median: number }>>(TREND_KEY(state, cropKey));
  let series = hit?.value ?? [];
  const rows = prices.filter((p) => marketMatches(cropKey, p.commodity)).map((p) => p.modalPrice).sort((a, b) => a - b);
  if (rows.length > 0) {
    const day = new Date().toISOString().slice(0, 10);
    const median = rows[Math.floor(rows.length / 2)];
    series = [...series.filter((x) => x.day !== day), { day, median }].sort((a, b) => a.day.localeCompare(b.day)).slice(-60);
    await cacheSet(TREND_KEY(state, cropKey), series, 365 * 24 * 3600_000);
  }
  return series;
}

/** State name for a point, so the market opens on the farmer's own state. */
export async function stateForPoint(p: GeoPoint): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p.lat}&longitude=${p.lon}&localityLanguage=en`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.principalSubdivision === 'string' && data.principalSubdivision ? data.principalSubdivision : null;
  } catch {
    return null;
  }
}
