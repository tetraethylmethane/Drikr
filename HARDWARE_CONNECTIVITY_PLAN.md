# Hardware Connectivity Plan

How sensor readings get from the field to the app, what is built, and what to build
next. Written for SIH 2026 PS 26180 (Team Drikr, H043).

Companion to [CLAUDE.md](CLAUDE.md), which covers the app architecture.

---

## 1. What exists today

```
Slave 1 ──┐
          ├── LoRa 433 MHz ──▶ Master (ESP32) ──HTTP──▶ App
Slave 2 ──┘                    polls 1/s          same LAN
```

| Piece | Detail |
|---|---|
| **Slaves** (×2) | ESP32 + Ra-02. BME280/BME680, BH1750, ADS1115 (A0–A3), 2 relay outputs |
| **Master** | ESP32 + Ra-02. Polls slaves alternately every 1 s, offline after 5 s |
| **Protocol** | Raw point-to-point LoRa. `lib/DrikrCommon/DrikrProtocol.h`, CSV payload via `packReading()` |
| **Transport** | Master runs a WiFi **station** (was AP-only), serves `/api/nodes`, `/api/status`, `/events`, `/set_out` |
| **App** | `src/services/hardware.ts` reads the Master; `src/services/telemetry.ts` switches source on `API_BASE_URL` |

Both slaves sit in **one field**. `A0–A3` are wired for a capacitive moisture probe
and a pH board but **no probes are attached yet**, so those channels ship
`fitted: false` in `src/config/calibration.ts` and render as "No sensor".

### Status

- [x] Master moved from AP-only to station mode, with AP fallback and mDNS (`drikr.local`)
- [x] `/api/status` so the app can verify it is talking to a real Drikr master
- [x] App reads live nodes; absent metrics stay absent rather than zero-filled
- [x] Relay control surfaced on the Sensor Nodes screen
- [ ] WiFi provisioning from the app (§4)
- [ ] Cloud upload (§5)
- [ ] Cellular Master (§6)

---

## 2. The core problem

**The Master needs internet, and every farm's WiFi is different.**

Two sub-problems that are easy to conflate:

1. **Reachability** — can the phone reach the Master? Solved for same-LAN use.
2. **Backhaul** — can the Master reach the cloud, so the app works from anywhere?

Originally the Master was an access point, which made #1 work but broke everything
else: joining `Drikr_Sensor` took the phone off the internet, so weather
(Open-Meteo), mandi prices (data.gov.in), account sync (Firestore) and cloud AI all
stopped. Station mode fixed that. What remains is #2, plus getting credentials into
the Master in the first place.

---

## 3. Options compared

| Path | Hardware cost | Firmware change | Works off-grid | Data rate |
|---|---|---|---|---|
| **Farm WiFi** (done) | ₹0 | done | no | 1/s |
| **Phone hotspot** | ₹0 | none — just set `STA_SSID` | no (needs phone) | 1/s |
| **T-Call Master** (ESP32+SIM800L) | ~₹1,200 | pin remap + TinyGSM | **yes** | 1/s local, throttled to cloud |
| **LoRaWAN gateway** | ₹12k–22k | full rewrite | yes (with 4G) | ~1 per 5–15 min |

### Recommendation

1. **Demo:** phone hotspot. Zero cost, works today.
2. **One real farm:** T-Call as the Master (§6).
3. **Many farms:** LoRaWAN gateway (§7) — only then does the economics work.

---

## 4. WiFi provisioning (next task)

### The chicken-and-egg

The app cannot send WiFi credentials over a network the Master is not on yet. The
only path is through the Master's own AP:

```
Master boots, no saved creds
  └─▶ starts AP "Drikr_Setup"
        └─▶ phone joins it
              └─▶ credentials sent
                    └─▶ Master saves to NVS, reboots into station mode
                          └─▶ phone rejoins home WiFi, app finds drikr.local
```

### Where it belongs in the app

**Not on login.** Login happens once, usually before the farmer has hardware.
Provisioning is device pairing and it recurs — router swap, password change, moving
fields. Correct placements:

