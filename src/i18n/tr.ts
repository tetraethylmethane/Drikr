import i18n from './i18n';
import { CropStage } from '../types';

/**
 * Translation for code outside React components (the decision engine, services).
 *
 * They run on every reading and their output is shown straight away, so they
 * speak the language that is active at the time. Anything stored (an alert) keeps
 * the wording it was created with; the next reading replaces it.
 */
export function tr(key: string, params?: Record<string, unknown>): string {
  return i18n.t(key, params as never) as unknown as string;
}

/** `Brown Planthopper` -> `brown_planthopper`. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * The local name of a pest, disease or nutrient, looked up by its English name.
 * The English name stays the identity everywhere (keys, storage); only the
 * display changes. Falls back to English for a name nobody has translated.
 */
export function nameOf(english: string): string {
  const key = `names.${slug(english)}`;
  return i18n.exists(key) ? tr(key) : english;
}

export function stageName(stage: CropStage | string): string {
  const key = `stages.${stage}`;
  return i18n.exists(key) ? tr(key) : String(stage);
}

/** Soil types are stored in English (they are a plot property); shown translated. */
export function soilName(english: string): string {
  const key = `soil.${slug(english)}`;
  return i18n.exists(key) ? tr(key) : english;
}
