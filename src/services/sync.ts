import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { currentUid, db, ensureSignedIn } from '../config/firebase';
import { hasFirebase } from '../config/env';
import { drainOutboxKind } from './offline';
import { DroneBooking, OutboxItem } from '../types';

/**
 * The farmer's own writes, and the live view of them.
 *
 * Until now the outbox had exactly one real sender — `uploadQueued` in
 * courier.ts, for telemetry. Everything else the farmer does (acknowledging an
 * alert, rating whether a warning was right, confirming a mission, posting to
 * the community, recording a scout observation) was queued to AsyncStorage and
 * never sent anywhere, because there was no backend for it. That was honest
 * while it was true. It stops being honest the moment the app ships, because
 * the farmer has no way to tell their feedback is going nowhere.
 *
 * Two halves:
 *
 *   push  — drains each outbox kind into Firestore, one atomic batch per kind.
 *   watch — onSnapshot listeners, so a change written on another device, or by
 *           the ingest relay, appears here without a refresh.
 *
 * Both no-op when Firebase is not configured. The app has always run fully
 * offline against the simulator, and adding a cloud must not quietly turn that
 * path into a failure.
 */

/* ------------------------------------------------------------------ paths */

/**
 * Documents hang off the farmer's phone number, which is already the user
 * document id from the PIN login. Reusing that key means the rules in
 * FIRESTORE_SECURITY_RULES.md — which scope writes to the signed-in phone —
 * cover these collections without inventing a second scheme.
 */
const userDoc = (phone: string) => doc(db, 'users', phone);
const userCol = (phone: string, name: string) => collection(userDoc(phone), name);

/** Community is shared rather than per-user: that is the whole point of it. */
const communityCol = () => collection(db, 'community');

export const syncAvailable = hasFirebase;

/* -------------------------------------------------------------------- push */

/**
 * `drainOutboxKind` hands over the queued **payloads** of one kind and deletes
 * them only if this resolves true — so a partial write would lose the rest. A
 * Firestore batch is atomic, which makes "all or nothing" true rather than
 * merely intended.
 *
 * `idOf` has to derive a document id from the payload alone, because the
 * outbox item's own id is not passed through. Every payload that needs a
 * stable id already carries one (an alert id, a mission id, a post id); where
 * none exists the write is append-only and an auto id is correct.
 */
function batchWriter(
  target: (payload: Record<string, unknown>, i: number) => ReturnType<typeof doc>,
  decorate: (payload: Record<string, unknown>) => Record<string, unknown> = (p) => p,
) {
  return async (payloads: unknown[]): Promise<boolean> => {
    if (!payloads.length) return true;
    try {
      const batch = writeBatch(db);
      payloads.forEach((raw, i) => {
        const payload = (raw ?? {}) as Record<string, unknown>;
        batch.set(target(payload, i), { ...decorate(payload), syncedAt: serverTimestamp() }, {
          merge: true,
        });
      });
      await batch.commit();
      return true;
    } catch {
      // Staying queued is the right failure: drainOutboxKind counts the
      // attempt and the farmer's write is still on their device.
      return false;
    }
  };
}

const str = (v: unknown, fallback: string) =>
  typeof v === 'string' && v.length ? v : typeof v === 'number' ? String(v) : fallback;

export interface PushResult {
  sent: number;
  remaining: number;
  dropped: number;
  skipped: string | null;
}

/**
 * Drain every farmer-write kind into Firestore.
 *
 * Telemetry is deliberately excluded: it has its own sender in courier.ts with
 * a far higher attempt ceiling, because a lost reading cannot be recreated
 * whereas a community post can be typed again.
 */
