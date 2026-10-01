import { DOMAIN_LABELS, cropProfile } from '../config/agronomy';
import env, { hasCloudAi } from '../config/env';
import { ChatMessage, Language, Plot, PlotSnapshot, RiskDomain, WeatherForecast } from '../types';
import { PlotAssessment } from './decisionEngine';
import i18n from '../i18n/i18n';
import { MODEL_LANGUAGE } from '../i18n/languages';

/**
 * "Kisan Mitra" — the multilingual farming assistant.
 *
 * Two answering paths, in this order:
 *
 *  1. Cloud model (Gemini, or OpenAI if that key is set), given the live field state
 *     as grounding context so answers reference the farmer's actual sensor readings
 *     rather than generic advice.
 *  2. On-device intent matching over the decision-engine output. This is not a
 *     fallback stub — it is the path that works in a field with no signal, which is
 *     where the app is meant to be used. Answers are assembled from the same
 *     assessments the Home screen shows, so the assistant can never contradict it.
 */

export interface AssistantContext {
  plot: Plot | null;
  snapshot: PlotSnapshot | null;
  assessment: PlotAssessment | null;
  forecast: WeatherForecast | null;
  language: Language;
}


/** Compact field state for the model prompt. */
function groundingBlock(ctx: AssistantContext): string {
  const { plot, snapshot, assessment, forecast } = ctx;
  if (!plot || !snapshot) return 'No field data is available yet.';

  const r = snapshot.reading;
  const crop = cropProfile(plot.crop);
  const lines = [
    `Field: ${plot.name} (${crop.label}, ${plot.areaAcres} acre, ${plot.stage} stage, ${plot.soilType}, ${plot.irrigationType} irrigation)`,
    `Crop health index: ${snapshot.healthIndex}/100 (${snapshot.risk})`,
    `Sensors: air ${r.airTemp}°C, humidity ${r.humidity}%, soil moisture ${r.soilMoisture}%, soil temp ${r.soilTemp}°C, pH ${r.ph}, EC ${r.ec} dS/m, N ${r.nitrogen} ppm, P ${r.phosphorus} ppm, K ${r.potassium} ppm, leaf wetness ${r.leafWetness}%, wind ${r.windSpeed} km/h, pest pressure ${r.pestActivity}/100`,
    `Nodes reporting: ${snapshot.nodesOnline}/${snapshot.nodesTotal}`,
  ];

  if (assessment) {
    lines.push(
      'Risk assessment: ' +
        assessment.risks
          .map((x) => `${DOMAIN_LABELS[x.domain]} ${x.score}/100 (${x.level}, confidence ${Math.round(x.confidence * 100)}%)`)
          .join('; ')
    );
    if (assessment.recommendations.length) {
      lines.push('Pending actions: ' + assessment.recommendations.map((x) => x.text).join('; '));
    }
  }

  if (forecast) {
    const d = forecast.daily[0];
    if (d) {
      lines.push(
        `Weather today: ${Math.round(d.tempMin)}-${Math.round(d.tempMax)}°C, ${d.precipitation} mm rain (${d.precipProbability}% chance), wind to ${Math.round(d.windMax)} km/h`
      );
    }
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are Kisan Mitra, an agricultural advisor inside the Drikr smart-farming app used by small and marginal Indian farmers.

Rules:
- Answer in the requested language, using its native script.
- Be concrete and practical. Give quantities per acre, timing, and locally available inputs.
- Ground every claim in the FIELD DATA provided. If the data does not support an answer, say what you would need to measure.
- Prefer low-cost and biological options before chemicals. Mention safety intervals when you name a chemical.
- Keep answers under 140 words. Use short lines, not long paragraphs.
- Never invent sensor readings that are not in FIELD DATA.`;

async function askGemini(question: string, ctx: AssistantContext): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Reply in ${MODEL_LANGUAGE[ctx.language]}.\n\nFIELD DATA:\n${groundingBlock(ctx)}\n\nFARMER'S QUESTION:\n${question}`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Empty response');
  return text.trim();
}

async function askOpenAi(question: string, ctx: AssistantContext): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Reply in ${MODEL_LANGUAGE[ctx.language]}.\n\nFIELD DATA:\n${groundingBlock(ctx)}\n\nFARMER'S QUESTION:\n${question}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Empty response');
  return text.trim();
}

// --- On-device intent matching ---------------------------------------------

