# Autonomous In-Space Precision Agriculture — Reference

A forward-looking reference for extending Drikr beyond terrestrial soil farming:
controlled-environment agriculture, orbital habitats, and eventually Mars.

**This is not a roadmap for the SIH build.** It exists so that the architectural
choices made now keep the door open, and so that whoever picks this up later does not
have to re-derive the constraints. Companion to
[HARDWARE_CONNECTIVITY_PLAN.md](HARDWARE_CONNECTIVITY_PLAN.md) and
[CLAUDE.md](CLAUDE.md).

**Confidence marking:** claims are labelled `[known]` for established engineering
fact, `[design]` for our own reasoning, and `[open]` for genuinely unresolved
questions. Do not let `[design]` harden into `[known]` without checking.

---

## 1. The one-line thesis

Everything space demands is rigour that also improves the Earth product. Nothing in
this document is speculative engineering — it is all discipline that pays for itself
on a rural Indian farm with intermittent 2G, and happens to be mandatory off-world.

Two properties Drikr already has are the two that matter most:

- **A swappable telemetry seam.** `src/services/telemetry.ts` is a single switch
  between sources. This is why connecting real LoRa hardware touched four files and
  zero screens.
- **Absent is not zero.** `readMetricOrNull` / `hasMetric` / `UNKNOWN_METRIC`. Built
  for honesty; it is also textbook spacecraft data-quality flagging.

Protect both. Everything else in this document builds on them.

---

## 2. What actually changes off Earth

### Physical constraints `[known]`

| Constraint | Earth | Mars | Consequence for us |
|---|---|---|---|
| Surface pressure | ~1013 mbar | **~6 mbar** | BME280's range is 300–1100 hPa — it simply cannot read Martian ambient. Rotor-based flight needs extreme RPM. |
| Mean temperature | ~15 °C | **~−60 °C** | Commercial ESP32 modules are rated to −40 °C. Everything lives in a heated enclosure. |
| Magnetosphere | yes | **none** | Surface radiation. Consumer silicon suffers single-event upsets; watchdogs and memory scrubbing stop being optional. |
| Regolith chemistry | soil biology | **perchlorates** | Confirmed by Phoenix (2008). Toxic to humans and most plants; needs washing or bioremediation before use as a growth medium. |
| Day length | 24 h | 24 h 39 min (sol) | Every scheduling assumption keyed to a 24 h day breaks. Our crop-stage logic is day-count based, so it needs a configurable day length. |
| Comms latency | ~ms | **3–22 min one way** | The single most architecturally significant number here. |
| Power | grid | solar + RTG, dust storms | Duty-cycling becomes a first-class scheduling concern, not an optimisation. |

### The latency consequence `[known]`

A 3–22 minute one-way light time means a 6–44 minute round trip. Consequences:

- **No request/response with Earth.** Nothing can block on a remote call.
- **No human in the decision loop.** A farmer cannot confirm a spray.
- **Cloud cannot be the source of truth.** The edge is authoritative; the ground
  archive is downstream.

This inverts §5 of the connectivity plan, where Firestore is authoritative and the
device is a client.

---

## 3. Growing method drives everything

The medium determines which sensors exist and which thresholds mean anything. This is
the single biggest branch in the design. `[known]` for the methods, `[design]` for
the Drikr mapping.

| Method | Primary measurements | Notes | Drikr reuse |
|---|---|---|---|
| **Hydroponics** (NFT, DWC) | pH, EC, dissolved O₂, solution temp, flow rate, reservoir level | Best understood; most flight heritage | **Highest** |
| **Aeroponics** | mist duty cycle, root-zone O₂, RH | Lowest water mass; clog-sensitive | High |
| **Aquaponics** | ammonia, nitrite, nitrate, pH, fish biomass | Closes the nitrogen loop; adds a second living system to keep alive | Medium — needs a new nitrogen-cycle domain |
| **Treated regolith** | soil moisture, pH, EC, perchlorate | Closest to today's code; the remediation is a chemistry problem, not an app one | Closest, but gated on chemistry |

### Why hydroponics suits our hardware better than soil `[design]`

Counter-intuitive but important: **the existing ADS1115 analog front-end is a better
fit for hydroponics than for soil.**

Hydroponic sensing is almost entirely analog probes — pH and EC are cheap, standard,
and exactly what `A0–A3` is wired for. Soil NPK, by contrast, needs ion-selective
electrodes that are expensive, drift badly, and are the weakest part of our current
plan.

So a hydroponic port would **delete** `soilMoisture` and **add** `flowRate` and
`reservoirLevel`, and the analog channels become *more* useful, not less.

### Stage-based thresholds port directly `[design]`

Controlled-environment agriculture works on a nutrient recipe per growth stage —
structurally identical to `moistureFloorByStage` in `src/config/agronomy.ts`.
`moistureFloorByStage` becomes `ecTargetByStage`. The shape of the knowledge base
survives; only its contents change.

---