export async function pushFarmerWrites(phone: string | null): Promise<PushResult> {
  const empty: PushResult = { sent: 0, remaining: 0, dropped: 0, skipped: null };
  if (!syncAvailable()) return { ...empty, skipped: 'firebase not configured' };
  if (!phone) return { ...empty, skipped: 'not signed in' };

  const stamp = Date.now();

  const kinds: [OutboxItem['kind'], (p: unknown[]) => Promise<boolean>][] = [
    [
      'alertStatus',
      batchWriter((p) => doc(userCol(phone, 'alerts'), str(p.alertId, `a-${stamp}`))),
    ],
    [
      // Feedback is its own document, not a field on the alert: a farmer can
      // say a warning was wrong without resolving it, and merging the two
      // loses whichever arrives second. Scout observations arrive on this
      // kind too, and are append-only, so they take a generated id.
      'alertFeedback',
      batchWriter((p, i) =>
        doc(userCol(phone, 'feedback'), `${str(p.alertId, str(p.plotId, 'obs'))}-${stamp}-${i}`),
      ),
    ],
    ['mission', batchWriter((p) => doc(userCol(phone, 'missions'), str(p.id, `m-${stamp}`)))],
    [
      'communityPost',
      batchWriter(
        (p, i) => doc(communityCol(), str(p.id, `p-${stamp}-${i}`)),
        // Ownership is the Firebase uid, never the phone number: every user can
        // read the community, and a phone number on a public post is exactly
        // the personal data that must not leak. `likedByMe` is this phone's
        // own state and stays here.
        ({ likedByMe: _mine, ...p }) =>
          // Firestore refuses `undefined` values outright, and an optional
          // field (district, crop) is often absent.
          Object.fromEntries(
            Object.entries({ ...p, authorUid: currentUid() }).filter(([, v]) => v !== undefined),
          ),
      ),
    ],
  ];

  let sent = 0;
  let remaining = 0;
  let dropped = 0;

  for (const [kind, send] of kinds) {
    const r = await drainOutboxKind(kind, send);
    sent += r.sent;
    dropped += r.dropped;
    remaining = r.remaining; // the last pass reports the true queue length
  }

  return { sent, remaining, dropped, skipped: null };
}

/* -------------------------------------------------- telemetry, without a relay */

/**
 * Upload readings straight to Firestore from the phone.
 *
 * The Cloud Function relay exists because an ESP32 doing Firestore auth is a
 * lot of fragile state on a chip that reboots — that reasoning is sound, and
 * still holds for a Master that posts on its own. It does not hold for the
 * courier path, where the uploader is a phone that already has the Firestore
 * SDK, already holds the config, and is already online when it uploads.
 *
 * Going direct means the whole product runs on Firebase's free Spark plan.
 * Functions v2 and Secret Manager both require Blaze, which is a billing card
 * for a product that writes a few hundred documents a day per farm.
 *
 * The document shape, the path and the id are deliberately identical to
 * functions/index.js. Both writers must produce the same thing, or data that
 * arrived by relay and data that arrived by courier would need different
 * readers — and the id being `{at}-{nodeId}` is what makes a retried upload
 * overwrite rather than inflate the history.
 */
const UNSET = -1;

function cleanReading(raw: Record<string, unknown>, plotId: string) {
  const at = Math.round(Number(raw.measuredAt ?? raw.at ?? 0));
  if (!Number.isFinite(at) || at <= 0) return null;

  const doc: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'measuredAt' || k === 'node' || k === 'plotId') continue;
    // An absent metric must stay absent. The engine treats UNKNOWN_METRIC as
    // "no sensor"; writing it to the database as a number would make a missing
    // probe indistinguishable from a real reading of -1.
    if (v === null || v === undefined || v === UNSET) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    doc[k] = v;
  }
  if (Object.keys(doc).length === 0) return null;

  const nodeId = typeof raw.node === 'string' ? raw.node.slice(0, 32) : 'unknown';
  return { id: `${at}-${nodeId}`, doc: { ...doc, plotId, nodeId, at, via: 'courier' } };
}

/**
 * A `send` for `uploadQueued`, with the same contract as the relay sender:
 * true only if the whole batch landed, so a failure leaves everything queued.
 */
