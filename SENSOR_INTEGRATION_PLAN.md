# Sensor Integration — Final Plan

The agreed plan for getting real field data into the app: firmware changes, power
work, cloud path, and the in-app setup flow.

Supersedes the options analysis in
[HARDWARE_CONNECTIVITY_PLAN.md](HARDWARE_CONNECTIVITY_PLAN.md) — that document keeps
the reasoning and the rejected alternatives; this one is what we are building.

---

## 0. Confirmed inputs

| | |
|---|---|
| **Slave boards** | ESP32 dev boards (for now — see §3.1, this matters a lot) |
| **Battery** | Li-ion 18650-class, 5000 mAh, 3.7 V nominal, one cell per slave |
| **Both slaves** | Same field, one plot |
| **Backhaul** | Farm/hotspot WiFi via STA mode. Phone-courier and cellular are later options (§6) |
| **Analog probes** | Not yet purchased — A0–A3 stay `fitted: false` |

---

## 1. What is already done

- Master runs in **station mode** with AP fallback, mDNS (`drikr.local`), `/api/status`
- App reads live nodes through `src/services/hardware.ts`
- `telemetry.ts` switches source on `API_BASE_URL` — no screen knows the difference
- Absent metrics render **"No sensor"**, never `0`
- Relay control surfaced on the Sensor Nodes screen
- Verified against a mock master; **not** verified against real hardware

---

## 2. Firmware: one breaking protocol change

All three projects change together. `DrikrProtocol.h` must stay byte-identical across
them — the header already warns about this. Batching these into a single edit avoids
breaking the protocol twice.

### 2.1 Invert to slave-push

Today the Master polls every 1 s and slaves busy-listen in continuous RX. **Polling
less often saves nothing** — the drain is the always-on radio and awake CPU, not the
poll rate.

```
Slave:  RTC wake → sample → TX reading → [listen only if told] → deep sleep
Master: listens continuously; queues commands for the next wake
```

- `MODE_SENSOR_REPORT` becomes slave-initiated
- Master's poll loop is deleted
- Default interval **5 min**, settable by the Master (§2.3)

### 2.2 Binary payload

CSV (~68 bytes) → packed binary (~20 bytes).

```
uint8  present
uint8  flags        (out1, out2, ack-requested)
int16  temp         ×100  °C
uint16 humidity     ×100  %
uint16 pressure     ×10   hPa
uint16 gas          ×100  kΩ
uint16 lux          (scaled)
uint16 ain[4]       mV
uint16 vbat         mV      ← new, see §3.3
```

Use `__attribute__((packed))` and fix endianness explicitly. Keep `packReading()` /
`unpackReading()` as the only conversion points.

**Not a power win** (~0.6 mAh/day). Worth doing for LoRaWAN's 51-byte cap, half the
airtime, and less collision risk — and it is free to include in this same edit.

### 2.3 ACK does three jobs

The slave already needs an ACK to receive queued relay commands. Overload it:

```
Master → Slave:  [ok] [queued command | none] [next slot in N ms] [listen: yes/no]
```

1. **Delivers relay commands** — preserves `/set_out`
2. **Corrects clock drift** — ESP32's deep-sleep RTC uses an internal RC oscillator
   and drifts 1–3% (±3–9 s per 5 min, minutes per day). The Master becomes the clock
   authority and the slave sleeps exactly `N` ms.
3. **Skips the listen window** — "nothing queued, sleep now" saves ~22 mA·s, which is
   the second-largest cost per cycle

### 2.4 Staggered slots

```
Slave 1: 0:00, 5:00, 10:00 …
Slave 2: 2:30, 7:30, 12:30 …    (half-interval offset)
```

Plus ±5 s random jitter so any residual collision does not repeat every cycle.

### 2.5 Slave power fixes

| Fix | Why |
|---|---|
| Cache I2C addresses in `RTC_DATA_ATTR` | Currently rescans 0x76/0x77 and 0x23/0x5C **every boot**. Boot is the single largest energy cost |
| `BH1750` → `ONE_TIME_HIGH_RES_MODE` | Currently `CONTINUOUS_HIGH_RES_MODE`, so it draws between reads |
| `setCpuFrequencyMhz(80)` | From 240 MHz — roughly a third of the CPU current |
| `btStop()`, no WiFi init | Cheap insurance |
| No `Serial.begin` in release | Costs boot time and current |
| MOSFET-gated sensor rail | Sensors draw nothing during sleep (§3.2) |
| Report `vbat` via ADC | Battery state becomes real instead of `UNKNOWN_METRIC` |

ADS1115 is already single-shot (`readADC_SingleEnded`) — leave it.

### 2.6 Master power fixes

Free, and they break nothing:

- `WiFi.setSleep(true)` — currently forced **off** for latency, unnecessary with
  5-minute data (~30–40 mA)