- **Settings → "Connect sensors"** — the primary entry point
- **Fields screen** — prompt when no master is configured
- **Automatic prompt** when `API_BASE_URL` is set but the Master is unreachable

### Approaches

| | Approach | App work | Farmer experience |
|---|---|---|---|
| **A** | Firmware captive portal — the Master's AP serves its own setup page | none | Join `Drikr_Setup`, browser opens, type WiFi |
| **B** | App posts to `/provision` on the Master's AP | ~250 lines | Stays in the app, but switches WiFi manually |
| **C** | BLE provisioning | high (native module) | Best — phone never leaves its WiFi |

**Do A, then B.** A is pure firmware, works from any phone, and is the recovery path
that has to exist anyway. B then layers an in-app flow onto the same endpoint.

**C is rejected for now:** the BLE stack adds ~300–500 KB and `firmware.bin` is
already 844 KB of the default 1.25 MB app partition, so it would need a custom
partition table. ESP32 also shares one radio between WiFi and BLE, which would
contend with the 1 s poll loop and the async web server. It needs a native module
and another EAS build cycle for a nicer first-run flow only.

### Firmware work (≈150 lines)

1. **`Preferences` (NVS)** — persist ssid/password. Not present today; credentials
   are compile-time constants.
2. **Boot logic** — saved creds → station; none, or 2 failed joins → provisioning AP.
3. **`POST /provision`** `{ssid, password}` → save → reboot. Plus `POST /forget`.
4. **`DNSServer`** — wildcard DNS so the captive portal opens automatically. New
   `lib_dep`.
5. **Extend `/api/status`** with `provisioned`, `ssid`, `rssi`.

### Android gotchas (B and C)

- Android 10+ requires `WifiNetworkSpecifier` to join programmatically, and the
  **user still confirms** — "switch WiFi for me" is only ever semi-automatic.
- Android often kills routing to an AP with no internet. The Master must answer
  connectivity probes, or the app must bind its socket to that network.
- Needs a development build. This does not work in Expo Go.

### Security

The farmer's home WiFi password would cross the Master's open AP in plaintext.
Mitigations: WPA2-protect the setup AP with a password printed on the device, never
log credentials, store only in NVS, and drop them from app state once provisioned.

---

## 5. Cloud path: LoRa → cloud → app

Removes the "phone must be on the farm WiFi" constraint entirely.

```
Slaves ──LoRa──▶ Master ──HTTPS──▶ Firestore ──▶ App (anywhere)
```

### ⚠️ The write-volume trap

The Master polls **1×/second** = ~172,800 writes/day. Firestore's free tier is
**20,000/day** — that is exhausted in under 3 hours and then it costs money.

**Fix: aggregate at the edge.** Average locally, write once every 1–5 minutes. At 2
minutes that is 720 writes/day, comfortably free — and the averaging removes sensor
noise, so the data is better as well as cheaper. Keep the 1 s poll for the local
dashboard.

### Why Firestore

| Option | Verdict |
|---|---|
| **Firestore** | **Pick this.** Already wired and working in the app. `onSnapshot` gives real-time push with no polling and no new dependency |
| Firebase RTDB | Cheaper for high-frequency streams, but a second database to run |
| MQTT (HiveMQ) / own API | Most control, but new infra plus a new app dependency. Overkill now |

### Firmware work (≈250 lines)

1. Rolling average per node, flushed on a timer.
2. Sign in as a **dedicated device account** (email/password) through the Identity
   Toolkit REST API → `idToken`, refreshed hourly.
3. `POST` to Firestore REST: `telemetry/{plotId}/readings/{ts}`, and overwrite a
   `latest` document for cheap reads.
4. Buffer to NVS/SPIFFS when the internet drops; flush on reconnect. Training and
   telemetry data must not be silently lost.

### App work (≈120 lines)

`src/services/cloudTelemetry.ts` plus a third telemetry source
(`cloud` | `hardware` | `simulated`). The seam in `telemetry.ts` already exists, so
no screen changes.

