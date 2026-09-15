import { cropProfile } from '../config/agronomy';
import env from '../config/env';
import { Language, Plot, PlotSnapshot, RiskAssessment, RiskDomain } from '../types';

/**
 * Photo diagnosis for disease and pest scouting.
 *
 * The screen this feeds used to return a hard-coded "Leaf Spot, 92% accurate"
 * from a setTimeout, and the rebuild replaced that with an honest "queued for a
 * model that does not exist yet". This is the model. It is a multimodal LLM
 * rather than a PlantVillage CNN, which is a real trade:
 *
 *  + No training, no serving cost, no 40 MB model in the bundle, and it is not
 *    restricted to the 38 PlantVillage classes — it can say "this is sunscald,
 *    not a pathogen" or "that is a beneficial spider".
 *  + It can be given the sensor readings, so a verdict can be grounded in leaf
 *    wetness and humidity rather than pixels alone.
 *  - Accuracy on close-up single-leaf shots is likely below a fine-tuned CNN,
 *    and it cannot be audited or version-pinned the way a trained model can.
 *
 * The design compensates for that in three ways, which matter more than the
 * model choice:
 *
 *  1. **Abstention is a first-class answer.** A blurred photo, a shot of soil,
 *     or a leaf with no visible symptom returns `label: null`. A classifier that
 *     must always name something will always name something.
 *  2. **Confidence passes the same gate as every alert.** Below the farmer's
 *     threshold the verdict is shown as unconfirmed, not as a diagnosis.
 *  3. **It never overrides the sensors.** Photo and sensor risk are reported
 *     side by side, and a disagreement is surfaced rather than resolved — one
 *     leaf is not the field, and the sensors see the whole plot.
 */

export interface PhotoDiagnosis {
  at: number;
  /** Which model answered, so the UI can label it. */
  source: 'cloud';
  /**
   * Named condition, or null when the model declined. Null is a legitimate
   * result and must be rendered as "could not tell", never as "healthy".
   */
  label: string | null;
  /** 0..1, gated against the farmer's confidence threshold like any alert. */
  confidence: number;
  severity: 'none' | 'early' | 'moderate' | 'severe' | 'unknown';
  /** Visual signs the model claims to see. The evidence, so it can be checked. */
  observed: string[];
  reasoning: string;
  advice: string;
  /** Why it abstained, when it did: "photo is blurred", "no leaf in frame". */
  declineReason?: string;
  /** How the photo verdict sits against the sensor score. Computed here. */
  agreement: Agreement;
}

export type Agreement = 'agree' | 'photoWorse' | 'sensorsWorse' | 'unknown';

export interface DiagnoseInput {
  /** Base64 JPEG, from ImagePicker's `base64: true`. */
  base64: string;
  domain: RiskDomain;
  plot: Plot | null;
  snapshot: PlotSnapshot | null;
  /** The sensor-side assessment for the same domain, for the agreement check. */
  risk: RiskAssessment | null;
  language: Language;
}

const LANG_NAME: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  ta: 'Tamil (Tamil script)',
};

