import { Alert, GridRef, HealthMap, Plot, RiskAssessment, Severity } from '../types';
import { PlotAssessment } from './decisionEngine';

/**
 * Turns risk assessments into the alert feed.
 *
 * Two guards exist because a monitoring app that cries wolf gets uninstalled — and
 * the deck names "AI false alerts" as a key risk with "confidence thresholds +
 * farmer confirmation" as the mitigation:
 *
 *  1. Confidence gate — a risk below the user's threshold never becomes an alert.
 *  2. Cooldown + dedupe — the same domain on the same plot cannot re-alert while an
 *     unresolved alert is already open, or within the cooldown window after one was
 *     handled. Severity escalation is the single exception that bypasses cooldown.
 */

const HOUR = 3600_000;

/** Per-severity re-alert cooldown. Critical problems may repeat sooner. */
const COOLDOWN_HOURS: Record<Severity, number> = {
  critical: 4,
  high: 8,
  medium: 18,
  low: 36,
  info: 72,
};

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

export interface AlertGenInput {
  plot: Plot;
  assessment: PlotAssessment;
  map?: HealthMap | null;
  existing: Alert[];
  confidenceThreshold: number;
  /** Domains the farmer muted in settings. */
  mutedDomains?: string[];
  now?: number;
}

function alertId(plotId: string, domain: string, at: number): string {
  return `${plotId}:${domain}:${at}`;
}

function shouldEmit(risk: RiskAssessment, plotId: string, existing: Alert[], now: number): boolean {
  const prior = existing
    .filter((a) => a.plotId === plotId && a.domain === risk.domain)
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  if (!prior) return true;

  // An open alert already covers this; escalate only if it got materially worse.
  if (prior.status === 'new' || prior.status === 'acknowledged') {
    return severityRank(risk.severity) > severityRank(prior.severity);
  }

  // Dismissed or resolved: respect the cooldown unless severity escalated.
  const cooldown = COOLDOWN_HOURS[prior.severity] * HOUR;
  if (now - prior.createdAt < cooldown) {
    return severityRank(risk.severity) > severityRank(prior.severity);
  }
  return true;
}

/** Locate the worst cell so the alert can name a grid reference, as in the mockup. */
function worstCellRef(map?: HealthMap | null): GridRef | undefined {
  return map?.worst?.gridRef;
}

export function generateAlerts(input: AlertGenInput): Alert[] {
  const {
    plot,
    assessment,
    map,
    existing,
    confidenceThreshold,
    mutedDomains = [],
    now = Date.now(),
  } = input;

  const out: Alert[] = [];

  for (const risk of assessment.risks) {
    if (mutedDomains.includes(risk.domain)) continue;
    // Only genuine problems, and only confident ones.
    if (risk.score < 33) continue;
    if (risk.confidence < confidenceThreshold) continue;
    if (!shouldEmit(risk, plot.id, existing, now)) continue;

    out.push({
      id: alertId(plot.id, risk.domain, now),
      plotId: plot.id,
      plotName: plot.name,
      domain: risk.domain,
      severity: risk.severity,
      confidence: risk.confidence,
      title: risk.title,
      detail: risk.detail,
      gridRef: risk.domain === 'pest' || risk.domain === 'cropHealth' ? worstCellRef(map) : undefined,
      createdAt: now,
      status: 'new',
      recommendations: risk.recommendations,
      drivers: risk.drivers,
    });
  }

  // Most severe first so the Home banner shows the one that matters.
  return out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

/** Suppressed risks, so the UI can explain why something is not an alert yet. */
export function suppressedRisks(
  assessment: PlotAssessment,
  confidenceThreshold: number
): Array<{ risk: RiskAssessment; reason: string }> {
  return assessment.risks
    .filter((r) => r.score >= 33 && r.confidence < confidenceThreshold)
    .map((r) => ({
      risk: r,
      reason: `Confidence ${Math.round(r.confidence * 100)}% is below your ${Math.round(
        confidenceThreshold * 100
      )}% alert threshold`,
    }));
}

export function sortAlerts(alerts: Alert[]): Alert[] {
  const statusRank: Record<Alert['status'], number> = {
    new: 0,
    acknowledged: 1,
    resolved: 2,
    dismissed: 3,
  };
  return [...alerts].sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
    if (severityRank(a.severity) !== severityRank(b.severity)) {
      return severityRank(b.severity) - severityRank(a.severity);
    }
    return b.createdAt - a.createdAt;
  });
}

export function unreadCount(alerts: Alert[]): number {
  return alerts.filter((a) => a.status === 'new').length;
}

export function activeAlerts(alerts: Alert[]): Alert[] {
  return alerts.filter((a) => a.status === 'new' || a.status === 'acknowledged');
}