Keep local HTTP mode as well — cloud for remote monitoring, direct LAN when standing
in the field with no internet. Both feed the same seam, so it is nearly free.

### Firestore rules

The device account writes telemetry; farmers read only. The app must never be able to
write readings.

---

## 6. Cellular Master: TTGO T-Call V1.4

ESP32 + SIM800L on one board, with the power design already done. This is the
existing Master with cellular — **not** a gateway. Slaves and `DrikrProtocol.h` stay
untouched.

Buy: [Robu.in — LILYGO T-Call V1.4](https://robu.in/product/ttgo-t-call-v1-4-esp32-wireless-module-sim-antenna-sim-card-sim800l-module-unsoldered/)

### ⚠️ GPIO conflicts — must fix

T-Call's SIM800L occupies **GPIO 4, 5, 23, 26, 27** (PWRKEY, RST, POWER, TX, RX).

| Current firmware | Conflict | Fix |
|---|---|---|
| `LORA_PIN_SS 5` | SIM800L **RST** | remap, e.g. GPIO 32 |
| SPI MOSI (default 23) | SIM800L **POWER** | explicit `SPI.begin(18, 19, 33, 32)` |
| `LORA_PIN_DIO0 2` | none | keep |
| `LORA_PIN_RST 14` | none | keep |

### Work

- Re-solder the Ra-02 to the T-Call (the Master board is replaced; slaves are not)
- Pin remap in `DrikrProtocol.h` (~10 lines)
- Swap `WiFiClient` → `TinyGSM` + `TinyGsmClientSecure`
- Then §5 cloud upload

### Notes

- **Power is what kills SIM800L builds:** ~2 A transmit peaks. An ESP32's 3.3 V
  regulator cannot supply that, which causes random reboots and failed registration.
  The T-Call board handles this; a bare SIM800L module needs a separate 4 V supply
  and a 1000 µF+ capacitor.
- **SIM800L is 2G only.** Confirm 2G coverage in your area, or use a 4G module
  (SIM7600, ~₹2,500) where 2G has been shut down.

---

## 7. LoRaWAN: the scale path

Only worth it across **many farms**. Documented here because it is the right
long-term architecture and a strong pitch slide.

```
Slaves ──LoRaWAN──▶ Gateway ──4G──▶ TTN ──webhook──▶ Firestore ──▶ App
                    (shared)        (free network server)
```

There is **no Master**. Nodes broadcast on their own schedule; any gateway in range
hears them and a network server decrypts and forwards.

### Why our Ra-02 cannot be a gateway

A gateway needs an **8-channel concentrator** (SX1301/1302/1308) to demodulate all
channels and spreading factors at once, on a Linux host running a packet forwarder.
The Ra-02 is an SX1278 single-channel transceiver. Single-channel packet forwarders
exist but are deprecated, break OTAA joins, and are not properly supported on TTN v3.

### Build vs buy

| | Parts | Cost |
|---|---|---|
| **DIY** | Raspberry Pi (Zero 2W is enough) + SX1302 concentrator + 865 MHz antenna + 4G HAT | ~₹12–18k |
| **Commercial** | RAK7268CV2 (LTE variant) | ~₹22–25k |

- [RAK2287 concentrator — Fab.to.Lab, India](https://www.fabtolab.com/rakwireless-rak2287-gateway-concentrator-module-lorawan-sx1302-lora-core-spi-usb-gps) — **select IN865**
- [Waveshare SX1302 HAT](https://www.waveshare.com/sx1302-868m-lorawan-gateway-b.htm)
- [RAK7268V2 commercial gateway](https://store.rakwireless.com/products/rak7268-8-channel-indoor-lorawan-gateway)

India uses the **IN865** band. Order the right variant; the band is fixed at purchase.

### What migrating costs us

- **Rewrite all three firmwares.** LoRaWAN is a different stack (RadioLib/LMIC),
  with OTAA keys per node and packed binary payloads. `DrikrProtocol.h`,
  `packReading()` and the Master polling loop are all replaced.
- **Reflash hard-soldered slaves.**
- **~1 uplink per 5–15 min** instead of 1/s, from the ~1% duty cycle. The live
  dashboard becomes a periodic feed.
- **Payload ≤ ~51 bytes**, so the CSV format must become packed binary.
- The gateway **still needs internet** — WiFi or 4G.

### When the economics flip

| | Cost | Nodes served |
|---|---|---|
| T-Call Master + SIM | ~₹1,200 | 2 slaves, one field |
| Pi + concentrator + 4G | ~₹15,000 | dozens of nodes, several km, many farms |

One gateway covering a village means each farmer buys only ~₹2k of battery-powered
nodes, and there is one SIM for the whole cluster instead of one per farm. That is
the scale story worth pitching — build the T-Call version for the demo.

---

## 8. Field mapping: what the hardware can and cannot measure

Honesty here is a design constraint, not a nicety. The firmware already sends a
`present` bitmask so an absent sensor reports nothing rather than a stale value, and
the app mirrors that.

| App metric | Source | State |
|---|---|---|
| `airTemp`, `humidity` | BME280/BME680 | ✅ direct |
| `light` | BH1750 | ✅ direct |
| `voc` | BME680 gas resistance | ⚠️ converted to a **relative** index, not calibrated ppb |
| `soilMoisture`, `ph`, `ec`, `nitrogen` | ADS1115 A0–A3 | ⚠️ raw volts; probes not yet attached |
| `soilTemp`, `leafWetness`, `rainfall`, `windSpeed` | — | ❌ no sensor |
| `pestActivity` | derived (VOC + temp + humidity) | engine-computed, not measured |
| `biosensorNa` | — | ❌ not built |

Rules that must hold:

- Absent metrics stay **absent**, never zero. `readMetricOrNull` / `hasMetric` in
  `src/config/metrics.ts` make this explicit; `metricStatus` renders "No sensor".
- **Never backfill hardware gaps from the simulator.** Mixed real and simulated
  readings are indistinguishable on screen, which is worse than showing nothing.
- A configured but unreachable gateway reports **no readings**, not simulated ones.
- `UNKNOWN_METRIC` (-1) covers fields the protocol does not carry at all — battery,
  RSSI, calibration age. Guard every comparison with `isKnown()`.

### Calibrating A0–A3

`src/config/calibration.ts` holds a declarative two-point curve per channel. To bring
a probe online: set `fitted: true`, choose the metric, and record two reference
readings. Nothing else in the app changes.

For a capacitive moisture probe the two points are air and water — note that **dry is
the higher voltage**, so the slope is negative. Verified behaviour with the default
curve (dry 2.8 V, wet 1.2 V): 2.05 V → 46.9 %, 2.8 V → 0 %, 1.2 V → 100 %, and
out-of-range values clamp.

---

## 9. Roadmap

| Phase | Work | Cost |
|---|---|---|
| **Now** | Phone hotspot → set `STA_SSID`. Demo-ready today | ₹0 |
| **Next** | §4 provisioning A (captive portal), then B (in-app) | ₹0 |
| **Then** | Attach and calibrate moisture + pH probes on A0–A3 | ~₹800 |
| **Then** | §5 Firestore upload with 2-minute aggregation | ₹0 |
| **Deployment** | §6 T-Call Master + data SIM | ~₹1,200 |
| **Scale** | §7 LoRaWAN gateway, once several farms are live | ~₹15,000 |

---

## 10. Verification notes

What has and has not been tested, so nobody inherits a false assumption:

- **Verified:** the app's mapping and calibration against a mock master serving the
  firmware's exact `nodeToJson()` shape. Only measured fields map through; soil
  channels stay absent; the two-point curve interpolates and clamps.
- **Not verified:** anything against real hardware. No master has been on this
  network.
- **Not compiled:** the firmware. PlatformIO is not installed on the dev machine, so
  the station-mode changes in `Master-Sensor/src/main.cpp` have only been
  brace-checked. Run `pio run` before trusting them.
- Before flashing, set `STA_SSID` / `STA_PASSWORD` near the top of
  `Master-Sensor/src/main.cpp`.