- Poll loop deleted (§2.1) — no more TX every second
- `setCpuFrequencyMhz(80)`
- LoRa-reset watchdog 1 s → 30 s

~150 mA → ~90 mA. **We are deliberately not duty-cycling the Master**: it must stay
awake for the app's HTTP and to hear pushes. Duty-cycling only reaches ~12 days
anyway, because WiFi association burns current on every wake, and it would kill local
HTTP access.

---

## 3. Power: the real numbers

### 3.1 ⚠️ Measure sleep current before anything else

**Dev boards leak 2–10 mA in deep sleep** — USB-serial chip (CP2102/CH340), power
LED, and LDO quiescent current. A bare ESP32-WROOM does ~10 µA.

| Per 5-min cycle | Energy |
|---|---|
| Boot + sensor init (~1 s) | 60 mA·s |
| Listen window (2 s @ 11 mA) | 22 mA·s — removable via §2.3 |
| LoRa TX (~0.1 s @ 120 mA) | 12 mA·s |
| Deep sleep (297 s @ 10 µA) | 3 mA·s |
| **Dev-board leak @ 5 mA** | **1500 mA·s** |

The leak would be **15× everything else combined.** Put a multimeter in series with
the battery and read the sleep current. Nothing else in this section matters until
that number is known.

### 3.2 Expected runtime on 5000 mAh

| Configuration | Avg current | Runtime |
|---|---|---|
| Today (continuous RX, no sleep) | ~90 mA | **~2 days** |
| Push + sleep, **dev board leaking 5 mA** | ~5.3 mA | **~5 weeks** |
| Push + sleep, **bare WROOM module** | ~0.32 mA | **~1.8 years** |
| Bare module + 1 W solar | — | indefinite |

Dev boards are fine for development. **Bare modules or trace surgery is what turns
weeks into years** — that is the whole decision.

### 3.3 Li-ion specifics for this cell

- 3.7 V nominal, 4.2 V full, **3.0 V cutoff**. Do not feed 4.2 V to the ESP32's 3.3 V
  pin — use a buck (MP1584) or low-Iq LDO (AP2112). The Ra-02 is 3.3 V only.
- **Charging:** TP4056 module. Confirm the cell has a protection PCB, or add
  under-voltage cutoff — draining a Li-ion below 2.5 V destroys it.
- **Do not charge below 0 °C.** Rare in most of India but real on northern winter
  nights. LiFePO4 tolerates cold if this becomes a problem.
- Report `vbat` in the payload (§2.2) so the app can warn before a node dies silently.

---

## 4. App changes

Small, and required — otherwise the UI lies about data it is showing.

| Change | From | To |
|---|---|---|
| `HARDWARE_STALE_AFTER_MS` | 15 s | ~12 min (≈2.5× interval) |
| `NODE_OFFLINE_TIMEOUT_MS` (firmware) | 5 s | ~12 min |
| Home "● Live" indicator | always "Live" | show **data age** |
| `batteryPct` | `UNKNOWN_METRIC` | real, from `vbat` |
| Sensor Nodes screen | — | show next expected push, drift correction applied |

`settings.refreshSeconds: 20` stays — the app polls the Master's cache over WiFi, and
the Master is mains-powered.

---

## 5. In-app setup instructions

A guided pairing flow, because a farmer cannot be expected to know what mDNS is. New
screen: **Settings → Connect Sensors** (`SensorSetupScreen`), also reachable from
Fields when no master is configured.

### 5.1 Flow

**Step 1 — Power on**
> "Switch on your Drikr sensor box. Wait for the light to turn on."
Illustration of the Master. Continue button.

**Step 2 — Is the box already on your WiFi?**
Two choices: *"Set it up for the first time"* → Step 3. *"It's already set up"* →
Step 5.

**Step 3 — Give the box your WiFi** (first time only)
> "Your sensor box makes its own temporary WiFi called **Drikr_Setup**.
> 1. Open your phone's WiFi settings
> 2. Join **Drikr_Setup** (password on the sticker)
> 3. Come back here"

A "Open WiFi settings" button deep-links to Android settings. Once the app can reach
`192.168.1.1`, it shows the farm WiFi form (SSID list + password), posts to
`/provision`, and the box reboots.

**Step 4 — Rejoin your own WiFi**
> "The box is restarting and joining your WiFi. Please reconnect your phone to your
> home WiFi."
App polls for `drikr.local` in the background.

**Step 5 — Find the box**
Automatic via mDNS. On failure, a manual field: *"Type the address shown on the box's
screen or serial output"*. Verified with `/api/status`, which must report
`device: "drikr-master"` — this is what stops us trusting some other device on the
same IP.

