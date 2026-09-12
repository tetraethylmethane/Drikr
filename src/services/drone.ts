import { DRONE_LIMITS } from '../config/agronomy';
import {
  Alert,
  DroneMission,
  GridRef,
  HealthMap,
  MissionType,
  Plot,
  SensorReading,
  WeatherForecast,
} from '../types';
import { droneFlightCheck } from './decisionEngine';
import { affectedFraction, riskCells } from './healthMap';
import { nextCalmWindow } from './weather';

/**
 * Drone mission planning — the "Autonomous Response" and "Drone Action" stages.
 *
 * Missions are always *proposed* first and require the farmer to confirm (the
 * mockup's "Confirm Schedule" button). Autonomy here means the system works out
 * what, where and when; a person still authorises the spray. That is both the
 * deck's stated false-alert mitigation and the right default for something that
 * puts chemicals on a field.
 */

const HOUR = 3600_000;

function missionId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Next occurrence of the preferred evening spray hour. */
function preferredSlot(now: number): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  if (d.getHours() >= DRONE_LIMITS.preferredHour) d.setDate(d.getDate() + 1);
  d.setHours(DRONE_LIMITS.preferredHour);
  return d.getTime();
}

export interface ProposeInput {
  plot: Plot;
  type: MissionType;
  map?: HealthMap | null;
  reading: SensorReading;
  forecast?: WeatherForecast | null;
  alert?: Alert;
  chemical?: string;
  now?: number;
}

/**
 * Build a mission proposal: target only the cells that need treatment, size the
 * payload from that area, and pick a slot that satisfies the weather limits.
 * Spraying 30% of a field instead of all of it is where the chemical saving comes from.
 */
export function proposeMission(input: ProposeInput): DroneMission {
  const { plot, type, map, reading, forecast, alert, chemical, now = Date.now() } = input;

  const targetCells: GridRef[] = type === 'spray' ? riskCells(map ?? null, 55) : [];
  const fraction = type === 'spray' ? Math.max(0.08, affectedFraction(map ?? null, 55)) : 1;
  const areaAcres = Math.round(plot.areaAcres * fraction * 100) / 100;

  const flight = droneFlightCheck(reading, forecast);
  const calm = nextCalmWindow(forecast ?? null, DRONE_LIMITS.maxWindKmh, DRONE_LIMITS.maxRainMm);

  // If conditions are bad now, schedule into the next permitted window instead of blocking.
  let scheduledAt = preferredSlot(now);
  let blockedReason: string | undefined;
  if (!flight.ok) {
    if (calm && calm > now) {
      scheduledAt = Math.max(calm, now + HOUR);
    } else {
      blockedReason = flight.reason;
    }
  }

  return {
    id: missionId(),
    plotId: plot.id,
    plotName: plot.name,
    type,
    status: blockedReason ? 'blocked' : 'proposed',
    scheduledAt,
    createdAt: now,
    targetCells,
    areaAcres,
    payload:
      type === 'spray'
        ? {
            chemical: chemical ?? 'Neem-based biopesticide (azadirachtin 1500 ppm)',
            litres: Math.max(1, Math.round(areaAcres * DRONE_LIMITS.litresPerAcre * 10) / 10),
          }
        : undefined,
    blockedReason,
    alertId: alert?.id,
  };
}

/** Cost of running a mission versus treating the whole plot conventionally. */
export function missionEconomics(mission: DroneMission, plot: Plot) {
  const droneCost = Math.round(mission.areaAcres * 500);
  const conventionalCost = Math.round(plot.areaAcres * 1150);
  const chemicalSavedPct =
    plot.areaAcres > 0 ? Math.round((1 - mission.areaAcres / plot.areaAcres) * 100) : 0;
  return {
    droneCost,
    conventionalCost,
    saving: Math.max(0, conventionalCost - droneCost),
    chemicalSavedPct: Math.max(0, chemicalSavedPct),
    waterLitres: Math.round(mission.areaAcres * DRONE_LIMITS.litresPerAcre),
    conventionalWaterLitres: Math.round(plot.areaAcres * 220),
  };
}

export function canConfirm(mission: DroneMission): boolean {
  return mission.status === 'proposed';
}

/** Legal state transitions, so the UI cannot drive a mission into a bad state. */
export function nextStatus(mission: DroneMission, now = Date.now()): DroneMission {
  switch (mission.status) {
    case 'scheduled':
      return now >= mission.scheduledAt ? { ...mission, status: 'in_flight' } : mission;
    case 'in_flight': {
      // A pass takes roughly 4 minutes per acre.
      const durationMs = Math.max(4 * 60_000, mission.areaAcres * 4 * 60_000);
      if (now >= mission.scheduledAt + durationMs) {
        return { ...mission, status: 'completed', completedAt: now, coveragePct: 100 };
      }
      const pct = Math.min(
        99,
        Math.round(((now - mission.scheduledAt) / durationMs) * 100)
      );
      return { ...mission, coveragePct: Math.max(1, pct) };
    }
    default:
      return mission;
  }
}

export function missionStatusLabel(status: DroneMission['status']): string {
  switch (status) {
    case 'proposed':
      return 'Awaiting confirmation';
    case 'scheduled':
      return 'Scheduled';
    case 'in_flight':
      return 'In flight';
    case 'completed':
      return 'Completed';
    case 'aborted':
      return 'Aborted';
    case 'blocked':
      return 'Blocked by weather';
  }
}

export function activeMissions(missions: DroneMission[]): DroneMission[] {
  return missions.filter(
    (m) => m.status === 'proposed' || m.status === 'scheduled' || m.status === 'in_flight' || m.status === 'blocked'
  );
}