## 4. Five architectural moves

Each is small, each improves the Earth product, and each is a prerequisite for
off-world operation. Ordered by value-per-effort.

### 4.1 Provenance on every reading `[design]`

```ts
interface Provenance {
  source: 'simulated' | 'lora' | 'cloud' | 'manual';
  measuredAt: number;   // when the sensor sampled
  receivedAt: number;   // when we learned about it
  quality: 'good' | 'stale' | 'uncalibrated' | 'estimated';
}
```

- **Earth benefit:** answers "is this tile real or simulated?" without a global flag,
  and makes a 20-minute-old mandi price visibly different from a live one.
- **Space necessity:** the gap between `measuredAt` and `receivedAt` *is* the
  mission-critical number.
- **Already half-built:** `hardware.ts` computes `at - ageMs`, and `offline.ts` has
  `formatAge` and a `stale` flag. Generalise rather than invent.

### 4.2 Growing medium as a profile `[design]`

Introduce a layer above `agronomy.ts` so the medium is a parameter:

```
GrowthMedium = 'soil' | 'hydroponic' | 'aeroponic' | 'regolith'
```

Each medium supplies its own metric set, thresholds and stage recipes. Today
`moistureFloorByStage` silently hardcodes "there is soil". One indirection turns a
rewrite into a data file.

### 4.3 Recommendations declare their own authority `[design]`

```ts
interface Recommendation {
  // ...existing
  reversible: boolean;
  authorityRequired: 'auto' | 'confirm' | 'expert';
  bounds?: { min: number; max: number; unit: string };
}
```

- **Earth benefit:** immediately better. Opening a drain valve can be automatic;
  spraying a chemical must not be. Today every action is treated identically and
  needs confirmation.
- **Space necessity:** with no human in the loop, autonomy becomes a *policy* over
  these fields instead of a redesign.
- Ties into `settings.requireDroneConfirmation`, which is currently a single global
  boolean doing the job of a per-action property.

### 4.4 Store-and-forward as the default path `[design]`

Invert `offline.ts`: **all** writes go through the outbox, and connectivity only
changes how fast it drains. Today the outbox is a fallback for when the network
fails.

- **Earth benefit:** fixes rural dropouts properly rather than by exception.
- **Space necessity:** this is the shape of DTN (§5). Getting there incrementally
  beats a rewrite.

### 4.5 Inject the clock `[design]`

`decisionEngine.ts` calls `Date.now()` internally. Pass a clock instead.

- **Earth benefit:** replayable demos, testable history, deterministic tests. Pairs
  with the already-deterministic simulator.
- **Space necessity:** the engine must reason about *stale* data rather than assuming
  "now", and must handle a non-24-hour day.

### Recommended order

**4.1, 4.2 and 4.5 are cheap and pay off immediately** — worth doing on Earth
regardless. **4.3** matters once there is more than one actuator. **4.4** waits until
there is a backend to drain into.

---

## 5. Transport: DTN

`[known]` Interplanetary links are *scheduled*, not continuous. TCP's assumptions —
low latency, a round trip for handshakes, an end-to-end path existing at one moment —
all fail.

The standard answer is **Delay/Disruption Tolerant Networking**, Bundle Protocol
version 7 (RFC 9171). Data is bundled with custody transfer and held at each hop
until the next contact window opens. NASA has operated DTN on the ISS.

`[design]` Our migration path:

1. Make the outbox the default write path (§4.4).
2. Add explicit custody: a queued item is not dropped until the next hop acknowledges
   it. `drainOutbox` currently discards after 8 attempts, which is correct for a
   flaky farm link and wrong for a scheduled orbital pass.
3. Replace the HTTP transport underneath with a BP implementation, leaving the queue
   semantics intact.

The important point: **steps 1 and 2 are good engineering on Earth.** Only step 3 is
space-specific.

---

## 6. Autonomy without a human in the loop

This is the part of Drikr's current design that genuinely breaks, and it deserves
care rather than hand-waving.

Today: the decision engine scores risk, a confidence gate suppresses weak alerts, and
a human confirms every actuation. That model is correct on Earth and the deck names
it explicitly as the false-alert mitigation.

`[design]` Off-world it has to become:

**Bounded action envelopes.** The system acts freely inside a pre-authorised envelope
and holds outside it.

- **Inside the envelope:** act now, log, report on the next downlink. Example: adjust
  nutrient solution EC by ≤5% toward the stage target.
- **Outside:** hold, flag, and wait for ground authority — accepting the round-trip
  delay because the action is consequential.
- **Never:** irreversible actions without explicit prior authorisation for that
  specific action.

Three design rules follow:

1. **Reversibility is a first-class property**, not a footnote. Prefer an action that
   can be undone locally over a better one that cannot.
2. **Confidence thresholds rise with consequence.** The current single user-tunable
   threshold becomes a function of the action's severity and reversibility.
