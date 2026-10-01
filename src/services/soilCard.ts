import { cropProfile } from '../config/agronomy';
import { SoilCard } from '../types';

/**
 * Soil Health Card: the government's own soil test, which most farmers already
 * have on paper. Entering it gives the app the field's real N, P and K instead
 * of a guess, and turns the general fertiliser dose into one sized for this soil.
 *
 * Ratings use the standard Indian soil-test limits printed on the card itself
 * (available N, P, K in kg/ha; organic carbon in %). The dose rule is the common
 * soil-test-based adjustment: a quarter more for a low soil, a quarter less for a
 * high one. The general doses below are the usual state recommendations and are
 * labelled as general in the UI - the card's own printed recommendation, when it
 * has one, wins.
 */

export type Rating = 'low' | 'medium' | 'high';

export function rateN(kgHa: number): Rating {
  return kgHa < 280 ? 'low' : kgHa <= 560 ? 'medium' : 'high';
}
export function rateP(kgHa: number): Rating {
  return kgHa < 10 ? 'low' : kgHa <= 25 ? 'medium' : 'high';
}
export function rateK(kgHa: number): Rating {
  return kgHa < 110 ? 'low' : kgHa <= 280 ? 'medium' : 'high';
}
export function rateOc(pct: number): Rating {
  return pct < 0.5 ? 'low' : pct <= 0.75 ? 'medium' : 'high';
}
export function phClass(ph: number): 'acidic' | 'neutral' | 'alkaline' {
  return ph < 6.5 ? 'acidic' : ph <= 7.5 ? 'neutral' : 'alkaline';
}

/** General recommended dose, kg/ha of N, P2O5 and K2O. */
export const RDF: Record<string, { n: number; p: number; k: number }> = {
  rice: { n: 120, p: 60, k: 40 },
  wheat: { n: 120, p: 60, k: 40 },
  maize: { n: 120, p: 60, k: 40 },
  cotton: { n: 100, p: 50, k: 50 },
  tomato: { n: 100, p: 50, k: 50 },
  sugarcane: { n: 275, p: 62, k: 112 },
  groundnut: { n: 20, p: 40, k: 40 },
  soybean: { n: 30, p: 60, k: 40 },
  chickpea: { n: 20, p: 40, k: 20 },
  tur: { n: 25, p: 50, k: 25 },
  moong: { n: 20, p: 40, k: 20 },
  mustard: { n: 80, p: 40, k: 40 },
  onion: { n: 100, p: 50, k: 50 },
  potato: { n: 150, p: 80, k: 100 },
  chilli: { n: 120, p: 60, k: 60 },
  banana: { n: 200, p: 60, k: 300 },
  bajra: { n: 60, p: 30, k: 20 },
  ragi: { n: 60, p: 30, k: 30 },
};

const FACTOR: Record<Rating, number> = { low: 1.25, medium: 1, high: 0.75 };
const HA_PER_ACRE = 1 / 2.471;
const round5 = (x: number) => Math.max(0, Math.round(x / 5) * 5);

export interface FertiliserPlan {
  /** kg/ha nutrient, after the soil-test adjustment. */
  n: number;
  p: number;
  k: number;
  /** kg of product for the whole field. */
  urea: number;
  dap: number;
  mop: number;
  ratings: { n: Rating; p: Rating; k: Rating; oc: Rating | null };
  ph: 'acidic' | 'neutral' | 'alkaline' | null;
  salty: boolean;
}

export function fertiliserPlan(card: SoilCard, crop: string, acres: number): FertiliserPlan | null {
  const key = cropProfile(crop).key;
  const rdf = RDF[key];
  if (!rdf) return null;
  const ratings = {
    n: rateN(card.n),
    p: rateP(card.p),
    k: rateK(card.k),
    oc: card.oc != null ? rateOc(card.oc) : null,
  };
  const n = Math.round(rdf.n * FACTOR[ratings.n]);
  const p = Math.round(rdf.p * FACTOR[ratings.p]);
  const k = Math.round(rdf.k * FACTOR[ratings.k]);
  const ha = Math.max(0, acres) * HA_PER_ACRE;
  // Phosphorus from DAP (18-46-0) first, the nitrogen DAP brings is counted,
  // the rest of the nitrogen from urea (46% N), potash from MOP (60% K2O).
  const dapHa = p / 0.46;
  const ureaHa = Math.max(0, n - dapHa * 0.18) / 0.46;
  const mopHa = k / 0.6;
  return {
    n,
    p,
    k,
    urea: round5(ureaHa * ha),
    dap: round5(dapHa * ha),
    mop: round5(mopHa * ha),
    ratings,
    ph: card.ph != null ? phClass(card.ph) : null,
    salty: card.ec != null && card.ec >= 1,
  };
}
