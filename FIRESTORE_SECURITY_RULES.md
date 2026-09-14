# Firestore Security Rules

Rules to apply in the Firebase console. **Test mode expires roughly 30 days after the
database is created**, after which every read and write starts failing — so these need
publishing before that happens, not after.

## How to apply

1. [Firebase Console](https://console.firebase.google.com) → your project
   (currently `drikr-369ce`)
2. **Firestore Database → Rules**
3. Replace everything with the block below
4. **Publish**

---

## The rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ---------------------------------------------------------------- helpers
    // A PIN is 4-6 digits and is only ever stored as a SHA-256 hash, which is
    // always 64 hex characters. Checking the shape here stops a malformed or
    // plaintext value being written by anything other than our client.
    function isPinHash(value) {
      return value is string && value.size() == 64;
    }

    function isE164(id) {
      return id.matches('^\\\\+[1-9][0-9]{7,14}$');
    }

    // ---------------------------------------------------------------- users
    // Document ID is the E.164 phone number, e.g. +919876543210.
    match /users/{phoneNumber} {

      // Read is open, and that is a deliberate, bounded decision.
      //
      // Sign-in has to answer "does an account exist for this number?" before
      // anyone is authenticated - that is the whole first step of the flow, and
      // Firebase Auth is not in use because phone auth requires billing.
      //
      // What this exposes is a PIN *hash*, not a PIN. A 4-6 digit PIN hashed
      // with plain SHA-256 is brute-forceable offline by anyone who reads it,
      // so this is genuinely a weakness, not a non-issue. It is acceptable only
      // because the PIN gates app access and nothing else: no payment, no
      // irreversible action, no personal data beyond a phone number.
      //
      // To close it properly, move the existence check behind a Cloud Function
      // that returns a boolean and never the document. Do that before this app
      // holds anything worth stealing.
      allow read: if true;

      // Create: the document must be self-consistent and carry a real hash.
      allow create: if isE164(phoneNumber)
                    && request.resource.data.phoneNumber == phoneNumber
                    && request.resource.data.keys().hasAll(['phoneNumber', 'pinHash', 'sessionToken'])
                    && isPinHash(request.resource.data.pinHash);

      // Update: the PIN hash and the phone number are immutable.
      //
      // Without the pinHash guard, anyone able to write could overwrite the hash
      // with one of their own and take the account - which is exactly the attack
      // the open read above would otherwise set up.
      //
      // A deliberate PIN change must therefore go through a Cloud Function that
      // verifies the old PIN first. It is not possible from the client, and that
      // is the intent.
      allow update: if request.resource.data.phoneNumber == resource.data.phoneNumber
                    && request.resource.data.pinHash == resource.data.pinHash;

      // Accounts are never deleted from the client.
      allow delete: if false;
    }

    // ---------------------------------------------------------------- telemetry
    // Written by the sensor Master (or the Cloud Function relay) as a dedicated
    // device account; read by farmers. The app must never be able to write a
    // reading - fabricated telemetry would feed straight into the risk engine
    // and be indistinguishable from a measurement.
    match /telemetry/{plotId} {
      allow read: if request.auth != null;
      allow write: if false;

      match /readings/{readingId} {
        allow read: if request.auth != null;

        // Only the device account may write, and only well-formed readings.
        allow create: if request.auth != null
                      && request.auth.token.get('role', '') == 'device'
                      && request.resource.data.keys().hasAll(['at', 'plotId'])
                      && request.resource.data.at is int;

        // Telemetry is append-only. A reading that could be edited after the
        // fact is not evidence of anything.
        allow update, delete: if false;
      }

      match /latest {
        allow read: if request.auth != null;
        allow write: if request.auth != null
                     && request.auth.token.get('role', '') == 'device';
      }
    }

    // ---------------------------------------------------------------- feedback
    // Farmer confirmations on alerts, and scouting observations. This is the
    // training signal for the model-improvement loop, so it is append-only:
    // ground truth that can be rewritten later is worthless.
    match /feedback/{docId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }

    // ---------------------------------------------------------------- default
    // Anything not named above is denied. New collections must be added here
    // deliberately rather than inheriting access by accident.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## Document shapes

### `users/{+E164}`

```javascript
{
  phoneNumber: "+919876543210",
  pinHash:     "<64 hex chars>",   // SHA-256, hashed on the device
  sessionToken: "<opaque>",
  language:    "en" | "hi" | "ta",
  createdAt:   "2026-09-14T00:00:00.000Z",
  updatedAt:   "2026-09-14T00:00:00.000Z",
  lastLoginAt: "2026-09-14T00:00:00.000Z"
}
```

The plaintext PIN never leaves the device. It is hashed in
[src/config/firebase.ts](src/config/firebase.ts) before any write.

### `telemetry/{plotId}/latest`

One document per plot, overwritten each upload — cheap to read with `onSnapshot`.
Historical rows go to `telemetry/{plotId}/readings/{timestamp}`.

⚠️ **Aggregate before writing.** A 1 Hz sensor poll would be ~172,800 writes/day
against a 20,000/day free tier. Averaging on the Master and writing once every 2
minutes is 720/day, and the averaging removes sensor noise, so the data is better as
well as cheaper.

---

## Known gaps

| Gap | Fix |
|---|---|
| `users` read is open, exposing PIN hashes | Move the existence check behind a Cloud Function returning a boolean |
| SHA-256 on a 4-6 digit PIN is brute-forceable | Use a slow KDF, or move verification server-side entirely |
| Telemetry rules assume a `role: device` custom claim | Set it on the device account with the Admin SDK; until then telemetry writes are denied, which is the safe default |

None of these block the demo. All of them matter before the app holds anything worth
stealing.
