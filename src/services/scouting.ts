import { cropProfile, currentStage, DiseaseWindow, isKnownCrop } from '../config/agronomy';
import { GridRef, Plot, WeatherForecast } from '../types';
import { orderForFlight } from './healthMap';

/**
 * Scheduled scouting, for fields with no sensors.
 *
 * A field with sensor nodes gets told *where* to look: the nodes see an
 * abnormality and an inspection targets those cells. A field without them has
 * no such signal, and the honest response is not to invent one — it is to use
 * what we do know, which is real agronomy rather than fabricated telemetry:
 *
 *  - the crop and how many days since sowing, which gives the window each
 *    disease usually appears in;
 *  - the forecast, which says whether the weather currently favours it.
 *
 * That is enough to say "this is the fortnight Late Blight shows up in tomato,
 * and the next three days are cool and wet — fly the field and photograph it".
 * The photos then go through the same diagnosis path as a hand-held scouting
 * shot. Camera plus calendar plus weather, with no sensor anywhere.
 *
 * What this deliberately does NOT do is produce a risk *score*. Scores in this
 * app mean "measured evidence says so", and a calendar says nothing about this
 * particular field. A window being open is a reason to go and look, which is a
 * different claim, and the UI states it that way.
 */

const DAY_MS = 86_400_000;

/** Survey interval while no disease window is open. */
export const ROUTINE_SURVEY_DAYS = 14;
/** Survey interval while a window is open but the weather does not favour it. */
export const WINDOW_SURVEY_DAYS = 7;
/** Survey interval while a window is open and the weather favours it. */
export const FAVOURED_SURVEY_DAYS = 3;

/** How many cells a survey photographs. Coverage, not targeting. */
const SURVEY_CELLS = 9;

export type WindowState = 'open' | 'favoured';

export interface OpenWindow {
  window: DiseaseWindow;
  state: WindowState;
  /** Days until this window closes, for "you have a week left to catch it". */
  daysLeft: number;
  /** Which forecast conditions matched, so the farmer can see the reasoning. */
  reasons: string[];
}

export interface ScoutingPlan {
  /** Null when the crop is not in our knowledge base — see isKnownCrop. */
  cropKnown: boolean;
  daysAfterSowing: number;
  /** Disease windows currently open, worst (favoured) first. */
  open: OpenWindow[];
  /** Days between surveys right now, derived from the windows. */
  intervalDays: number;
  /** When the next survey is due. Past-due dates are returned as-is, not clamped. */
  nextDueAt: number;
  overdue: boolean;
  /** What to photograph, in plain words, merged across open windows. */
  lookFor: string[];
}

function daysSinceSowing(plot: Plot, now: number): number {
  const sown = new Date(plot.sowingDate).getTime();
  if (!Number.isFinite(sown)) return 0;
  return Math.max(0, Math.floor((now - sown) / DAY_MS));
}

/**
 * Does the forecast favour this disease over the next few days?
 *
 * Looks forward rather than at the current reading, because the point of a
 * survey is to catch an infection that is *about* to take hold. Every stated
 * condition must be satisfiable within the window — absent conditions are not
 * checked, so a disease with no `favours` block counts as open but never
 * favoured.
 */
function favourCheck(
  w: DiseaseWindow,
  forecast: WeatherForecast | null | undefined,
  now: number
): { favoured: boolean; reasons: string[] } {
  const f = w.favours;
  if (!f || !forecast) return { favoured: false, reasons: [] };

  const horizon = now + 3 * DAY_MS;
  const hours = forecast.hourly.filter((h) => h.at >= now && h.at <= horizon);
  if (hours.length === 0) return { favoured: false, reasons: [] };

  const reasons: string[] = [];
  let ok = true;

  if (f.minHumidity != null) {
    const peak = Math.max(...hours.map((h) => h.humidity));
    if (peak >= f.minHumidity) reasons.push(`humidity reaching ${Math.round(peak)}%`);
    else ok = false;
  }

  if (f.minTempC != null || f.maxTempC != null) {
    // The temperature band has to be entered, not merely straddled across the
    // three days: a disease that needs 12-20 C is not favoured by a day that
    // swings from 8 to 30.
    const inBand = hours.some(
      (h) =>
        (f.minTempC == null || h.temp >= f.minTempC) &&
        (f.maxTempC == null || h.temp <= f.maxTempC)
    );
    if (inBand) {
      const band = [f.minTempC, f.maxTempC].filter((x) => x != null).join('-');
      reasons.push(`temperature in the ${band} C range`);
    } else {
      ok = false;
    }
  }

  if (f.needsLeafWetness) {
    const wet = hours.some((h) => h.precip > 0.2 || h.humidity >= 92);
    if (wet) reasons.push('rain or dew leaving the leaves wet');
    else ok = false;
  }

  return { favoured: ok && reasons.length > 0, reasons };
}

