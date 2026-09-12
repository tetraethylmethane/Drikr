import env from '../config/env';
import { MarketPrice } from '../types';
import { cacheGet, cacheSet } from './offline';

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
  commodity: string
): { best: MarketPrice | null; median: number; spreadPct: number } | null {
  const rows = prices.filter((p) => p.commodity.toLowerCase() === commodity.toLowerCase());
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.modalPrice - b.modalPrice);
  const median = sorted[Math.floor(sorted.length / 2)].modalPrice;
  const best = sorted[sorted.length - 1];
  const spreadPct = median > 0 ? Math.round(((best.modalPrice - median) / median) * 100) : 0;
  return { best, median, spreadPct };
}
