import env, { hasIngest } from '../config/env';
import {
  cacheGet,
  cacheSet,
  drainOutboxKind,
  enqueue,
  isOnline,
  outboxCount,
} from './offline';
import { masterBaseUrl } from './hardware';

/**
 * Phone-as-courier sync.
 *
 * The Master has no SIM, no gateway and no subscription. It does not need any:
 * the farmer walks past it anyway. So it buffers readings, the phone collects
 * them whenever it is in range, and the phone uploads when it next has signal.
 *
 * This is the whole cloud strategy for phase 1, and it costs nothing. It is also
 * the same store-and-forward shape that a real backhaul would use later — the
 * outbox does not care whether the next hop is WiFi, cellular or a satellite
 * pass.
 *
 * Collection is resumable by sequence number. A walk-past that gets interrupted
 * halfway must not duplicate readings or lose them, and the Master keeps its
 * ring intact after acknowledgement so a second phone can still collect.
 */

const CURSOR_KEY = 'courier:cursor';
const COLLECT_TIMEOUT_MS = 8000;
const PAGE_LIMIT = 120;
/** The relay 413s above 500 readings per request; stay well under it. */
const CHUNK_SIZE = 400;

export interface CourierReading {
  seq: number;
  node: string;
  /** How long ago the Master received it. */
  ageMs: number;
  present: number;
  temp: number;
  hum: number;
  lux: number;
  gas: number;
  a0: number;
  a1: number;
  a2: number;
  a3: number;
  vbat: number;
}

interface HistoryResponse {
  device: string;
  latestSeq: number;
  oldestSeq: number;
  count: number;
  readings: CourierReading[];
}

export interface CollectResult {
  collected: number;
  /** Readings the Master had already dropped from its ring before we arrived. */
  missed: number;
  /** Readings from a node label the app does not know — setup is incomplete. */
  unmapped: number;
  latestSeq: number;
  queued: number;
}

/**
 * Only one collect and one upload may be in flight.
 *
 * Both the background loop and the farmer's "Sync now" button call in here, and
 * a second collect overlapping the first would read the same cursor and queue
 * every reading twice.
 */
let collecting = false;
let uploading = false;

async function readCursor(): Promise<number> {
  const hit = await cacheGet<number>(CURSOR_KEY);
  return typeof hit?.value === 'number' ? hit.value : 0;
}

async function writeCursor(seq: number): Promise<void> {
  // Long TTL: the cursor is not a cache, it is the record of what has been
  // collected. Losing it means re-collecting, which is wasteful but not wrong.
  await cacheSet(CURSOR_KEY, seq, 365 * 24 * 3600_000);
}

/**
 * Collect everything the Master holds that we have not already taken.
 *
 * `plotIdForNode` has to be supplied by the caller. The Master reports node
 * labels (S1, S2) and knows nothing about the app's plots, so it cannot label a
 * reading with one — only the app's node registry can. Resolving per reading
 * rather than per batch also means two slaves in two different plots are filed
 * correctly instead of both landing wherever the batch was labelled.
 *
 * Returns null when the Master is not reachable, which is the normal case — the
 * phone is only near it some of the time, and that is not an error.
 */
export async function collectFromMaster(
  plotIdForNode: (nodeLabel: string) => string | null
): Promise<CollectResult | null> {
  const base = masterBaseUrl();
  if (!base) return null;
  if (collecting) return null;
  collecting = true;
  try {
    return await collectInner(base, plotIdForNode);
  } finally {
    collecting = false;
  }
}

async function collectInner(
  base: string,
  plotIdForNode: (nodeLabel: string) => string | null
): Promise<CollectResult | null> {
  let cursor = await readCursor();
  let collected = 0;
  let missed = 0;
  let unmapped = 0;
  let latestSeq = cursor;

  // Page until the Master has nothing newer. Bounded so a Master that has been
  // running for months cannot hold the UI thread in a loop.
  for (let page = 0; page < 20; page++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COLLECT_TIMEOUT_MS);
    let body: HistoryResponse;
    try {
      const res = await fetch(
        `${base}/api/history?since=${cursor}&limit=${PAGE_LIMIT}`,
        { signal: controller.signal }
      );
      if (!res.ok) return null;
      body = (await res.json()) as HistoryResponse;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (body.device !== 'drikr-master') return null;
    latestSeq = body.latestSeq;

    // The ring drops its oldest entries. If its oldest is newer than where we
    // left off, those readings are simply gone — report the gap rather than
    // pretending the series is continuous.
    if (page === 0 && cursor > 0 && body.oldestSeq > cursor + 1) {
      missed = body.oldestSeq - cursor - 1;
    }

    if (!Array.isArray(body.readings) || body.readings.length === 0) break;

    // Queue rather than upload. The phone may be standing in a field with no
    // signal — that is the expected case, not a failure.
    const now = Date.now();
    for (const r of body.readings) {
      // The cursor advances either way. A reading we cannot attribute is not
      // recoverable by looking at it again, and holding the cursor back would
      // stall every later reading behind it.
      if (r.seq > cursor) cursor = r.seq;

      const plotId = plotIdForNode(r.node);
      if (!plotId) {
        // A node the farmer has not added yet. Counted and surfaced rather than
        // filed under a guess — see sendToRelay.
        unmapped += 1;
        continue;
      }

      await enqueue('telemetry', {
        ...r,
        // Required by the relay, and only the app knows it.
        plotId,
        // The Master has no real-time clock, so it reports age and the phone
        // supplies the wall time. A timestamp the Master invented would be
        // worse than useless.
        measuredAt: now - (r.ageMs ?? 0),
        collectedAt: now,
      });
      collected += 1;
    }

    await writeCursor(cursor);
    if (body.readings.length < PAGE_LIMIT) break;
  }

  // Advisory: lets the Master report how far behind the courier is.
  if (collected > 0 || unmapped > 0) {
    try {
      await fetch(`${base}/api/history/ack?seq=${cursor}`, { method: 'POST' });
    } catch {
      // Acknowledgement is not load-bearing; the cursor lives on the phone.
    }
  }

  return { collected, missed, unmapped, latestSeq, queued: await outboxCount() };
}

