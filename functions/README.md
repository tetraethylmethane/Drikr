# Telemetry relay

Cloud Function that accepts sensor readings and writes them to Firestore.

## Why a relay instead of writing to Firestore directly

Direct Firestore REST from an ESP32 means an Identity Toolkit sign-in, an hourly
`idToken` refresh, and building typed JSON like `{"temp":{"doubleValue":29.4}}` by
hand in C++. That is a lot of fragile state on a chip that reboots, plus airtime and
heap on a device already running an async web server.

A relay collapses all of that to one short POST with a shared header, and lets the
schema change without reflashing anything in a field.

## Deploy

```bash
cd functions
npm install

# Shared secret. Never commit this.
npx firebase functions:secrets:set DRIKR_INGEST_KEY

npx firebase deploy --only functions
```

The deploy prints the function URL. Region is `asia-south1`.

## Use

```
POST https://asia-south1-<project>.cloudfunctions.net/ingest
x-drikr-key: <DRIKR_INGEST_KEY>
Content-Type: application/json

{
  "plotId": "plot-a3",
  "via": "courier",              // or "master"
  "readings": [
    { "node": "S1", "measuredAt": 1789000000000,
      "temp": 29.4, "hum": 71.2, "lux": 41230, "gas": 12.5,
      "a0": 2.05, "a1": 2.48, "vbat": 3.87, "present": 15 }
  ]
}
```

Reply: `{ "ok": true, "written": 1, "skipped": 0 }`

## Behaviour worth knowing

**Invalid fields are dropped, not defaulted.** A field failing range validation is
omitted from the document rather than written as `0`. A fabricated zero would reach
the risk engine looking exactly like a measurement — absent has to stay absent all
the way through the stack.

**Writes are idempotent.** The document id is `{timestamp}-{nodeId}`, so a courier
that gets interrupted and retries overwrites rather than duplicating. History cannot
be inflated by a flaky walk-past.

**Calibration is not applied here.** `a0`–`a3` are stored as raw volts. The curve
lives in the app, because different nodes carry different probes and a curve baked
into the relay could not be changed without a redeploy.

**Provenance is recorded.** Every document carries `via` (`master` or `courier`) and a
server `receivedAt` alongside the device's `at`, so the gap between measurement and
arrival stays visible.

## Cost

⚠️ **Aggregate before uploading.** A 1 Hz sensor poll would be ~172,800 Firestore
writes/day against a 20,000/day free tier — exhausted in under three hours. The
Master averages and pushes every 5 minutes, which is ~576 writes/day for two nodes,
comfortably inside the free tier. Averaging also removes sensor noise, so the data is
better as well as cheaper.

Cloud Functions free tier is 2M invocations/month; a courier uploading in batches uses
a handful per day.

## Security

The shared key is write-only: it grants no read access to anything. Rules deny all
client writes to `telemetry`, so the relay's Admin SDK context is the only path in —
see [../FIRESTORE_SECURITY_RULES.md](../FIRESTORE_SECURITY_RULES.md).

Not yet done: rate limiting per key. A leaked key could run up writes. Acceptable for
a demo, not for deployment.