3. **The envelope is the safety net, not the human.** The human reviews after the
   fact. This is the real inversion, and it means envelope definition becomes a
   safety-critical artefact needing review — the same way `agronomy.ts` thresholds
   should already be agronomist-reviewed.

`[open]` How are envelopes authored, versioned and validated? Who signs off? This is
unresolved and is the hardest problem in this document — harder than any of the
software.

---

## 7. What ports and what does not

`[design]` Rough assessment against the current codebase.

### Survives largely intact

| Component | Why |
|---|---|
| `services/telemetry.ts` seam | Already source-agnostic |
| `services/decisionEngine.ts` **structure** | Pure functions, per-domain scoring, evidence drivers, confidence separate from score |
| `services/healthMap.ts` | IDW interpolation is medium-agnostic |
| `services/alertEngine.ts` | Dedupe, cooldown and confidence gating are universal |
| `services/offline.ts` | Becomes the primary path rather than the fallback |
| `config/metrics.ts` absence handling | Exactly the right discipline |
| The simulator | Deterministic and replayable — more valuable off-world, not less |

### Must be rewritten

| Component | Why |
|---|---|
| `config/agronomy.ts` **contents** | Every band assumes Earth soil, Earth atmosphere, Earth gravity |
| Crop profiles | Martian candidates are dwarf/short-cycle cultivars; ours are field crops |
| `services/weather.ts` | Open-Meteo has no Mars endpoint. Becomes habitat environmental control |
| `services/drone.ts` | Rotor flight at 6 mbar needs Ingenuity-class design (~2400 rpm contra-rotating). Realistically a rover or fixed gantry |
| Sensor set | See §2 |
| Human-confirmation model | See §6 |

### Becomes irrelevant

- Voice-first UI for low digital literacy — the operator is a trained crew member
- Mandi prices, FPO deployment, market economics
- Multilingual farmer UX (though localisation is cheap to keep)

### Becomes critical

- **Data age**, displayed prominently on every screen rather than in a corner badge
- Resource accounting: water recovery %, power budget, consumables
- Closed-loop mass balance — nothing is disposable

---

## 8. Prior art worth reading

`[known]` Starting points, not an exhaustive list:

- **ISS Veggie** — passive wicking pillow system. Deliberately low-tech; good
  reference for what is *sufficient*.
- **ISS Advanced Plant Habitat (APH)** — heavily instrumented, largely autonomous
  controlled-environment chamber. Architecturally the closest flown analogue to
  Drikr.
- **DTN / Bundle Protocol v7 (RFC 9171)** — the transport standard.
- **Phoenix lander perchlorate findings (2008)** — why regolith is not soil.
- **Ingenuity** — proof that rotor flight is possible at Martian density, and how
  much it costs to achieve.
- **Terrestrial CEA literature** — nutrient recipes per growth stage, the direct
  analogue of our stage-based thresholds.

`[open]` We have not surveyed: closed-loop life-support integration (water/air
recycling coupling), crop selection research for Martian gravity, or radiation effects
on plant pathology.

---

## 9. Staged path

`[design]` Each stage is independently useful, which is the point. No stage exists
only to enable the next.

| Stage | Target | Work |
|---|---|---|
| **1. Earth soil** (now) | Indian smallholder farms | Current build |
| **2. Provenance + medium profile** | Same users, better honesty | §4.1, §4.2, §4.5 |
| **3. Terrestrial CEA** | Greenhouses, vertical farms | Hydroponic medium profile, EC/pH probes on existing ADS1115 |
| **4. Closed-loop / analogue** | Antarctic stations, research habitats | Resource accounting, envelopes (§4.3), DTN-shaped queue (§4.4) |
| **5. Orbital** | ISS-class chamber | Real DTN, radiation-tolerant hardware, crew UX |
| **6. Mars surface** | Regolith or hydroponic habitat | Perchlorate chemistry, sol-based scheduling, full autonomy |

**Stage 3 is the honest commercial next step** and needs none of the space work — it
just needs §4.2 and a ₹500 EC probe.

---

## 10. Guidance for whoever picks this up

1. **Do not build for Mars.** Build so that swapping any one layer does not touch the
   others. That discipline is what let LoRa hardware in without touching a single
   screen, and it is the only thing in this document that actually matters.
2. **Never fake a number.** The absent-is-not-zero rule is not stylistic. On Earth it
   protects a farmer's money; off-world it protects a crew's food supply. A fabricated
   zero that reaches the risk engine is indistinguishable from a measurement.
3. **Keep the knowledge base as reviewable data.** `agronomy.ts` should be editable by
   an agronomist and, later, a plant scientist — without touching logic.
4. **Treat latency as a design parameter, not a failure.** Intermittent is normal;
   connected is lucky. That is true in rural Rajasthan and on Mars, and the same code
   can serve both.
5. **Re-check the `[known]` claims.** Figures here were written from general
   engineering knowledge, not from primary sources, and none of the space-specific
   numbers have been verified against mission documentation. Verify before anything
   depends on them.