/**
 * Send one batch to the telemetry relay.
 *
 * Batched rather than one request per reading: a walk-past can yield a couple of
 * hundred readings, and that many round trips on a rural connection would mostly
 * time out.
 */
export async function sendToRelay(payloads: unknown[]): Promise<boolean> {
  if (!hasIngest() || payloads.length === 0) return false;

  // Group by plot, since the relay takes one plot per request.
  //
  // A payload with no plotId is dropped rather than filed under a placeholder.
  // Inventing "unknown" would put real readings in a plot that does not exist,
  // where they would look like data rather than like the mistake they are. The
  // only way this happens is an item queued before plotId was required.
  const byPlot = new Map<string, unknown[]>();
  let unattributed = 0;
  for (const p of payloads) {
    const plotId = (p as { plotId?: string }).plotId;
    if (!plotId) {
      unattributed += 1;
      continue;
    }
    const list = byPlot.get(plotId) ?? [];
    list.push(p);
    byPlot.set(plotId, list);
  }

  if (byPlot.size === 0) {
    // Nothing sendable. Report success so the queue clears: these items carry no
    // plot and never will, so retrying them forever would block every later
    // upload behind data that cannot be saved.
    if (unattributed > 0) {
      console.warn(`[courier] dropped ${unattributed} reading(s) with no plotId`);
    }
    return true;
  }

  for (const [plotId, readings] of byPlot) {
    // Chunked because the relay rejects more than 500 readings in one request
    // with a 413. Without this, a queue that built up over several walk-passes
    // would fail every single retry and eventually hit the attempt ceiling —
    // losing exactly the backlog the courier exists to carry.
    for (let i = 0; i < readings.length; i += CHUNK_SIZE) {
      const chunk = readings.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch(env.ingestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-drikr-key': env.ingestKey,
          },
          body: JSON.stringify({ plotId, via: 'courier', readings: chunk }),
        });
        // A failure part-way through re-sends the chunks that already landed,
        // because the caller retries the whole batch. That is safe: the relay
        // keys each document by timestamp and node, so a re-upload overwrites
        // instead of duplicating.
        if (!res.ok) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

/**
 * Upload the queued readings.
 *
 * Uses drainOutboxKind rather than drainOutbox, for two reasons that both
 * mattered:
 *
 *  - The whole batch goes in one request. Draining item-by-item would have made
 *    two hundred HTTPS round trips out of one walk-past, which on a rural
 *    connection mostly means two hundred timeouts.
 *  - It touches only telemetry. The generic drain asks the handler about every
 *    item and counts a refusal as a failed attempt, so a courier run would have
 *    burned the retry budget on the farmer's own alert feedback and community
 *    posts until the queue dropped them.
 *
 * `send` stays injectable so the transport can change — a Cloud Function now, a
 * cellular Master or a satellite pass later — without touching queue semantics.
 *
 * Returns null when there is nothing to do: offline, or no relay configured.
 * Either way the readings stay queued rather than dropped, because the phone is
 * very likely the only copy.
 */
export async function uploadQueued(
  send: (payloads: unknown[]) => Promise<boolean> = sendToRelay
): Promise<UploadResult | null> {
  if (!hasIngest()) return null;
  if (uploading) return null;
  uploading = true;
  try {
    if (!(await isOnline())) return null;
    return await drainOutboxKind('telemetry', send);
  } finally {
    uploading = false;
  }
}

export interface UploadResult {
  sent: number;
  remaining: number;
  dropped: number;
}

export interface CourierRun {
  at: number;
  collect: CollectResult | null;
  upload: UploadResult | null;
  queued: number;
}

/**
 * One full courier pass: take what the Master has, then push what we hold.
 *
 * Both halves are independent and both are allowed to do nothing. Walking past
 * the Master with no signal collects but cannot upload; sitting at home with
 * signal uploads but has nothing to collect. Neither case is an error, which is
 * why each half returns null rather than throwing.
 */
export async function runCourier(
  plotIdForNode: (nodeLabel: string) => string | null
): Promise<CourierRun> {
  const collect = await collectFromMaster(plotIdForNode);
  const upload = await uploadQueued();
  return { at: Date.now(), collect, upload, queued: await outboxCount() };
}

/** Human-readable summary for the Sensor Nodes screen. */
export function describeCollection(result: CollectResult | null): string | null {
  if (!result) return null;
  if (result.collected === 0 && result.missed === 0 && result.unmapped === 0) return null;
  const parts = [`${result.collected} collected`];
  if (result.missed > 0) parts.push(`${result.missed} lost before pickup`);
  if (result.unmapped > 0) parts.push(`${result.unmapped} from an unknown node`);
  if (result.queued > 0) parts.push(`${result.queued} waiting to upload`);
  return parts.join(' · ');
}
