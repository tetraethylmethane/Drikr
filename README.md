# Drikr

Sensors in the soil, the reasoning on the farmer's phone, and a drone that treats the
affected patch instead of the whole field.

**Smart India Hackathon 2026** · Problem Statement **26180** · Hardware category ·
Team Drikr (H043)

---

## What it is

A field does not fail all at once. It starts in a corner — a low patch that holds
water, the windward edge insects reach first — and blanket spraying treats the other
nine-tenths for a problem they do not have. Drikr finds the corner: four nodes report
every five minutes, the phone interpolates the ground between them, and treatment
follows the patch.

```
Slave nodes  ──LoRa 433 MHz──▶  Master (ESP32)  ──WiFi──▶  Phone  ──▶  Firestore
BME280/680                      buffers 240               scoring,      history,
BH1750                          readings,                 health map,   sync
ADS1115 probes                  serves HTTP               alerts, drone
```

The Master has no SIM and no subscription, and needs neither: the farmer walks past
it. It buffers, the phone collects when it is in WiFi range, and uploads when it next
has signal. Neither half blocks the other.

Everything from scoring onward runs **on the phone** — interpolation, risk assessment,
alerting, mission planning. It works with no connectivity at all, which is the point.

### What it does

- **Five risks scored separately** — pest, irrigation, nutrient, climate, overall crop
  health. Each carries the readings it was built from.
- **A health map from four readings.** Inverse-distance interpolation gives every cell
  of the field a score, so a mission can target cells rather than boundaries.
- **Alerts that stay quiet when the evidence is thin**, with a threshold the farmer
  sets.
- **Photo diagnosis** that is allowed to say it cannot tell.
- **Drone missions** planned to individual cells, always proposed before they fly.
- **Georeferencing** — two GPS corners turn a field drawing into flyable waypoints.
- **Kisan Mitra**, a multilingual assistant grounded in live field state, with an
  on-device fallback for when there is no signal.
- **English, Hindi and Tamil** at full parity, with speech throughout.

---

## Running it

Node **≥ 22.13** (enforced in `package.json`; RN 0.86 needs it, and below 22.12 Node
cannot `require()` an ES module, which breaks several CLIs).

```bash
npm install
npm start           # Metro + QR
npm run typecheck   # tsc --noEmit — the main gate
npm run doctor      # expo-doctor
```

**No configuration is required.** With an empty `.env` the app runs end to end:
telemetry from the on-device simulator, weather from Open-Meteo, the assistant
answering locally. The simulator is deterministic, so a demo replays identically.

### Expo Go will not work