type Intent = RiskDomain | 'health' | 'weather' | 'market' | 'drone' | 'sensors' | 'help';

/** Keyword sets per intent, across the supported languages. */
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  irrigation: ['water', 'irrigat', 'moisture', 'dry', 'pani', 'सिंचाई', 'पानी', 'नमी', 'நீர்', 'பாசன',
    'সেচ', 'জল', 'पाणी', 'सिंचन', 'నీరు', 'నీటిపారుదల', 'પાણી', 'સિંચાઈ', 'پانی', 'آبپاشی', 'ನೀರು', 'ನೀರಾವರಿ', 'ଜଳସେଚନ', 'ജലസേചന', 'വെള്ളം', 'ਪਾਣੀ', 'ਸਿੰਚਾਈ', 'জলসিঞ্চন', 'পানী'],
  pest: ['pest', 'insect', 'worm', 'borer', 'armyworm', 'aphid', 'keeda', 'कीट', 'कीड़', 'பூச்சி',
    'পোকা', 'কীট', 'कीड', 'పురుగు', 'જીવાત', 'کیڑ', 'ಕೀಟ', 'ପୋକ', 'കീട', 'ਕੀੜ', 'পোক'],
  nutrient: ['fertil', 'nutrient', 'urea', 'npk', 'nitrogen', 'khad', 'खाद', 'उर्वरक', 'நைட்ரஜன்', 'உரம',
    'সার', 'खत', 'ఎరువు', 'ખાતર', 'کھاد', 'ಗೊಬ್ಬರ', 'ସାର', 'വളം', 'ਖਾਦ', 'সাৰ'],
  cropHealth: ['disease', 'fungus', 'blight', 'rust', 'spot', 'rog', 'रोग', 'बीमारी', 'நோய்',
    'রোগ', 'తెగులు', 'వ్యాధి', 'રોગ', 'بیماری', 'ರೋಗ', 'ରୋଗ', 'രോഗ', 'ਰੋਗ', 'ਬਿਮਾਰੀ', 'ৰোগ'],
  climate: ['rain', 'storm', 'heat', 'frost', 'wind', 'barish', 'बारिश', 'मौसम', 'गर्मी', 'மழை', 'வானிலை',
    'বৃষ্টি', 'पाऊस', 'వర్షం', 'વરસાદ', 'بارش', 'ಮಳೆ', 'ବର୍ଷା', 'മഴ', 'ਮੀਂਹ', 'বৰষুণ'],
  weather: ['weather', 'forecast', 'mausam', 'मौसम', 'வானிலை', 'temperature',
    'আবহাওয়া', 'हवामान', 'వాతావరణ', 'હવામાન', 'موسم', 'ಹವಾಮಾನ', 'ପାଣିପାଗ', 'കാലാവസ്ഥ', 'ਮੌਸਮ', 'বতৰ'],
  health: ['health', 'condition', 'how is', 'status', 'सेहत', 'हालत', 'நிலை'],
  market: ['price', 'mandi', 'market', 'sell', 'rate', 'भाव', 'मंडी', 'कीमत', 'விலை', 'சந்தை',
    'দাম', 'বাজার', 'बाजार', 'ధర', 'మార్కెట్', 'ભાવ', 'બજાર', 'قیمت', 'منڈی', 'ಬೆಲೆ', 'ಮಾರುಕಟ್ಟೆ', 'ଦାମ', 'ବଜାର', 'വില', 'ചന്ത', 'ਭਾਅ', 'ਮੰਡੀ', 'বজাৰ'],
  drone: ['drone', 'spray', 'ड्रोन', 'छिड़काव', 'ட்ரோன்', 'தெளி',
    'ড্রোন', 'డ్రోన్', 'ડ્રોન', 'ڈرون', 'ಡ್ರೋನ್', 'ଡ୍ରୋନ', 'ഡ്രോൺ', 'ਡਰੋਨ', 'ড্ৰোন'],
  sensors: ['sensor', 'node', 'battery', 'device', 'सेंसर', 'बैटरी', 'சென்சார்',
    'সেন্সর', 'सेन्सर', 'సెన్సార్', 'સેન્સર', 'سینسر', 'ಸೆನ್ಸರ್', 'ସେନ୍ସର', 'സെൻസർ', 'ਸੈਂਸਰ', 'চেন্সৰ'],
  help: ['help', 'what can you', 'madad', 'मदद', 'உதவி',
    'সাহায্য', 'मदत', 'సహాయ', 'મદદ', 'مدد', 'ಸಹಾಯ', 'ସାହାଯ୍ୟ', 'സഹായ', 'ਮਦਦ', 'সহায়'],
};