**Step 6 — Confirm nodes**
> "Found 2 sensor nodes. Which field are they in?"
Plot picker, then drag each node onto a position on the field map (feeds the health
map's interpolation). Defaults to the diagonal spread in `gridRefForNode`.

**Step 7 — Calibrate probes** (skippable)
Only for channels marked `fitted`. Two-point wizard per probe:
> "Hold the moisture probe in the air. Tap Record."
> "Now put it in a glass of water. Tap Record."
Writes into the `calibration.ts` curve. Skipping leaves the channel as "No sensor" —
which is correct, not a failure.

**Step 8 — Done**
> "Connected. Your field data will update every 5 minutes."
Shows the first live reading.

### 5.2 Troubleshooting section (in-app)

| Symptom | Message shown |
|---|---|
| Can't find `Drikr_Setup` | "Hold the button on the box for 5 seconds to restart setup mode." |
| Provisioning succeeded, box not found | "Check your phone is on the same WiFi as the box, not mobile data." |
| Master reachable, 0 nodes | "The box is working but can't hear the field sensors. Check they're powered and within 1 km." |
| Nodes online, values show "No sensor" | "That sensor isn't fitted on this node. This is normal." |
| Battery low | "Node 2 battery is at 15%. Recharge or check the solar panel." |

### 5.3 Rules for this flow

- **Never ask for anything the app can detect.** mDNS first, manual entry only as a
  fallback.
- **Plain language.** No "SSID", "mDNS", "IP" in farmer-facing copy — those belong in
  the troubleshooting detail only.
- **Every step must be skippable or reversible.** A farmer who abandons setup halfway
  must still land in a working app on simulated data, clearly labelled.
- **Three languages.** All copy through i18n (en/hi/ta), parity maintained.
- **Voice** — read each step aloud on tap, consistent with the voice-first intent.

---

## 6. Cloud path

Not needed for the demo, and deliberately staged.

**Phase 1 — phone as courier (₹0, no new hardware).** The Master buffers readings to
flash; the app pulls them when in range and uploads when the phone next has signal.
At ~6 KB/day, ESP32 flash holds months. The app's outbox already works this way — this
is the same pattern, extended to the hardware.

**Phase 2 — Cloud Function relay.** ESP32 POSTs plain JSON plus a shared key to a
Cloud Function, which writes to Firestore. Chosen over direct Firestore REST: no
hourly token refresh, no verbose typed JSON, less TLS heap, and the schema can change
without reflashing. App reads via `onSnapshot`.

⚠️ **Aggregate before writing.** 1 Hz would be ~172,800 Firestore writes/day against
a 20,000/day free tier. Writing one averaged document every 2 min is 720/day — and
averaging removes sensor noise, so the data is better as well as cheaper.

**Phase 3 — cellular**, only if the farm has no WiFi: T-Call V1.4 (~₹1,200) as the
Master. Requires re-soldering the Ra-02 and remapping `LORA_PIN_SS` (5) and SPI MOSI
(23), both of which SIM800L occupies. SIM800L is 2G — confirm coverage, or use
SIM7080G (Cat-M1/NB-IoT), which is the purpose-built IoT standard.

---

## 7. Order of work

| # | Task | Owner |
|---|---|---|
| 1 | **Measure slave deep-sleep current** | you — gates everything in §3 |
| 2 | Firmware: push mode + binary payload + ACK (§2.1–2.4) | me |
| 3 | Firmware: slave and master power fixes (§2.5–2.6) | me |
| 4 | App: timing constants, Live → age, `vbat` (§4) | me |
| 5 | `pio run` + flash all three, verify on real hardware | you |
| 6 | App: `SensorSetupScreen` + i18n (§5) | me |
| 7 | Firmware: NVS provisioning + captive portal | me |
| 8 | Bare modules or trace surgery, buck + TP4056 (§3) | you |
| 9 | Probes + calibration wizard | both |
| 10 | Cloud phases 1 → 2 (§6) | me |

Steps 2–4 can land before you have measured anything; they are correct regardless.

---

## 8. Open decisions

1. **Bare modules or dev boards for deployment?** ~5 weeks vs ~1.8 years of runtime.
2. **Solar?** 1 W panel per node makes runtime indefinite and removes recharge visits.
3. **Push interval** — 5 min fixed, or adaptive (15 min when stable, 5 min when a risk
   is climbing)? The decision engine already knows which, and the ACK can carry it.
4. **Provisioning:** captive portal only, or the in-app flow in §5 too?
5. **Farm WiFi confirmed?** If not, Phase 3 moves up the queue.

---

## 9. Verification status

- **Verified:** app mapping and calibration against a mock master serving the
  firmware's exact `nodeToJson()` shape; `tsc` clean; Android bundle builds.
- **Not verified:** anything against real hardware. No master has been on this
  network.
- **Not compiled:** the firmware. PlatformIO is not installed on this machine — the
  station-mode changes have only been brace-checked. Run `pio run` before trusting
  them.