const SYSTEM_PROMPT = `You are a plant pathologist and entomologist examining a photograph taken by a small-holding Indian farmer in their own field, inside the Drikr farming app.

You must follow these rules exactly.

ABSTAIN WHEN YOU SHOULD:
- If the image is blurred, too dark, too far away, or does not clearly show plant tissue, set "label" to null and explain in "declineReason".
- If plant tissue is visible but you see no abnormality, set "label" to null, "severity" to "none", and say so in "declineReason".
- Never name a condition you cannot see evidence for. A wrong name makes a farmer spray the wrong chemical on a crop they eat and sell.

REPORT ONLY WHAT IS VISIBLE:
- "observed" must list visual signs actually present in the image: lesion shape and colour, margin type, distribution on the leaf, insect body parts, webbing, frass, chlorosis pattern.
- FIELD DATA is context for plausibility and for your advice. Never claim to see something because FIELD DATA suggests it.
- Distinguish pathogens from look-alikes: nutrient deficiency, sunscald, herbicide damage, water stress, and mechanical injury are common and are not treated with pesticide. Say so when that is what you see.
- Identify beneficial insects as beneficial. Spiders, ladybirds, lacewings and parasitoid wasps must not be reported as pests.

CONFIDENCE:
- "confidence" is 0.0 to 1.0 and must reflect image quality AND how diagnostic the visible signs are.
- Above 0.8 only for a textbook-clear, well-lit, close-focused symptom.
- Below 0.5 whenever a look-alike is plausible from this image alone.

ADVICE:
- Prefer cultural and biological control before chemicals. If you name a chemical, give the dose per acre and the pre-harvest interval.
- Keep "advice" under 60 words.
- Write "label", "reasoning" and "advice" in the requested language. Keep "observed" entries short.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', nullable: true },
    confidence: { type: 'number' },
    severity: { type: 'string', enum: ['none', 'early', 'moderate', 'severe', 'unknown'] },
    observed: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
    advice: { type: 'string' },
    declineReason: { type: 'string', nullable: true },
  },
  required: ['confidence', 'severity', 'observed', 'reasoning', 'advice'],
} as const;

/** Field state for plausibility. Deliberately smaller than the chat grounding block. */
function contextBlock(input: DiagnoseInput): string {
  const { plot, snapshot, risk, domain } = input;
  if (!plot) return 'No field data available.';
  const crop = cropProfile(plot.crop);
  const lines = [
    `Crop: ${crop.label}, ${plot.stage} stage, sown ${plot.sowingDate}, ${plot.soilType} soil, ${plot.irrigationType} irrigation.`,
    `Looking for: ${domain === 'pest' ? 'insect pests and their damage' : 'disease and disorders'}.`,
    `Common for this crop: ${(domain === 'pest' ? crop.commonPests : crop.commonDiseases).join(', ')}.`,
  ];
  if (snapshot) {
    const r = snapshot.reading;
    lines.push(
      `Sensors: air ${r.airTemp}°C, humidity ${r.humidity}%, leaf wetness ${r.leafWetness}%, soil moisture ${r.soilMoisture}%, N ${r.nitrogen} ppm, P ${r.phosphorus} ppm, K ${r.potassium} ppm.`
    );
  }
  if (risk) {
    lines.push(
      `Sensor-based ${domain} risk: ${risk.score}/100 (${risk.level}). This is the whole plot, not this leaf.`
    );
  }
  return lines.join('\n');
}

/**
 * Does the photo verdict line up with what the sensors say?
 *
 * Computed here rather than asked of the model, so it is deterministic and the
 * model cannot talk itself into agreeing. A mismatch is not an error — one leaf
 * is not the field, and the point is to show the farmer both.
 */
function agreementOf(
  severity: PhotoDiagnosis['severity'],
  risk: RiskAssessment | null
): Agreement {
  if (!risk || severity === 'unknown') return 'unknown';
  const photo = severity === 'none' ? 0 : severity === 'early' ? 35 : severity === 'moderate' ? 60 : 85;
  const gap = photo - risk.score;
  if (Math.abs(gap) <= 25) return 'agree';
  return gap > 0 ? 'photoWorse' : 'sensorsWorse';
}

function parseDiagnosis(raw: unknown, risk: RiskAssessment | null): PhotoDiagnosis {
  const o = (raw ?? {}) as Record<string, unknown>;

  const rawLabel = typeof o.label === 'string' ? o.label.trim() : '';
  // An empty string, "null", "unknown" and "none" are all the model trying to
  // say it does not know. Treat every one of them as an abstention rather than
  // letting "unknown" reach the screen as a diagnosis named "unknown".
  const label =
    rawLabel && !/^(null|unknown|none|n\/a|not sure)$/i.test(rawLabel) ? rawLabel : null;

  const confRaw = Number(o.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0;

  const severityRaw = String(o.severity ?? 'unknown');
  const severity = (['none', 'early', 'moderate', 'severe'] as const).includes(
    severityRaw as never
  )
    ? (severityRaw as PhotoDiagnosis['severity'])
    : 'unknown';

  const observed = Array.isArray(o.observed)
    ? o.observed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 6)
    : [];

  return {
    at: Date.now(),
    source: 'cloud',
    label,
    // An abstention cannot carry high confidence: there is nothing to be
    // confident about, and a "not sure, 0.9" badge reads as a verdict.
    confidence: label ? confidence : Math.min(confidence, 0.4),
    severity,
    observed,
    reasoning: typeof o.reasoning === 'string' ? o.reasoning.trim() : '',
    advice: typeof o.advice === 'string' ? o.advice.trim() : '',
    declineReason: typeof o.declineReason === 'string' && o.declineReason.trim()
      ? o.declineReason.trim()
      : undefined,
    agreement: agreementOf(severity, risk),
  };
}

/**
 * Classify a scouting photo.
 *
 * Returns null when there is no cloud model configured or the call fails. Null
 * means "not diagnosed", and the screen must keep saying so — falling back to a
 * guess would reintroduce exactly the invented verdict this replaced.
 */
export async function diagnosePhoto(input: DiagnoseInput): Promise<PhotoDiagnosis | null> {
  // Gemini specifically, not hasCloudAi(): vision needs a multimodal model, and
  // an OPENAI_API_KEY alone would pass that check and then fail the call.
  if (!env.geminiApiKey) return null;
  if (!input.base64) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.geminiApiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: input.base64 } },
              {
                text: `Reply in ${LANG_NAME[input.language]}.\n\nFIELD DATA:\n${contextBlock(input)}\n\nExamine the photograph and return JSON.`,
              },
            ],
          },
        ],
        generationConfig: {
          // Low temperature: this is a classification, not a composition. A
          // different answer on a second look at the same leaf would be worse
          // than a wrong one, because the farmer cannot tell which to trust.
          temperature: 0.15,
          maxOutputTokens: 700,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ??
      '';
    if (!text) return null;

    return parseDiagnosis(JSON.parse(text), input.risk);
  } catch {
    // Offline, timeout, or malformed JSON. All are "not diagnosed".
    return null;
  } finally {
    clearTimeout(timer);
  }
}
