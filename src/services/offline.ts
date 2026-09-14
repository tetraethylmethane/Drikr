import AsyncStorage from '@react-native-async-storage/async-storage';
import { OutboxItem } from '../types';

/**
 * Offline-first plumbing.
 *
 * The deck commits to working in low-connectivity areas with "offline data storage +
 * auto-sync when online". Two pieces deliver that:
 *
 *  - a namespaced cache with TTL, so the last good weather/market/telemetry picture
 *    is shown instead of an empty screen;
 *  - an outbox that queues the farmer's own writes (alert acknowledgements, feedback,
 *    mission confirmations) and drains them when the network returns.
 *
 * Connectivity is probed with a cheap HEAD request rather than NetInfo: the native
 * module is not installed, and a reachability check is more honest than a radio-state
 * flag anyway — a phone can show full bars on a dead rural backhaul.
 */

const CACHE_PREFIX = 'drikr:cache:';
const OUTBOX_KEY = 'drikr:outbox';

interface CacheEnvelope<T> {
  v: T;
  at: number;
  ttl: number;
}

export async function cacheSet<T>(key: string, value: T, ttlMs = 6 * 3600_000): Promise<void> {
  try {
    const env: CacheEnvelope<T> = { v: value, at: Date.now(), ttl: ttlMs };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(env));
  } catch {
    // A cache write failing must never break a screen.
  }
}

export interface CacheHit<T> {
  value: T;
  at: number;
  stale: boolean;
}

/** Returns expired entries too, flagged `stale`, so the UI can show age instead of nothing. */
export async function cacheGet<T>(key: string): Promise<CacheHit<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    return { value: env.v, at: env.at, stale: Date.now() - env.at > env.ttl };
  } catch {
    return null;
  }
}

export async function cacheClear(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    /* ignore */
  }
}

// --- Outbox ----------------------------------------------------------------

export async function readOutbox(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: OutboxItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export async function enqueue(kind: OutboxItem['kind'], payload: unknown): Promise<void> {
  const items = await readOutbox();
  items.push({
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  });
  await writeOutbox(items);
}

export async function outboxCount(): Promise<number> {
  return (await readOutbox()).length;
}

/**
 * Drain the outbox. `send` returns true when an item was accepted; failures stay
 * queued with an incremented attempt count. Items that keep failing are dropped
 * after 8 tries so a poison payload cannot block the queue forever.
 */
export async function drainOutbox(
  send: (item: OutboxItem) => Promise<boolean>
): Promise<{ sent: number; remaining: number }> {
  const items = await readOutbox();
  if (items.length === 0) return { sent: 0, remaining: 0 };

  const keep: OutboxItem[] = [];
  let sent = 0;

  for (const item of items) {
    let ok = false;
    try {
      ok = await send(item);
    } catch {
      ok = false;
    }
    if (ok) {
      sent += 1;
    } else if (item.attempts + 1 < 8) {
      keep.push({ ...item, attempts: item.attempts + 1 });
    }
  }

  await writeOutbox(keep);
  return { sent, remaining: keep.length };
}

/**
 * Drain one kind of item, handing the whole set to `send` at once.
 *
 * Two things `drainOutbox` gets wrong for telemetry:
 *
 *  1. It calls `send` once per item. A walk-past can yield two hundred
 *     readings, and two hundred separate HTTPS round trips on a rural
 *     connection will mostly time out. They have to go in one request.
 *  2. It penalises every item on every pass. A handler that only deals with
 *     telemetry has to return false for a community post it was never asked to
 *     send — which increments that post's attempt counter, and after eight
 *     courier runs the queue drops the farmer's own writing. Filtering by kind
 *     first means untouched items keep their counter intact.
 *
 * `send` returns true only if the whole batch was accepted. Partial success is
 * not representable, so a failed batch is retried whole — the relay makes writes
 * idempotent precisely so that is safe.
 */
export async function drainOutboxKind(
  kind: OutboxItem['kind'],
  send: (payloads: unknown[]) => Promise<boolean>,
  maxAttempts = 12
): Promise<{ sent: number; remaining: number; dropped: number }> {
  const items = await readOutbox();
  const mine = items.filter((i) => i.kind === kind);
  const others = items.filter((i) => i.kind !== kind);

  if (mine.length === 0) {
    return { sent: 0, remaining: others.length, dropped: 0 };
  }

  let ok = false;
  try {
    ok = await send(mine.map((i) => i.payload));
  } catch {
    ok = false;
  }

  if (ok) {
    await writeOutbox(others);
    return { sent: mine.length, remaining: others.length, dropped: 0 };
  }

  // A higher attempt ceiling than the generic drain: telemetry is field data
  // that cannot be recreated, so it is worth retrying for longer before giving
  // up on it.
  const keep = mine
    .map((i) => ({ ...i, attempts: i.attempts + 1 }))
    .filter((i) => i.attempts < maxAttempts);
  const dropped = mine.length - keep.length;

  await writeOutbox([...others, ...keep]);
  return { sent: 0, remaining: others.length + keep.length, dropped };
}

// --- Connectivity ----------------------------------------------------------

const PROBE_URL = 'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m';

export async function isOnline(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(PROBE_URL, { method: 'GET', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function formatAge(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
