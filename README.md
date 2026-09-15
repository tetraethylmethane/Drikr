# Drikr

AI-powered smart farming assistant for real-time crop health, pest, nutrient,
irrigation and climate-risk detection.

**Smart India Hackathon 2026** · Problem Statement **26180** · Hardware category ·
Team **Drikr** (H043). `Team Drikr SIH.pdf` is the authoritative spec; the two phone
mockups on its Technical Approach slide define the Home and Field Health Map screens.

---

## What it is

A field-sensor network feeding an on-device decision engine, which turns readings
into actions a farmer can take — including targeted drone spraying.

```
Slave nodes ──LoRa 433MHz──▶ Master (ESP32) ──WiFi──▶ App ──▶ Cloud Function
  BME280/680                 buffers 240               risk scoring,      Firestore
  BH1750                     readings,                 health map,
  ADS1115 probes             serves HTTP               alerts, drone
```

The Master has no SIM and no subscription, and does not need one: the farmer walks
past it. It buffers readings, the phone collects them whenever it is in WiFi range,
and uploads whenever it next has signal. Nothing is lost if either half is missing —
see [src/services/courier.ts](src/services/courier.ts).

The app owns everything from scoring onward: interpolation, risk assessment,
alerting, recommendations and drone mission planning all run **on the phone**, so it
works with no connectivity at all.

### Features

- **Live sensor grid** — air temperature, humidity, light, VOC, plus soil probes
- **Field Health Map** — inverse-distance interpolation turns a handful of nodes into
  a per-area crop-health picture, so treatment can be targeted rather than blanket
- **Five risk domains** — crop health, pest, nutrient, irrigation, climate. Each
  carries its evidence and a confidence score
- **Alerts** with a user-tunable confidence threshold, cooldown and dedupe
- **Photo diagnosis** — a real multimodal classifier for disease and pest, which is
  allowed to say it cannot tell, is gated on the same confidence threshold as any
  alert, and never overrides the sensors
- **Drone missions** — spray and inspection plans, targeted at the cells that
  triggered them, always requiring farmer confirmation
- **Field georeferencing** — two GPS corners turn the field drawing into real
  coordinates, so missions become flyable waypoints
- **Kisan Mitra** — multilingual assistant that answers from live field data, and
  works offline from the on-device engine
- **Weather** from Open-Meteo, **mandi prices** from data.gov.in
- **English, Hindi, Tamil** — full parity, with text-to-speech throughout

---

## Quick start

```bash
npm install
npm start                 # Metro + QR code
npm run dev               # Metro for a development build (--dev-client)
npm run typecheck         # tsc --noEmit - the main verification gate
npm run doctor            # expo-doctor
```

No configuration is required. With an empty `.env` the app runs fully: telemetry from
the on-device simulator, weather from Open-Meteo (no key needed), and the assistant
answering on-device.

### Expo Go will not work

