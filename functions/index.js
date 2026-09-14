/**
 * Drikr telemetry relay.
 *
 * Accepts readings and writes them to Firestore. Sits between the device and the
 * database rather than letting the device write directly, for four reasons:
 *
 *  1. No token refresh on the ESP32. Direct Firestore REST needs an Identity
 *     Toolkit sign-in and an hourly idToken refresh; that is a lot of state to
 *     keep correct on a microcontroller that reboots.
 *  2. No typed JSON. Firestore REST wants {"temp":{"doubleValue":29.4}}, which is
 *     verbose to build by hand in C++ and costs airtime and heap.
 *  3. Less TLS pressure. One short POST instead of a token exchange plus a write,
 *     on a chip already running an async web server.
 *  4. The schema can change without reflashing anything in a field.
 *
 * Two callers, one endpoint:
 *  - the Master directly, once it has a backhaul
 *  - a phone acting as courier, uploading what it collected on a walk-past
 *
 * Deploy:
 *   cd functions && npm install
 *   npx firebase deploy --only functions
 *
 * Set the shared secret first (never commit it):
 *   npx firebase functions:secrets:set DRIKR_INGEST_KEY
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const INGEST_KEY = defineSecret('DRIKR_INGEST_KEY');

/** Reject anything that is not a finite number in a plausible range. */
function num(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * Normalise one reading.
 *
 * Fields that fail validation are DROPPED, not defaulted to zero. A fabricated
 * zero would feed the risk engine as if it were a measurement, and on screen it
 * is indistinguishable from one. Absent has to stay absent all the way through.
 */
function normalise(raw) {
  const out = {};

  const temp = num(raw.temp, -60, 90);
  if (temp !== null) out.airTemp = temp;

  const hum = num(raw.hum, 0, 100);
  if (hum !== null) out.humidity = hum;

  const lux = num(raw.lux, 0, 200000);
  if (lux !== null) out.light = Math.round(lux);

  const gas = num(raw.gas, 0, 10000);
  if (gas !== null) out.gasKOhm = gas;

  // Raw probe volts. Calibration lives in the app, not here: a curve baked into
  // the relay could not be changed without a redeploy, and different nodes carry
  // different probes.
  ['a0', 'a1', 'a2', 'a3'].forEach((k) => {
    const v = num(raw[k], 0, 7);
    if (v !== null) out[k] = v;
  });

  const vbat = num(raw.vbat, 0, 6);
  // 0 V means no divider fitted, which is "unknown", not "flat".
  if (vbat !== null && vbat > 0.05) out.batteryVolts = vbat;

  const present = num(raw.present, 0, 255);
  if (present !== null) out.present = present;

  return out;
}

exports.ingest = onRequest(
  { secrets: [INGEST_KEY], cors: false, region: 'asia-south1', maxInstances: 5 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'POST only' });
      return;
    }

    // Shared secret. Not sophisticated, but it is what an ESP32 can hold without
    // a token refresh loop, and it never grants read access to anything.
    const key = req.get('x-drikr-key');
    if (!key || key !== INGEST_KEY.value()) {
      res.status(401).json({ ok: false, error: 'bad key' });
      return;
    }

    const body = req.body || {};
    const plotId = typeof body.plotId === 'string' ? body.plotId.slice(0, 64) : null;
    const readings = Array.isArray(body.readings) ? body.readings : null;

    if (!plotId || !readings) {
      res.status(400).json({ ok: false, error: 'plotId and readings[] required' });
      return;
    }
    if (readings.length > 500) {
      res.status(413).json({ ok: false, error: 'too many readings in one request' });
      return;
    }

    const batch = db.batch();
    let written = 0;
    let latest = null;

    for (const raw of readings) {
      const measuredAt = num(raw.measuredAt, 0, Date.now() + 86400000);
      if (measuredAt === null) continue;   // undateable reading is not evidence

      const fields = normalise(raw);
      if (Object.keys(fields).length === 0) continue;   // nothing survived validation

      const doc = {
        ...fields,
        plotId,
        nodeId: typeof raw.node === 'string' ? raw.node.slice(0, 32) : 'unknown',
        at: Math.round(measuredAt),
        // How the reading reached us, so provenance survives into the database.
        via: typeof body.via === 'string' ? body.via.slice(0, 16) : 'unknown',
        receivedAt: FieldValue.serverTimestamp(),
      };

      // Document id is the timestamp, so re-uploading the same reading
      // overwrites rather than duplicating. A courier that gets interrupted and
      // retries must not inflate the history.
      const id = `${doc.at}-${doc.nodeId}`;
      batch.set(db.collection('telemetry').doc(plotId).collection('readings').doc(id), doc);
      written += 1;

      if (!latest || doc.at > latest.at) latest = doc;
    }

    // One cheap document per plot for the app to watch with onSnapshot, so the
    // common case costs a single read rather than a query.
    if (latest) {
      batch.set(db.collection('telemetry').doc(plotId), {
        latest,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (written === 0) {
      res.status(400).json({ ok: false, error: 'no valid readings' });
      return;
    }

    await batch.commit();
    res.json({ ok: true, written, skipped: readings.length - written });
  }
);