/**
 * Work out when this field should next be flown, and what to look for.
 *
 * `lastSurveyAt` is the last completed survey. Null means never surveyed, which
 * makes the field due now — a field nobody has looked at is the one most worth
 * looking at.
 */
export function scoutingPlan(
  plot: Plot,
  forecast: WeatherForecast | null | undefined,
  lastSurveyAt: number | null,
  now: number = Date.now()
): ScoutingPlan {
  const cropKnown = isKnownCrop(plot.crop);
  const days = daysSinceSowing(plot, now);

  if (!cropKnown) {
    // No disease calendar for this crop, so there is nothing to time a survey
    // against. Fall back to the routine interval and say why, rather than
    // borrowing another crop's calendar.
    const nextDueAt = (lastSurveyAt ?? 0) + ROUTINE_SURVEY_DAYS * DAY_MS;
    return {
      cropKnown: false,
      daysAfterSowing: days,
      open: [],
      intervalDays: ROUTINE_SURVEY_DAYS,
      nextDueAt,
      overdue: now >= nextDueAt,
      lookFor: [],
    };
  }

  const profile = cropProfile(plot.crop);
  const open: OpenWindow[] = [];

  for (const w of profile.diseaseWindows) {
    if (days < w.fromDay || days > w.toDay) continue;
    const { favoured, reasons } = favourCheck(w, forecast, now);
    open.push({
      window: w,
      state: favoured ? 'favoured' : 'open',
      daysLeft: Math.max(0, w.toDay - days),
      reasons,
    });
  }

  // Favoured first, then by how little time is left to catch it.
  open.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'favoured' ? -1 : 1;
    return a.daysLeft - b.daysLeft;
  });

  const intervalDays =
    open.some((o) => o.state === 'favoured')
      ? FAVOURED_SURVEY_DAYS
      : open.length > 0
        ? WINDOW_SURVEY_DAYS
        : ROUTINE_SURVEY_DAYS;

  const nextDueAt = (lastSurveyAt ?? 0) + intervalDays * DAY_MS;

  return {
    cropKnown: true,
    daysAfterSowing: days,
    open,
    intervalDays,
    nextDueAt,
    overdue: now >= nextDueAt,
    lookFor: open.map((o) => `${o.window.disease}: ${o.window.lookFor}`),
  };
}

/**
 * The cells a survey photographs.
 *
 * Spread evenly across the grid rather than targeted, because without sensors
 * there is nothing to target — the job is to see a fair sample of the whole
 * field. An evenly spaced lattice beats a dense block: disease usually starts in
 * one patch, and a survey that photographs nine scattered points is far more
 * likely to intersect it than nine adjacent ones.
 *
 * Returned in serpentine flight order, like every other mission.
 */
export function surveyCells(plot: Plot, count = SURVEY_CELLS): GridRef[] {
  const { rows, cols } = plot.grid;
  if (rows === 0 || cols === 0) return [];

  // Closest lattice that fits: 9 cells wants 3x3, 6 wants 3x2.
  const side = Math.max(1, Math.round(Math.sqrt(count)));
  const nRows = Math.min(rows, side);
  const nCols = Math.min(cols, Math.max(1, Math.round(count / side)));

  const cells: GridRef[] = [];
  for (let i = 0; i < nRows; i++) {
    for (let j = 0; j < nCols; j++) {
      // Sample at the centre of each lattice block, so no point sits on the
      // field edge where a boundary effect would not represent the crop.
      const row = Math.min(rows - 1, Math.floor(((i + 0.5) * rows) / nRows));
      const col = Math.min(cols - 1, Math.floor(((j + 0.5) * cols) / nCols));
      if (!cells.some((c) => c.row === row && c.col === col)) cells.push({ row, col });
    }
  }
  return orderForFlight(cells);
}

/** Plain-language summary for the scouting card. */
export function describeScouting(plan: ScoutingPlan, now = Date.now()): string {
  if (!plan.cropKnown) return 'Routine survey — no disease calendar for this crop yet.';
  if (plan.open.length === 0) return 'No disease window open. Routine survey only.';
  const top = plan.open[0];
  if (top.state === 'favoured') {
    return `${top.window.disease} season, and the weather suits it — survey every ${plan.intervalDays} days.`;
  }
  return `${top.window.disease} season — survey every ${plan.intervalDays} days.`;
}

/** Days until due, negative when overdue. */
export function daysUntilDue(plan: ScoutingPlan, now = Date.now()): number {
  return Math.round((plan.nextDueAt - now) / DAY_MS);
}

/** Growth stage, re-exported so the scouting card does not need agronomy directly. */
export function stageOf(plot: Plot, now = Date.now()) {
  return currentStage(plot, now);
}
