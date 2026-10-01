import {
  Band,
  CropProfile,
  DRONE_LIMITS,
  INPUT_SUGGESTIONS,
  cropProfile,
  currentStage,
} from '../config/agronomy';
import {
  Plot,
  Recommendation,
  RiskAssessment,
  RiskDomain,
  RiskLevel,
  SensorReading,
  Severity,
  WeatherForecast,
} from '../types';
import { nameOf, stageName, tr } from '../i18n/tr';

/**
 * Decision engine — the deck's "Prediction & Risk Scoring" + "Knowledge Base" stages.
 *
 * Every export here is a pure function of (reading, plot, forecast). That matters for
 * three reasons: the same code path serves the live screen, the health map's per-cell
 * scoring and the offline Kisan Mitra answers; results are reproducible for a demo;
 * and each risk carries its own `drivers` so the UI can always explain *why* it fired
 * rather than showing an unaccountable number.
 *
 * Confidence is reported separately from score. The deck's stated mitigation for AI
 * false alerts is "confidence thresholds + farmer confirmation", so a high score with
 * thin evidence (one node reporting, stale data, uncalibrated sensor) is deliberately
 * held back rather than pushed as an alert.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round(v: number, dp = 1): number {
  const m = Math.pow(10, dp);
  return Math.round(v * m) / m;
}

/**
 * How far a value sits outside its comfortable band, as 0..1.
 * 0 = inside ideal, 1 = at/beyond the critical limit.
 */
function bandDeviation(value: number, band: Band): { dev: number; direction: 'low' | 'high' | 'ok' } {
  const [idealLo, idealHi] = band.ideal;
  const [critLo, critHi] = band.critical;
  if (value < idealLo) {
    const span = Math.max(0.0001, idealLo - critLo);
    return { dev: clamp01((idealLo - value) / span), direction: 'low' };
  }
  if (value > idealHi) {
    const span = Math.max(0.0001, critHi - idealHi);
    return { dev: clamp01((value - idealHi) / span), direction: 'high' };
  }
  return { dev: 0, direction: 'ok' };
}

export function levelForScore(score: number): RiskLevel {
  if (score >= 62) return 'high';
  if (score >= 33) return 'moderate';
  return 'healthy';
}

export function severityForScore(score: number): Severity {
  if (score >= 82) return 'critical';
  if (score >= 62) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 22) return 'low';
  return 'info';
}

/** Days after sowing for a plot at a given time. */
export function daysAfterSowing(plot: Plot, at: number): number {
  return Math.max(0, Math.floor((at - new Date(plot.sowingDate).getTime()) / DAY));
}

export interface EngineContext {
  plot: Plot;
  reading: SensorReading;
  /** Recent readings (oldest first) — enables trend and wet-period duration logic. */
  history?: SensorReading[];
  forecast?: WeatherForecast | null;
  /** Number of nodes that contributed, for confidence. */
  nodesOnline?: number;
  nodesTotal?: number;
  /** Worst calibration age across contributing nodes, in days. */
  calibrationAgeDays?: number;
}

/**
 * Evidence quality, 0..1. Multiplied into every domain's confidence.
 * Thin or stale evidence must not produce a confident alert.
 */
function evidenceQuality(ctx: EngineContext): number {
  const { reading, nodesOnline = 1, nodesTotal = 1, calibrationAgeDays = 0, history } = ctx;

  // Coverage: more reporting nodes -> more trustworthy plot-level claim.
  const coverage = nodesTotal > 0 ? clamp01(nodesOnline / nodesTotal) : 0.5;
  // Freshness: a reading older than 2h is materially less useful.
  const ageH = Math.max(0, (Date.now() - reading.at) / HOUR);
  const freshness = clamp01(1 - ageH / 6);
  // Calibration drift: the deck's mitigation for sensor drift.
  const calibration = clamp01(1 - Math.max(0, calibrationAgeDays - 14) / 60);
  // Depth of history behind a trend claim.
  const depth = clamp01((history?.length ?? 1) / 12);

  return clamp01(0.35 + 0.28 * coverage + 0.16 * freshness + 0.11 * calibration + 0.1 * depth);
}

function rec(
  id: string,
  domain: RiskDomain,
  text: string,
  windowHours: number,
  droneEligible: boolean,
  inputHint?: string
): Recommendation {
  return { id, domain, text, windowHours, droneEligible, inputHint };
}