export async function sendReadingsToFirestore(payloads: unknown[]): Promise<boolean> {
  if (!syncAvailable() || !payloads.length) return false;

  try {
    const byPlot = new Map<string, { id: string; doc: Record<string, unknown> }[]>();
    for (const raw of payloads) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const plotId = typeof r.plotId === 'string' ? r.plotId : '';
      if (!plotId) continue; // unattributable; the courier already warns about these
      const cleaned = cleanReading(r, plotId);
      if (!cleaned) continue;
      const list = byPlot.get(plotId) ?? [];
      list.push(cleaned);
      byPlot.set(plotId, list);
    }
    if (byPlot.size === 0) return true; // nothing valid to write is not a failure

    for (const [plotId, rows] of byPlot) {
      // Firestore caps a batch at 500 writes, and the per-plot summary below
      // takes one of them.
      for (let i = 0; i < rows.length; i += 450) {
        const slice = rows.slice(i, i + 450);
        const batch = writeBatch(db);
        let newest = slice[0];
        for (const row of slice) {
          batch.set(doc(db, 'telemetry', plotId, 'readings', row.id), {
            ...row.doc,
            receivedAt: serverTimestamp(),
          });
          if ((row.doc.at as number) > (newest.doc.at as number)) newest = row;
        }
        // One cheap summary document per plot, so a watching device costs a
        // single read instead of a query. Same field as the relay writes.
        batch.set(
          doc(db, 'telemetry', plotId),
          { latest: newest.doc, updatedAt: serverTimestamp() },
          { merge: true },
        );
        await batch.commit();
      }
    }
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ watch */

export type Unsubscribe = () => void;

const noop: Unsubscribe = () => {};

/**
 * Live community feed.
 *
 * onSnapshot delivers the cached copy first and the server copy when it
 * arrives, so this paints instantly offline and then corrects itself — the
 * behaviour the offline-first design already promises everywhere else.
 */
export function watchCommunity(
  onChange: (posts: Record<string, unknown>[]) => void,
  max = 50,
): Unsubscribe {
  if (!syncAvailable()) return noop;
  try {
    return onSnapshot(
      query(communityCol(), orderBy('at', 'desc'), fsLimit(max)),
      (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      // A listener that throws on a permissions error must not take the screen
      // with it — the local copy stays on show.
      () => {},
    );
  } catch {
    return noop;
  }
}

/** This farmer's alert statuses, live, so a second device agrees with the first. */
export function watchAlertStatus(
  phone: string | null,
  onChange: (byAlertId: Record<string, unknown>) => void,
): Unsubscribe {
  if (!phone || !syncAvailable()) return noop;
  try {
    return onSnapshot(
      userCol(phone, 'alerts'),
      (snap) => {
        const out: Record<string, unknown> = {};
        snap.forEach((d) => {
          out[d.id] = d.data();
        });
        onChange(out);
      },
      () => {},
    );
  } catch {
    return noop;
  }
}

/**
 * Live readings for a plot, from the collection the ingest relay writes.
 *
 * This is what makes the product realtime rather than poll-based once hardware
 * is pushing: the Master posts to the ingest function, the function writes to
 * Firestore, and every device watching that plot updates — including a phone
 * nowhere near the field. It stays silent until something is actually writing
 * there, so it costs nothing on the simulator.
 */
export function watchPlotReadings(
  plotId: string,
  onChange: (rows: Record<string, unknown>[]) => void,
  max = 60,
): Unsubscribe {
  if (!syncAvailable() || !plotId) return noop;
  try {
    return onSnapshot(
      // The path has to match what functions/index.js actually writes —
      // telemetry/{plotId}/readings/{timestamp-nodeId} — not a top-level
      // `readings` collection. Listening to the wrong path fails silently:
      // onSnapshot on an empty collection is a valid, permanently empty
      // subscription, which looks exactly like hardware that is not pushing.
      query(collection(db, 'telemetry', plotId, 'readings'), orderBy('at', 'desc'), fsLimit(max)),
      (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {},
    );
  } catch {
    return noop;
  }
}

/** Mirror the farmer's plot list, so a reinstall does not lose their fields. */
export async function pushPlots(phone: string | null, plots: unknown[]): Promise<boolean> {
  if (!phone || !syncAvailable()) return false;
  try {
    await setDoc(userDoc(phone), { plots, plotsAt: serverTimestamp() }, { merge: true });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ moderation */

/** A farmer flags a post. Moderators (accounts in `experts/`) review them. */
export async function reportPost(postId: string, reason: string): Promise<boolean> {
  if (!syncAvailable()) return false;
  const uid = await ensureSignedIn();
  if (!uid) return false;
  try {
    await addDoc(collection(db, 'reports'), { postId, reason, reporterUid: uid, at: Date.now() });
    return true;
  } catch {
    return false;
  }
}

/** Is this phone signed in as a moderator / agriculture expert? */
export async function amIExpert(): Promise<boolean> {
  if (!syncAvailable()) return false;
  const uid = await ensureSignedIn();
  if (!uid) return false;
  try {
    return (await getDoc(doc(db, 'experts', uid))).exists();
  } catch {
    return false;
  }
}

export async function hidePost(postId: string): Promise<boolean> {
  try {
    await updateDoc(doc(communityCol(), postId), { hidden: true });
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------- drone bookings */

const bookingsCol = () => collection(db, 'bookings');

/**
 * Ask for a drone. The farmer's phone number goes into a private sub-document
 * that only the farmer and the operator who accepts can read, so browsing open
 * jobs never hands out numbers.
 */
export async function createBooking(b: DroneBooking, phone: string | null): Promise<boolean> {
  if (!syncAvailable()) return false;
  const uid = await ensureSignedIn();
  if (!uid) return false;
  try {
    const { contactPhone: _c, ...pub } = { ...b, farmerUid: uid };
    await setDoc(doc(bookingsCol(), b.id), pub);
    if (phone) await setDoc(doc(bookingsCol(), b.id, 'private', 'contact'), { phone });
    return true;
  } catch {
    return false;
  }
}

function watchBookingsWhere(field: string, value: string, onChange: (rows: DroneBooking[]) => void): Unsubscribe {
  if (!syncAvailable() || !value) return noop;
  try {
    // No orderBy: a where + orderBy pair needs a composite index; sorting a
    // district's worth of jobs on the phone is free.
    return onSnapshot(
      query(bookingsCol(), where(field, '==', value), fsLimit(100)),
      (snap) =>
        onChange(
          snap.docs
            .map((d) => ({ ...(d.data() as DroneBooking), id: d.id }))
            .sort((a, b) => b.at - a.at),
        ),
      () => {},
    );
  } catch {
    return noop;
  }
}

export const watchDistrictBookings = (district: string, cb: (rows: DroneBooking[]) => void) =>
  watchBookingsWhere('district', district, cb);
export const watchMyBookings = (uid: string, cb: (rows: DroneBooking[]) => void) =>
  watchBookingsWhere('farmerUid', uid, cb);
export const watchMyJobs = (uid: string, cb: (rows: DroneBooking[]) => void) =>
  watchBookingsWhere('operatorUid', uid, cb);

export async function acceptBooking(id: string, operatorName: string, operatorPhone: string | null): Promise<boolean> {
  const uid = await ensureSignedIn();
  if (!uid) return false;
  try {
    await updateDoc(doc(bookingsCol(), id), {
      status: 'accepted',
      operatorUid: uid,
      operatorName,
      operatorPhone: operatorPhone ?? '',
    });
    return true;
  } catch {
    return false;
  }
}

export async function setBookingStatus(id: string, status: DroneBooking['status']): Promise<boolean> {
  try {
    await updateDoc(
      doc(bookingsCol(), id),
      status === 'open' ? { status, operatorUid: '', operatorName: '', operatorPhone: '' } : { status },
    );
    return true;
  } catch {
    return false;
  }
}

/** The farmer's number, for the operator who accepted (or the farmer). */
export async function bookingContact(id: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(bookingsCol(), id, 'private', 'contact'));
    return snap.exists() ? String(snap.data().phone ?? '') || null : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- your data (DPDP) */

/**
 * Erase everything this farmer has in the cloud: their account, alerts,
 * missions, feedback, community posts and drone bookings. Sensor readings are
 * stored by field id, not by person, and are not part of it.
 *
 * Returns false if anything could not be removed, so the screen can say so
 * instead of claiming a deletion that did not happen.
 */
export async function deleteMyCloudData(phone: string | null): Promise<boolean> {
  if (!syncAvailable()) return true;
  const uid = await ensureSignedIn();
  if (!uid) return false;
  let ok = true;
  const wipe = async (q: ReturnType<typeof query> | ReturnType<typeof collection>) => {
    try {
      const snap = await getDocs(q);
      for (const d of snap.docs) await deleteDoc(d.ref);
    } catch {
      ok = false;
    }
  };
  if (phone) {
    for (const sub of ['alerts', 'missions', 'feedback']) await wipe(userCol(phone, sub));
  }
  await wipe(query(communityCol(), where('authorUid', '==', uid)));
  try {
    const mine = await getDocs(query(bookingsCol(), where('farmerUid', '==', uid)));
    for (const d of mine.docs) {
      // The private contact document first; deleting a parent leaves its
      // sub-documents behind in Firestore.
      await deleteDoc(doc(d.ref, 'private', 'contact')).catch(() => undefined);
      await deleteDoc(d.ref);
    }
  } catch {
    ok = false;
  }
  if (phone) {
    try {
      await deleteDoc(userDoc(phone));
    } catch {
      ok = false;
    }
  }
  return ok;
}
