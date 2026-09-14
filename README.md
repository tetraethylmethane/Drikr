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
Slave nodes ──LoRa 433MHz──▶ Master (ESP32) ──WiFi──▶ App
  BME280/680                 polls, ACKs,              risk scoring,
  BH1750                     serves HTTP               health map,
  ADS1115 probes                                       alerts, drone
```

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
- **Drone missions** — precision spray plans requiring farmer confirmation
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

## Architecture

| Layer | Where |
|---|---|
| Knowledge base | [src/config/agronomy.ts](src/config/agronomy.ts) — per-crop bands, stage thresholds, drone limits |
| Decision engine | [src/services/decisionEngine.ts](src/services/decisionEngine.ts) — pure functions, the core IP |
| Interpolation | [src/services/healthMap.ts](src/services/healthMap.ts) — IDW over sparse nodes |
| Alerting | [src/services/alertEngine.ts](src/services/alertEngine.ts) — confidence gate, cooldown, dedupe |
| Telemetry seam | [src/services/telemetry.ts](src/services/telemetry.ts) — one switch between simulator and hardware |
| Hardware client | [src/services/hardware.ts](src/services/hardware.ts) |

Two invariants worth protecting:

1. **Confidence is not score.** A high risk score backed by thin evidence — one node
   reporting, a stale reading, an uncalibrated sensor — is deliberately suppressed
   rather than alerted. The threshold is user-tunable.
2. **Absent is never zero.** A metric the hardware does not measure renders as
   "No sensor", and hardware gaps are never backfilled from the simulator. Mixed real
   and invented readings would be indistinguishable on screen.

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

---

## Verification

There is no test framework, linter or formatter. The gates are:

```bash
npx tsc --noEmit                                       # must be clean
npx expo export --platform android --output-dir /tmp/d  # catches import errors tsc cannot
npx expo-doctor
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