// ---------------------------------------------------------------------------
// Irrigation
// ---------------------------------------------------------------------------

export function assessIrrigation(ctx: EngineContext): RiskAssessment {
  const { plot, reading, forecast } = ctx;
  const crop = cropProfile(plot.crop);
  const stage = currentStage(plot, reading.at);
  const floor = crop.moistureFloorByStage[stage];
  const band = crop.bands.soilMoisture ?? { ideal: [40, 70], critical: [25, 85], unit: '%' };

  // Deficit against the stage-specific floor is the primary driver.
  const deficit = Math.max(0, floor - reading.soilMoisture);
  const deficitScore = clamp01(deficit / Math.max(1, floor - band.critical[0])) * 68;

  // Evaporative demand raises urgency at the same moisture level.
  const vpdProxy = clamp01((reading.airTemp - 28) / 14) * clamp01((72 - reading.humidity) / 45);
  const demandScore = vpdProxy * 22;

  // Rain in the next 24h defers irrigation — this is what avoids wasteful watering.
  const rainNext24 = forecast
    ? forecast.hourly
        .filter((h) => h.at > reading.at && h.at <= reading.at + DAY)
        .reduce((sum, h) => sum + h.precip, 0)
    : 0;
  const rainRelief = clamp01(rainNext24 / 12);

  // Waterlogging is the opposite failure and matters for rice especially.
  const excess = Math.max(0, reading.soilMoisture - band.critical[1]);
  const excessScore = clamp01(excess / 10) * 55;

  let score = Math.max(excessScore, (deficitScore + demandScore) * (1 - rainRelief * 0.8));
  score = Math.round(clamp01(score / 100) * 100);

  const waterlogged = excessScore > deficitScore;
  const drivers: RiskAssessment['drivers'] = [
    {
      metric: 'soilMoisture',
      value: reading.soilMoisture,
      unit: '%',
      note: waterlogged
        ? tr('engine.irr.noteAbove', { max: band.critical[1] })
        : deficit > 0
          ? tr('engine.irr.noteBelow', { deficit: round(deficit), stage: stageName(stage), floor })
          : tr('engine.irr.noteWithin', { floor, max: band.ideal[1] }),
    },
    {
      metric: 'airTemp',
      value: reading.airTemp,
      unit: '°C',
      note: vpdProxy > 0.35 ? tr('engine.irr.demandHigh') : tr('engine.irr.demandMod'),
    },
  ];
  if (forecast) {
    drivers.push({
      metric: 'forecast',
      value: round(rainNext24),
      unit: 'mm',
      note:
        rainRelief > 0.25
          ? tr('engine.irr.rainSoon')
          : tr('engine.irr.rainLittle'),
    });
  }

  const recommendations: Recommendation[] = [];
  if (waterlogged) {
    recommendations.push(
      rec('irr-drain', 'irrigation', tr('engine.irr.recDrain'), 12, false)
    );
  } else if (score >= 33) {
    // Sizing the dose from the actual deficit is what delivers the water saving.
    const mmNeeded = Math.round(deficit * 1.6);
    const litres = Math.round(mmNeeded * 4.05 * plot.areaAcres * 10);
    recommendations.push(
      rec(
        'irr-run',
        'irrigation',
        tr('engine.irr.recRun', {
          plot: plot.name,
          mm: mmNeeded,
          litres: litres.toLocaleString('en-IN'),
          method: tr(`setup.irrigation_${plot.irrigationType}`),
        }),
        rainRelief > 0.25 ? 36 : 12,
        false,
        tr('engine.irr.hint', { acres: plot.areaAcres, mm: mmNeeded })
      )
    );
    if (vpdProxy > 0.4) {
      recommendations.push(
        rec('irr-timing', 'irrigation', tr('engine.irr.recTiming'), 24, false)
      );
    }
  } else if (rainRelief > 0.25 && deficit > 0) {
    recommendations.push(
      rec('irr-hold', 'irrigation', tr('engine.irr.recHold', { mm: round(rainNext24) }), 24, false)
    );
  }

  return {
    domain: 'irrigation',
    score,
    level: levelForScore(score),
    severity: severityForScore(score),
    confidence: round(clamp01(evidenceQuality(ctx) * (0.82 + clamp01(score / 180))), 2),
    /**
     * A deficit against the stage floor is named even when the composite score is
     * low. The score blends in evaporative demand and rain deferral, so it can sit
     * under 33 while moisture is genuinely below the floor — and the sensor tile,
     * which keys straight off the floor, would then read "Low" next to a detail
     * screen saying "adequate".
     */
    title: waterlogged
      ? tr('engine.irr.tWaterlog')
      : score >= 62
        ? tr('engine.irr.tNow')
        : score >= 33
          ? tr('engine.irr.tSoon')
          : deficit > 0
            ? tr('engine.irr.tBelow')
            : tr('engine.irr.tOk'),
    detail: waterlogged
      ? tr('engine.irr.dWaterlog', { sm: reading.soilMoisture, crop: crop.label })
      : deficit > 0
        ? tr('engine.irr.dBelow', { sm: reading.soilMoisture, floor, stage: stageName(stage), crop: crop.label })
        : tr('engine.irr.dOk', { sm: reading.soilMoisture, crop: crop.label, stage: stageName(stage) }),
    drivers,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Nutrient
// ---------------------------------------------------------------------------

export function assessNutrient(ctx: EngineContext): RiskAssessment {
  const { plot, reading } = ctx;
  const crop = cropProfile(plot.crop);

  const nTarget = crop.targetNpk.n;
  const pTarget = crop.targetNpk.p;
  const kTarget = crop.targetNpk.k;

  const nDef = clamp01((nTarget - reading.nitrogen) / nTarget);
  const pDef = clamp01((pTarget - reading.phosphorus) / pTarget);
  const kDef = clamp01((kTarget - reading.potassium) / kTarget);

  // Nitrogen dominates in-season response, so it carries the most weight.
  const npkScore = (nDef * 0.52 + pDef * 0.22 + kDef * 0.26) * 100;

  // pH and EC gate nutrient availability regardless of raw NPK.
  const phBand = crop.bands.ph ?? { ideal: [6, 7.5], critical: [5, 8.5], unit: '' };
  const phDev = bandDeviation(reading.ph, phBand);
  const ecBand = crop.bands.ec ?? { ideal: [0.4, 1.6], critical: [0.15, 3], unit: 'dS/m' };
  const ecDev = bandDeviation(reading.ec, ecBand);

  const score = Math.round(clamp01((npkScore + phDev.dev * 26 + ecDev.dev * 20) / 100) * 100);

  const drivers: RiskAssessment['drivers'] = [
    {
      metric: 'nitrogen',
      value: reading.nitrogen,
      unit: 'ppm',
      note: nDef > 0.18 ? tr('engine.nut.belowTarget', { pct: Math.round(nDef * 100), target: nTarget }) : tr('engine.nut.adequate'),
    },
    {
      metric: 'phosphorus',
      value: reading.phosphorus,
      unit: 'ppm',
      note: pDef > 0.18 ? tr('engine.nut.below', { pct: Math.round(pDef * 100) }) : tr('engine.nut.adequate'),
    },
    {
      metric: 'potassium',
      value: reading.potassium,
      unit: 'ppm',
      note: kDef > 0.18 ? tr('engine.nut.below', { pct: Math.round(kDef * 100) }) : tr('engine.nut.adequate'),
    },
    {
      metric: 'ph',
      value: reading.ph,
      unit: '',
      note:
        phDev.direction === 'ok'
          ? tr('engine.nut.phOk')
          : phDev.direction === 'low'
            ? tr('engine.nut.phLow')
            : tr('engine.nut.phHigh'),
    },
  ];
  if (ecDev.dev > 0.2) {
    drivers.push({
      metric: 'ec',
      value: reading.ec,
      unit: 'dS/m',
      note: ecDev.direction === 'high' ? tr('engine.nut.ecHigh') : tr('engine.nut.ecLow'),
    });
  }

  const recommendations: Recommendation[] = [];
  if (nDef > 0.2) {
    recommendations.push(
      rec('nut-n', 'nutrient', INPUT_SUGGESTIONS.nitrogen, 72, false, tr('engine.nut.nHint', { pct: Math.round(nDef * 100) }))
    );
  }
  if (pDef > 0.25) {
    recommendations.push(rec('nut-p', 'nutrient', INPUT_SUGGESTIONS.phosphorus, 120, false));
  }
  if (kDef > 0.25) {
    recommendations.push(rec('nut-k', 'nutrient', INPUT_SUGGESTIONS.potassium, 120, false));
  }
  if (phDev.dev > 0.3) {
    recommendations.push(
      rec(
        'nut-ph',
        'nutrient',
        phDev.direction === 'low' ? INPUT_SUGGESTIONS.ph_low : INPUT_SUGGESTIONS.ph_high,
        168,
        false
      )
    );
  }
  if (ecDev.dev > 0.35 && ecDev.direction === 'high') {
    recommendations.push(rec('nut-ec', 'nutrient', INPUT_SUGGESTIONS.ec_high, 48, false));
  }

  const worst = nameOf(nDef >= pDef && nDef >= kDef ? 'Nitrogen' : pDef >= kDef ? 'Phosphorus' : 'Potassium');
  const worstDef = Math.max(nDef, pDef, kDef);

  /**
   * The title reflects the worst *individual* nutrient, not only the blended score.
   * The blend weights N at 0.52, so a serious nitrogen shortfall alongside healthy
   * P and K lands near 30 and would otherwise be announced as "balanced" — which is
   * exactly the reading a farmer would act wrongly on.
   */
  const limited = score >= 33 || worstDef >= 0.25;
  const title =
    score >= 62 || worstDef >= 0.5
      ? tr('engine.nut.tDeficiency', { nutrient: worst })
      : limited
        ? tr('engine.nut.tMild', { nutrient: worst })
        : tr('engine.nut.tBalanced');

  return {
    domain: 'nutrient',
    score,
    level: levelForScore(score),
    severity: severityForScore(score),
    confidence: round(clamp01(evidenceQuality(ctx) * 0.94), 2),
    title,
    detail: limited
      ? tr(phDev.direction === 'ok' ? 'engine.nut.dLimitedPhOk' : 'engine.nut.dLimitedPhBad', {
          nutrient: worst,
          crop: crop.label,
          pct: Math.round(worstDef * 100),
          ph: reading.ph,
        })
      : tr('engine.nut.dBalanced', { crop: crop.label, n: nTarget, p: pTarget, k: kTarget }),
    drivers,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Pest
// ---------------------------------------------------------------------------

export function assessPest(ctx: EngineContext): RiskAssessment {
  const { plot, reading, history } = ctx;
  const crop = cropProfile(plot.crop);

  // Warmth accelerates pest generations (degree-day proxy).
  const warmth = clamp01((reading.airTemp - crop.pestBaseTemp) / 24);
  const humid = clamp01((reading.humidity - 48) / 38);

  // VOC elevation above a clean-canopy baseline is the early chemical signal.
  const vocLift = clamp01((reading.voc - 150) / 380);

  // A rising trend matters more than a single high sample.
  let trend = 0;
  if (history && history.length >= 4) {
    const half = Math.floor(history.length / 2);
    const older = history.slice(0, half);
    const newer = history.slice(half);
    const avg = (xs: SensorReading[]) => xs.reduce((s, r) => s + r.pestActivity, 0) / Math.max(1, xs.length);
    trend = clamp01((avg(newer) - avg(older)) / 22);
  }

  const score = Math.round(
    clamp01(
      (reading.pestActivity / 100) * 0.55 + vocLift * 0.18 + warmth * 0.1 + humid * 0.07 + trend * 0.1
    ) * 100
  );

  /**
   * Name the most likely pest rather than reporting a bare "pest detected".
   * `commonPests` is ordered by prevalence for the crop, so the first entry is the
   * right guess: the sensors measure pressure, not species, and indexing into the
   * list by temperature would imply a per-species model that does not exist here.
   * ScoutScreen shows the full candidate list for the farmer to check against.
   */
  const likely = nameOf(crop.commonPests[0]);

  const drivers: RiskAssessment['drivers'] = [
    {
      metric: 'pestActivity',
      value: reading.pestActivity,
      unit: '/100',
      note: score >= 62 ? tr('engine.pest.pressureHigh') : tr('engine.pest.pressure'),
    },
    {
      metric: 'voc',
      value: reading.voc,
      unit: 'ppb',
      note: vocLift > 0.3 ? tr('engine.pest.vocHigh') : tr('engine.pest.vocOk'),
    },
    {
      metric: 'airTemp',
      value: reading.airTemp,
      unit: '°C',
      note: warmth > 0.55 ? tr('engine.pest.warm') : tr('engine.pest.warmMod'),
    },
  ];
  if (trend > 0.15) {
    drivers.push({
      metric: 'pestActivity',
      value: round(trend * 100),
      unit: '%',
      note: tr('engine.pest.rising'),
    });
  }

  const recommendations: Recommendation[] = [];
  if (score >= 62) {
    recommendations.push(
      rec('pest-spray', 'pest', tr('engine.pest.recSpray', { input: INPUT_SUGGESTIONS.pest }), 24, true, tr('engine.pest.recSprayHint'))
    );
    recommendations.push(rec('pest-scout', 'pest', tr('engine.pest.recWatch'), 24, false));
    recommendations.push(
      rec('pest-drone', 'pest', tr('engine.pest.recDrone'), 6, true)
    );
  } else if (score >= 33) {
    recommendations.push(rec('pest-scout2', 'pest', tr('engine.pest.recEggs', { pest: likely }), 48, false));
    recommendations.push(rec('pest-trap', 'pest', tr('engine.pest.recTrap'), 72, false));
  }

  return {
    domain: 'pest',
    score,
    level: levelForScore(score),
    severity: severityForScore(score),
    // Chemical + trend + threshold agreement raises confidence; a lone spike does not.
    confidence: round(
      clamp01(evidenceQuality(ctx) * (0.72 + vocLift * 0.18 + (trend > 0.15 ? 0.12 : 0))),
      2
    ),
    title: score >= 62 ? tr('engine.pest.tHigh') : score >= 33 ? tr('engine.pest.tMid') : tr('engine.pest.tLow'),
    detail:
      score >= 33
        ? tr('engine.pest.dHigh', { pest: likely, plot: plot.name, voc: reading.voc, hum: reading.humidity })
        : tr('engine.pest.dLow', { plot: plot.name }),
    drivers,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Crop health / disease
// ---------------------------------------------------------------------------

export function assessCropHealth(ctx: EngineContext): RiskAssessment {
  const { plot, reading, history } = ctx;
  const crop = cropProfile(plot.crop);

  // Leaf wetness duration is the classic infection-period driver.
  let wetHours = reading.leafWetness > 55 ? 1 : 0;
  if (history && history.length > 1) {
    const stepH = Math.max(
      0.25,
      (history[history.length - 1].at - history[0].at) / HOUR / Math.max(1, history.length - 1)
    );
    wetHours = history.filter((r) => r.leafWetness > 55).length * stepH;
  }
  const wetDrive = clamp01(wetHours / 12);
  const humid = clamp01((reading.humidity - 80) / 18);

  // Electrochemical biosensor current is direct pathogen evidence when present.
  const bio = reading.biosensorNa != null ? clamp01((reading.biosensorNa - 40) / 120) : 0;
  const hasBio = reading.biosensorNa != null;

  const tempBand = crop.bands.airTemp ?? { ideal: [18, 33], critical: [8, 40], unit: '°C' };
  const tempDev = bandDeviation(reading.airTemp, tempBand);

  const score = Math.round(
    clamp01(wetDrive * 0.34 + humid * 0.2 + bio * 0.32 + tempDev.dev * 0.14) * 100
  );

  // Ordered by prevalence, same reasoning as the pest naming above.
  const likely = nameOf(crop.commonDiseases[0]);

  const drivers: RiskAssessment['drivers'] = [
    {
      metric: 'leafWetness',
      value: reading.leafWetness,
      unit: '%',
      note: tr(wetDrive > 0.5 ? 'engine.dis.wetOpen' : 'engine.dis.wetBelow', { h: Math.round(wetHours) }),
    },
    {
      metric: 'humidity',
      value: reading.humidity,
      unit: '%',
      note: humid > 0.3 ? tr('engine.dis.humHigh') : tr('engine.dis.humOk'),
    },
  ];
  if (hasBio) {
    drivers.push({
      metric: 'voc',
      value: reading.biosensorNa!,
      unit: 'nA',
      note: bio > 0.35 ? tr('engine.dis.bioHigh') : tr('engine.dis.bioOk'),
    });
  }

  const recommendations: Recommendation[] = [];
  if (score >= 62) {
    recommendations.push(
      rec('dis-spray', 'cropHealth', tr('engine.dis.recSpray', { input: INPUT_SUGGESTIONS.disease }), 24, true)
    );
    recommendations.push(
      rec('dis-sanitation', 'cropHealth', tr('engine.dis.recClean'), 24, false)
    );
  } else if (score >= 33) {
    recommendations.push(
      rec('dis-watch', 'cropHealth', tr('engine.dis.recWatch', { disease: likely }), 48, false)
    );
    recommendations.push(
      rec('dis-airflow', 'cropHealth', tr('engine.dis.recAir'), 48, false)
    );
  }

  return {
    domain: 'cropHealth',
    score,
    level: levelForScore(score),
    severity: severityForScore(score),
    // A biosensor-equipped node materially raises confidence in a disease claim.
    confidence: round(clamp01(evidenceQuality(ctx) * (hasBio ? 0.94 : 0.74)), 2),
    title: score >= 62 ? tr('engine.dis.tHigh', { disease: likely }) : score >= 33 ? tr('engine.dis.tMid') : tr('engine.dis.tLow'),
    detail:
      score >= 33
        ? tr(hasBio ? 'engine.dis.dHighBio' : 'engine.dis.dHigh', {
            disease: likely,
            crop: crop.label,
            h: Math.round(wetHours),
            hum: reading.humidity,
            na: reading.biosensorNa,
          })
        : tr('engine.dis.dLow', { crop: crop.label }),
    drivers,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Climate risk
// ---------------------------------------------------------------------------

export function assessClimate(ctx: EngineContext): RiskAssessment {
  const { plot, reading, forecast } = ctx;
  const crop = cropProfile(plot.crop);
  const tempBand = crop.bands.airTemp ?? { ideal: [18, 33], critical: [8, 40], unit: '°C' };

  const heatNow = bandDeviation(reading.airTemp, tempBand);

  // Forecast-driven risks: heat spike, heavy rain, damaging wind.
  let forecastHeat = 0;
  let rain48 = 0;
  let windMax = reading.windSpeed;
  let hotDays = 0;
  if (forecast) {
    const days = forecast.daily.slice(0, 3);
    for (const d of days) {
      if (d.tempMax > tempBand.ideal[1]) {
        forecastHeat = Math.max(forecastHeat, clamp01((d.tempMax - tempBand.ideal[1]) / 10));
        hotDays += 1;
      }
      windMax = Math.max(windMax, d.windMax);
    }
    rain48 = forecast.hourly
      .filter((h) => h.at > reading.at && h.at <= reading.at + 2 * DAY)
      .reduce((s, h) => s + h.precip, 0);
  }

  const rainRisk = clamp01((rain48 - 35) / 60);
  const windRisk = clamp01((windMax - 25) / 25);
  const coldRisk = heatNow.direction === 'low' ? heatNow.dev : 0;

  const score = Math.round(
    clamp01(
      Math.max(heatNow.direction === 'high' ? heatNow.dev : 0, forecastHeat) * 0.42 +
        rainRisk * 0.28 +
        windRisk * 0.18 +
        coldRisk * 0.12
    ) * 100
  );

  const drivers: RiskAssessment['drivers'] = [
    {
      metric: 'airTemp',
      value: reading.airTemp,
      unit: '°C',
      note:
        heatNow.direction === 'high'
          ? tr('engine.cli.hot')
          : heatNow.direction === 'low'
            ? tr('engine.cli.cold')
            : tr('engine.cli.ok'),
    },
  ];
  if (forecast) {
    drivers.push({
      metric: 'forecast',
      value: round(rain48),
      unit: 'mm/48h',
      note: rainRisk > 0.2 ? tr('engine.cli.rainHigh') : tr('engine.cli.rainOk'),
    });
    drivers.push({
      metric: 'windSpeed',
      value: round(windMax),
      unit: 'km/h',
      note: windRisk > 0.2 ? tr('engine.cli.windHigh') : tr('engine.cli.windOk'),
    });
  }

  const recommendations: Recommendation[] = [];
  if (forecastHeat > 0.3 || (heatNow.direction === 'high' && heatNow.dev > 0.3)) {
    recommendations.push(
      rec('cli-heat', 'climate', tr('engine.cli.recHeat', { days: hotDays || 1 }), 24, false)
    );
    if (currentStage(plot, reading.at) === 'flowering') {
      recommendations.push(
        rec('cli-flower', 'climate', tr('engine.cli.recFlower'), 48, true)
      );
    }
  }
  if (rainRisk > 0.25) {
    recommendations.push(
      rec('cli-rain', 'climate', tr('engine.cli.recRain', { mm: Math.round(rain48) }), 24, false)
    );
  }
  if (windRisk > 0.3) {
    recommendations.push(
      rec('cli-wind', 'climate', tr('engine.cli.recWind', { wind: Math.round(windMax) }), 24, false)
    );
  }

  return {
    domain: 'climate',
    score,
    level: levelForScore(score),
    severity: severityForScore(score),
    confidence: round(clamp01(evidenceQuality(ctx) * (forecast ? 0.9 : 0.6)), 2),
    title:
      score >= 62
        ? tr('engine.cli.tHigh')
        : score >= 33
          ? tr('engine.cli.tMid')
          : tr('engine.cli.tLow'),
    detail:
      score >= 33
        ? tr('engine.cli.dHigh', {
            plot: plot.name,
            threats:
              [
                forecastHeat > 0.3 ? tr('engine.cli.heat') : null,
                rainRisk > 0.25 ? tr('engine.cli.rain') : null,
                windRisk > 0.3 ? tr('engine.cli.wind') : null,
              ]
                .filter(Boolean)
                .join(', ') || tr('engine.cli.marginal'),
          })
        : tr('engine.cli.dLow', { crop: crop.label }),
    drivers,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export interface PlotAssessment {
  at: number;
  plotId: string;
  healthIndex: number;
  risk: RiskLevel;
  risks: RiskAssessment[];
  /** Highest-severity risk that clears the confidence gate. */
  primary: RiskAssessment | null;
  recommendations: Recommendation[];
}

const DOMAIN_WEIGHT: Record<RiskDomain, number> = {
  cropHealth: 0.26,
  pest: 0.26,
  nutrient: 0.18,
  irrigation: 0.18,
  climate: 0.12,
};

/**
 * Run every domain and fold the scores into the 0-100 Crop Health Index shown on
 * the map legend. Health is the inverse of weighted risk, with the worst single
 * domain pulled in so one severe problem cannot be averaged away.
 */
export function assessPlot(ctx: EngineContext, confidenceThreshold = 0.55): PlotAssessment {
  const risks = [
    assessCropHealth(ctx),
    assessPest(ctx),
    assessNutrient(ctx),
    assessIrrigation(ctx),
    assessClimate(ctx),
  ];

  const weighted = risks.reduce((sum, r) => sum + r.score * DOMAIN_WEIGHT[r.domain], 0);
  const worst = risks.reduce((m, r) => (r.score > m.score ? r : m), risks[0]);
  // 70% weighted blend + 30% worst-domain, so a single critical risk still shows.
  const riskScore = clamp01((weighted * 0.7 + worst.score * 0.3) / 100) * 100;
  const healthIndex = Math.round(100 - riskScore);

  const credible = risks
    .filter((r) => r.confidence >= confidenceThreshold && r.score >= 33)
    .sort((a, b) => b.score - a.score);

  // Order actions by urgency window, then drop duplicates across domains.
  const seen = new Set<string>();
  const recommendations = credible
    .flatMap((r) => r.recommendations)
    .filter((r) => (seen.has(r.text) ? false : (seen.add(r.text), true)))
    .sort((a, b) => a.windowHours - b.windowHours);

  return {
    at: ctx.reading.at,
    plotId: ctx.plot.id,
    healthIndex,
    risk: levelForScore(riskScore),
    risks,
    primary: credible[0] ?? null,
    recommendations,
  };
}

/** Lightweight health index for a single interpolated cell (used per map cell). */
export function cellHealthIndex(plot: Plot, reading: SensorReading): { healthIndex: number; risk: RiskLevel } {
  const ctx: EngineContext = { plot, reading, nodesOnline: 1, nodesTotal: 1 };
  const risks = [assessCropHealth(ctx), assessPest(ctx), assessNutrient(ctx), assessIrrigation(ctx)];
  const weights: Record<string, number> = { cropHealth: 0.3, pest: 0.3, nutrient: 0.2, irrigation: 0.2 };
  const weighted = risks.reduce((s, r) => s + r.score * weights[r.domain], 0);
  const worst = risks.reduce((m, r) => (r.score > m.score ? r : m), risks[0]);
  const riskScore = clamp01((weighted * 0.65 + worst.score * 0.35) / 100) * 100;
  return { healthIndex: Math.round(100 - riskScore), risk: levelForScore(riskScore) };
}

/**
 * How long a farmer's "it is safe to fly" statement stands for.
 *
 * Twenty minutes. Long enough to walk to the drone and launch, short enough
 * that a squall arriving after they tapped it does not sit there as a valid
 * clearance. A stale attestation is the same failure as a fabricated zero.
 */
export const FARMER_CHECK_TTL_MS = 20 * 60_000;

export interface FlightCheck {
  ok: boolean;
  reason?: string;
  /** True when the app has nothing to judge on and should ask the farmer. */
  needsFarmerCheck?: boolean;
  /** Where the verdict came from, so the UI can attribute it. */
  source?: 'sensor' | 'forecast' | 'farmer';
}

/**
 * Whether weather currently permits autonomous drone flight.
 *
 * `reading` is nullable because a scouting field has no sensors on it — there is
 * no on-site wind or rainfall measurement to consult. In that case the check
 * falls back to the forecast, and says so.
 *
 * What it must never do is substitute zeros for the missing reading. Wind of
 * "0 km/h" and rainfall of "0 mm" read as perfect conditions, so a field with no
 * anemometer would be cleared to fly in a gale. Absent is not calm.
 */
export function droneFlightCheck(
  reading: SensorReading | null | undefined,
  forecast?: WeatherForecast | null,
  /**
   * The farmer's own statement that conditions are safe, with the time they
   * said it. A person standing in the field is a perfectly good anemometer for
   * "can I fly this" — better than no data at all — but the statement has to be
   * fresh, because weather moves and a confirmation from this morning says
   * nothing about now. See FARMER_CHECK_TTL_MS.
   */
  farmerCheck?: { at: number; safe: boolean } | null
): FlightCheck {
  if (!reading) {
    const hour = new Date().getHours();
    if (hour < DRONE_LIMITS.minVisibilityHour || hour > DRONE_LIMITS.maxVisibilityHour) {
      // Daylight is the one limit a farmer cannot overrule: it is a clock, not
      // a judgement, and we know it exactly without any sensor.
      return { ok: false, reason: tr('engine.fly.daylight') };
    }
    if (!forecast) {
      // Nothing measured and nothing forecast. Rather than a dead end, ask the
      // person who is standing there.
      if (farmerCheck && Date.now() - farmerCheck.at < FARMER_CHECK_TTL_MS) {
        return farmerCheck.safe
          ? { ok: true, source: 'farmer' }
          : { ok: false, reason: tr('engine.fly.farmerUnsafe'), source: 'farmer' };
      }
      return {
        ok: false,
        reason: tr('engine.fly.noData'),
        needsFarmerCheck: true,
      };
    }
    const soon = forecast.hourly.filter((h) => h.at > Date.now() && h.at < Date.now() + 3 * HOUR);
    const gust = soon.find((h) => h.wind > DRONE_LIMITS.maxWindKmh);
    if (gust) {
      return {
        ok: false,
        reason: tr('engine.fly.windForecast', { wind: Math.round(gust.wind), max: DRONE_LIMITS.maxWindKmh }),
        source: 'forecast',
      };
    }
    const wet = soon.find((h) => h.precip > DRONE_LIMITS.maxRainMm);
    if (wet) {
      return { ok: false, reason: tr('engine.fly.rainSoon'), source: 'forecast' };
    }
    return { ok: true, source: 'forecast' };
  }

  if (reading.windSpeed > DRONE_LIMITS.maxWindKmh) {
    return { ok: false, reason: tr('engine.fly.wind', { wind: Math.round(reading.windSpeed), max: DRONE_LIMITS.maxWindKmh }) };
  }
  if (reading.rainfall > DRONE_LIMITS.maxRainMm) {
    return { ok: false, reason: tr('engine.fly.raining', { mm: reading.rainfall }) };
  }
  const hour = new Date(reading.at).getHours();
  if (hour < DRONE_LIMITS.minVisibilityHour || hour > DRONE_LIMITS.maxVisibilityHour) {
    return { ok: false, reason: tr('engine.fly.daylight') };
  }
  if (forecast) {
    const nextHours = forecast.hourly.filter((h) => h.at > Date.now() && h.at < Date.now() + 3 * HOUR);
    if (nextHours.some((h) => h.wind > DRONE_LIMITS.maxWindKmh + 6)) {
      return { ok: false, reason: tr('engine.fly.gusts') };
    }
  }
  return { ok: true };
}