The project is Expo SDK 57 and needs a **development build**, because voice input is a
native module. Expo Go only ever supports the current SDK and cannot load native
modules it was not built with.

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile development
npm run dev
```

Install the resulting APK, then scan the QR from inside the Drikr app.

---

## Configuration

All optional. See [.env.example](.env.example) for the full list.

| Variable | Effect if unset |
|---|---|
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | Assistant answers on-device instead of via a cloud model |
| `DATA_GOV_API_KEY`, `DATA_GOV_RESOURCE_ID` | A working public key ships as the default |
| `API_BASE_URL` | Telemetry comes from the simulator instead of real hardware |
| `INGEST_URL`, `INGEST_KEY` | Readings are collected and queued on the phone but never uploaded — safe, just not synced |
| `FIREBASE_*` | Sign-in stores the PIN on the device only, no cross-device sync |

Run `npx expo start -c` after editing `.env` — `app.config.js` only reads it at
startup.

---

## Hardware

Firmware lives in a separate tree at `D:/Drikr/Sensor` (three PlatformIO projects:
`Master-Sensor`, `Slave-one-Sensor`, `Slave-two-Sensor`).

```bash
pip install platformio
cd Master-Sensor && pio run -t upload && pio device monitor
```

WiFi is **not** configured in code. On first boot the Master starts a setup portal on
`Drikr_Setup` (192.168.1.1) with a live network picker; credentials are saved to NVS.
Holding the BOOT button for 3 seconds at power-up returns it to setup mode.

Then in the app: **Settings → Connect Sensors**.

Slave nodes sleep between readings and push every 5 minutes, so a reading a few
minutes old is normal — the UI shows data age rather than claiming "live".

---

## Drones

Missions are planned as grid cells, georeferencing turns those into coordinates, and
a `DroneLink` carries them to something that flies
([src/services/droneLink.ts](src/services/droneLink.ts)). Which link is real depends
on the aircraft, so the seam exists rather than an assumption:

| Aircraft | Link | Status |
|---|---|---|
| Dynalog DR-DG600C | `manual` | Working. 249 g consumer camera drone, closed firmware — the app produces waypoints and the farmer enters them in the maker's own app |
| DR-DG600C over WiFi | `besta` | Unproven. Depends on reverse-engineering its UDP protocol |
| ArduPilot / Pixhawk | `mavlink` | Not built. The fallback that is certain to work |

Two things this means in practice, stated plainly because they affect what the app can
claim:

- **The DR-DG600C cannot spray.** 249 g is the whole aircraft; there is no tank and no
  payload capacity. Spray missions are planned and costed but need a different drone.
- **It cannot be commanded by the app.** Closed firmware and a proprietary app. The
  manual link is not a placeholder — for a *rented* drone, which is how most Indian
  smallholders get one, it may be the only link that ever applies. The sensors still
  decide where to look, which is the part a drone app cannot do.

No link holds a control loop, deliberately. Uploading waypoints to a flight controller
that already knows how to follow them is safe; streaming stick commands from a phone to
keep an aircraft airborne is not.

Autonomous agricultural spraying in India needs a licensed remote pilot and a
registered UIN, so propose-then-confirm is the legally correct shape as well as the
right default.

---

## Architecture

| Layer | Where |
|---|---|
| Knowledge base | [src/config/agronomy.ts](src/config/agronomy.ts) — per-crop bands, stage thresholds, drone limits |
| Decision engine | [src/services/decisionEngine.ts](src/services/decisionEngine.ts) — pure functions, the core IP |
| Interpolation | [src/services/healthMap.ts](src/services/healthMap.ts) — IDW over sparse nodes |
| Alerting | [src/services/alertEngine.ts](src/services/alertEngine.ts) — confidence gate, cooldown, dedupe |
| Telemetry seam | [src/services/telemetry.ts](src/services/telemetry.ts) — one switch between simulator and hardware |
| Hardware client | [src/services/hardware.ts](src/services/hardware.ts) |
| Courier | [src/services/courier.ts](src/services/courier.ts) — phone carries readings from Master to cloud |
| Photo diagnosis | [src/services/vision.ts](src/services/vision.ts) — multimodal classifier that may abstain |
| Georeferencing | [src/services/geo.ts](src/services/geo.ts) — two anchors to a similarity transform |
| Drone transport | [src/services/droneLink.ts](src/services/droneLink.ts) — the aircraft seam |

Two invariants worth protecting:

1. **Confidence is not score.** A high risk score backed by thin evidence — one node
   reporting, a stale reading, an uncalibrated sensor — is deliberately suppressed
   rather than alerted. The threshold is user-tunable.
2. **Absent is never zero.** A metric the hardware does not measure renders as
   "No sensor", and hardware gaps are never backfilled from the simulator. Mixed real
   and invented readings would be indistinguishable on screen.
3. **A model may decline.** Photo diagnosis returns no label for a blurred shot or a
   leaf with no symptom, and that renders as "could not identify" — never as
   "healthy". A classifier that must always name something always will.

`CLAUDE.md` carries the fuller architecture notes.

---

## Documentation

| Document | Contents |
|---|---|
| [SENSOR_INTEGRATION_PLAN.md](SENSOR_INTEGRATION_PLAN.md) | The agreed hardware plan, power budget and in-app setup flow |
| [HARDWARE_CONNECTIVITY_PLAN.md](HARDWARE_CONNECTIVITY_PLAN.md) | Connectivity options, cellular and LoRaWAN analysis |
| [SPACE_AGRICULTURE_REFERENCE.md](SPACE_AGRICULTURE_REFERENCE.md) | Forward reference for controlled-environment and off-world use |
| [FIRESTORE_SECURITY_RULES.md](FIRESTORE_SECURITY_RULES.md) | Rules to apply in the Firebase console |
| [INSTALLATION.md](INSTALLATION.md) | Longer setup notes |
| [functions/README.md](functions/README.md) | Deploying the telemetry relay, and its cost ceiling |

---

## Verification

There is no test framework, linter or formatter. The gates are:

```bash
npx tsc --noEmit                                       # must be clean
npx expo export --platform android --output-dir /tmp/d  # catches import errors tsc cannot
npx expo-doctor
```

Locale parity matters and is checkable — en/hi/ta must carry identical key sets:

```bash
python - <<'EOF'
import json, io
def flat(o, p=''):
    for k, v in o.items():
        if isinstance(v, dict): yield from flat(v, p + k + '.')
        else: yield p + k
ks = {l: set(flat(json.load(io.open(f'src/i18n/locales/{l}.json', encoding='utf-8')))) for l in ('en','hi','ta')}
print('in sync:', ks['en'] == ks['hi'] == ks['ta'])
print('missing:', {l: sorted(ks['en'] - ks[l]) for l in ('hi','ta')})
EOF
```

Branding assets are generated, not hand-scaled — the mark in `drikr-logo.png` is only
189 px, so every icon cropped from it used to be a 5x enlargement. It is four arcs and
four rounded corners, so it is redrawn exactly instead:

```bash
python assets/source/make-icons.py --check   # reports fit against the logo (IoU 0.981)
python assets/source/make-icons.py           # regenerates icon/adaptive/splash/favicon
```

Firmware has **not** been compiled — PlatformIO was not installed on the machine it
was written on. Run `pio run` before trusting it.

---

## Stack

Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript strict · Redux Toolkit ·
hand-rolled SVG charts on react-native-svg · i18next · Firebase Firestore
(phone + PIN auth, not Firebase Auth) · ESP32 + LoRa Ra-02 firmware in C++

## License

MIT