Voice input is a native module, and Expo Go only loads what it was built with. You need
a development build:

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile development
npm run dev
```

---

## Configuration

Everything is optional. Full list in [.env.example](.env.example).

| Variable | If unset |
|---|---|
| `API_BASE_URL` | Telemetry comes from the simulator, and the UI says so on every screen |
| `FIREBASE_*` | Sign-in stores the PIN on the device only; no history, no sync |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | The assistant answers on-device |
| `INGEST_URL`, `INGEST_KEY` | The phone writes readings to Firestore directly — see below |
| `DATA_GOV_API_KEY` | A working public key ships as the default |

`app.config.js` reads `.env` once at startup, so run `npx expo start -c` after editing
it.

### Two upload paths

`uploadQueued` picks its transport: the Cloud Function relay when `INGEST_URL` is
set, otherwise Firestore directly from the phone. Same collection, same document
shape, same `{at}-{nodeId}` id, so a retry overwrites instead of duplicating.

The relay exists so an ESP32 need not do Firestore auth — still true for a Master that
posts on its own, worth nothing on the courier path where the uploader is a phone that
already holds the SDK. Going direct keeps the product on Firebase's free tier;
Functions v2 requires Blaze.

### Security rules

Live rules are [firestore.rules](firestore.rules):

```bash
npx firebase-tools@15 deploy --only firestore:rules
```

Sign-in is phone + PIN, not Firebase Auth — phone auth needs billing, and a PIN works
with no signal. So the app signs in **anonymously** before touching Firestore, purely
so `request.auth` is non-null and rules can exist at all. The uid is claimed onto the
account at signup and re-claimed on each PIN-verified login, which is how the rules
prove ownership.

That proves *an app user*, not *which farmer* — closing it needs the PIN check inside
a Cloud Function. Said plainly in the rules file rather than glossed.

---

## Hardware

Firmware is a separate tree (`Master-Sensor`, `Slave-one-Sensor`, `Slave-two-Sensor` —
PlatformIO, C++).

```bash
cd Master-Sensor && pio run -t upload && pio device monitor
```

WiFi is not in code. On first boot the Master opens a setup portal at `Drikr_Setup`
(192.168.1.1) with a live network picker; credentials go to NVS. Hold BOOT for three
seconds at power-up to return there.

Then in the app: **Settings → Connect Sensors**.

Nodes sleep between readings and push every five minutes, so a reading a few minutes
old is normal. The UI shows data age rather than claiming "live".

> Firmware has **not** been compiled — PlatformIO was not installed on the machine it
> was written on. Run `pio run` before trusting it.

---

## Drones

Missions are planned as grid cells; georeferencing turns those into coordinates; a
`DroneLink` carries them to something that flies. Which link is real depends on the
aircraft, so the seam exists instead of an assumption.

| Aircraft | Link | Status |
|---|---|---|
| Dynalog DR-DG600C | `manual` | **Working.** 249 g camera drone, closed firmware — the app produces waypoints and the farmer enters them in the maker's app |
| turbodrone bridge | `lwPro` | **Working.** A laptop on the drone's own WiFi speaks the reverse-engineered protocol; the app uploads, starts and aborts over HTTP |
| ArduPilot / Pixhawk | `mavlink` | Not built. The fallback certain to work on an agricultural airframe |

**The 249 g drone cannot spray** — that is the whole aircraft, and there is no tank.
Spray missions are planned and costed correctly; flying one needs a proper
agricultural drone, usually rented.

**No link holds a control loop, deliberately.** Uploading waypoints to a flight
controller that already follows them is safe. Streaming stick commands from a phone to
keep an aircraft airborne is not.

---

## Architecture

| Layer | Where |
|---|---|
| Knowledge base | [agronomy.ts](src/config/agronomy.ts) — per-crop bands, stage thresholds, drone limits |
| Decision engine | [decisionEngine.ts](src/services/decisionEngine.ts) — pure functions, the core IP |
| Interpolation | [healthMap.ts](src/services/healthMap.ts) — IDW over sparse nodes |
| Alerting | [alertEngine.ts](src/services/alertEngine.ts) — confidence gate, cooldown, dedupe |
| Telemetry seam | [telemetry.ts](src/services/telemetry.ts) — one switch between simulator and hardware |
| Courier | [courier.ts](src/services/courier.ts) — phone carries readings from the Master |
| Cloud sync | [sync.ts](src/services/sync.ts) — the farmer's own writes, and live listeners |
| Photo diagnosis | [vision.ts](src/services/vision.ts) — a classifier that may abstain |
| Georeferencing | [geo.ts](src/services/geo.ts) — two anchors to a similarity transform |
| Drone transport | [droneLink.ts](src/services/droneLink.ts) — the aircraft seam |

### Three invariants

1. **Confidence is not score.** A high score on thin evidence — one node reporting, a
   stale reading, an uncalibrated probe — is suppressed rather than sent, and shown as
   suppressed. An app that cries wolf three times is ignored the fourth.
2. **Absent is never zero.** A metric the hardware cannot measure renders "No sensor".
   Hardware gaps are never backfilled from the simulator; mixed real and invented
   readings would be indistinguishable on screen.
3. **A model may decline.** Photo diagnosis returns no label for a blurred shot or a
   healthy leaf, and that renders "could not identify" — never "healthy". A classifier
   forced to always name something always will.

`CLAUDE.md` carries the fuller notes.

---

## Verification

No test framework, linter or formatter. The gates:

```bash
npx tsc --noEmit                                        # must be clean
npx expo export --platform android --output-dir .check  # catches imports tsc cannot
npx expo-doctor                                         # 21/21
```

en/hi/ta must carry identical key sets. Icons are generated, not hand-scaled — the
mark in `drikr-logo.png` is only 189 px, so anything cropped from it was a 5×
enlargement; `python assets/source/make-icons.py --check` redraws it exactly and
reports the fit.

---

## Documentation

| Document | Contents |
|---|---|
| [SENSOR_INTEGRATION_PLAN.md](SENSOR_INTEGRATION_PLAN.md) | Hardware plan, power budget, in-app setup flow |
| [HARDWARE_CONNECTIVITY_PLAN.md](HARDWARE_CONNECTIVITY_PLAN.md) | Connectivity options; cellular and LoRaWAN analysis |
| [firestore.rules](firestore.rules) | Live security rules |
| [functions/README.md](functions/README.md) | The optional relay, and its cost ceiling |
| [INSTALLATION.md](INSTALLATION.md) | Longer setup notes |
| [SPACE_AGRICULTURE_REFERENCE.md](SPACE_AGRICULTURE_REFERENCE.md) | Controlled-environment and off-world reference |

[FIRESTORE_SECURITY_RULES.md](FIRESTORE_SECURITY_RULES.md) is **superseded** — its
rules were written against a `request.auth` that was always null. Kept for the
reasoning, which mostly still holds.

---

## Stack

Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript strict · Redux Toolkit ·
hand-rolled SVG charts · i18next · Firestore (phone + PIN, anonymous auth for rules) ·
ESP32 + LoRa Ra-02 firmware in C++

## License

MIT