function detectIntent(q: string): Intent {
  const lower = q.toLowerCase();
  let best: Intent = 'health';
  let bestHits = 0;
  (Object.keys(INTENT_KEYWORDS) as Intent[]).forEach((intent) => {
    const hits = INTENT_KEYWORDS[intent].filter((k) => lower.includes(k)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = intent;
    }
  });
  return bestHits === 0 ? 'health' : best;
}

/** Compose an answer from live assessments — no network required. */
export function answerOffline(question: string, ctx: AssistantContext): string {
  const t = i18n.getFixedT(ctx.language);
  const fill = (key: string, vars?: Record<string, string | number>) => t(`mitra.offline.${key}`, vars) as string;
  const { plot, snapshot, assessment, forecast } = ctx;

  if (!plot || !snapshot || !assessment) return fill('noData');

  const intent = detectIntent(question);
  const parts: string[] = [];

  const domainIntents: RiskDomain[] = ['irrigation', 'pest', 'nutrient', 'cropHealth', 'climate'];

  if (intent === 'help') return fill('help');

  if (intent === 'weather') {
    const d = forecast?.daily?.[0];
    if (!d) return fill('noWeather');
    return fill('weatherLine', {
      min: Math.round(d.tempMin),
      max: Math.round(d.tempMax),
      rain: d.precipitation,
      prob: d.precipProbability,
      wind: Math.round(d.windMax),
    });
  }

  if (intent === 'market') return fill('marketLine');

  if (intent === 'sensors') {
    const r = snapshot.reading;
    return fill('sensorsLine', {
      online: snapshot.nodesOnline,
      total: snapshot.nodesTotal,
      sm: r.soilMoisture,
      n: r.nitrogen,
      pest: Math.round(r.pestActivity),
    });
  }

  if (intent === 'drone') {
    const sprayable = assessment.recommendations.filter((r) => r.droneEligible);
    if (sprayable.length === 0) return fill('droneNone');
    return fill('droneLine', { status: sprayable[0].text });
  }

  // Domain question, or the general "how is my field" case.
  if (domainIntents.includes(intent as RiskDomain)) {
    const risk = assessment.risks.find((r) => r.domain === intent);
    if (risk) {
      parts.push(fill('topRisk', { title: risk.title, detail: risk.detail }));
      if (risk.recommendations.length) {
        parts.push(fill('actions'));
        risk.recommendations.forEach((r) =>
          parts.push(`• ${r.text} (${fill('within', { h: r.windowHours })})`)
        );
      }
      return parts.join('\n');
    }
  }

  // Default: overall field status.
  parts.push(
    fill('healthLead', { plot: plot.name, index: snapshot.healthIndex, risk: snapshot.risk })
  );
  if (assessment.primary) {
    parts.push(fill('topRisk', { title: assessment.primary.title, detail: assessment.primary.detail }));
  } else {
    parts.push(fill('allClear'));
  }
  if (assessment.recommendations.length) {
    parts.push(fill('actions'));
    assessment.recommendations
      .slice(0, 3)
      .forEach((r) => parts.push(`• ${r.text} (${fill('within', { h: r.windowHours })})`));
  }
  return parts.join('\n');
}

export interface AssistantReply {
  text: string;
  offline: boolean;
}

/** Ask Kisan Mitra. Falls back to the on-device engine on any cloud failure. */
export async function ask(question: string, ctx: AssistantContext): Promise<AssistantReply> {
  if (hasCloudAi()) {
    try {
      const text = env.geminiApiKey ? await askGemini(question, ctx) : await askOpenAi(question, ctx);
      return { text, offline: false };
    } catch {
      // No signal, bad key, rate limit — the farmer still gets a grounded answer.
    }
  }
  return { text: answerOffline(question, ctx), offline: true };
}

/** Starter prompts shown as chips in the chat, localised. */
export function suggestedPrompts(language: Language): string[] {
  const t = i18n.getFixedT(language);
  return [t('mitra.prompts.p1'), t('mitra.prompts.p2'), t('mitra.prompts.p3'), t('mitra.prompts.p4')];
}

export function newMessage(role: ChatMessage['role'], text: string, offline?: boolean): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    text,
    at: Date.now(),
    offline,
  };
}
