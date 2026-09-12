import { DOMAIN_LABELS, cropProfile } from '../config/agronomy';
import env, { hasCloudAi } from '../config/env';
import { ChatMessage, Language, Plot, PlotSnapshot, RiskDomain, WeatherForecast } from '../types';
import { PlotAssessment } from './decisionEngine';

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

const LANG_NAME: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  ta: 'Tamil (Tamil script)',
};

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
              text: `Reply in ${LANG_NAME[ctx.language]}.\n\nFIELD DATA:\n${groundingBlock(ctx)}\n\nFARMER'S QUESTION:\n${question}`,
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
          content: `Reply in ${LANG_NAME[ctx.language]}.\n\nFIELD DATA:\n${groundingBlock(ctx)}\n\nFARMER'S QUESTION:\n${question}`,
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

/** Keyword sets per intent, in all three supported languages. */
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  irrigation: ['water', 'irrigat', 'moisture', 'dry', 'pani', 'सिंचाई', 'पानी', 'नमी', 'நீர்', 'பாசன'],
  pest: ['pest', 'insect', 'worm', 'borer', 'armyworm', 'aphid', 'keeda', 'कीट', 'कीड़', 'பூச்சி'],
  nutrient: ['fertil', 'nutrient', 'urea', 'npk', 'nitrogen', 'khad', 'खाद', 'उर्वरक', 'நைட்ரஜன்', 'உரம'],
  cropHealth: ['disease', 'fungus', 'blight', 'rust', 'spot', 'rog', 'रोग', 'बीमारी', 'நோய்'],
  climate: ['rain', 'storm', 'heat', 'frost', 'wind', 'barish', 'बारिश', 'मौसम', 'गर्मी', 'மழை', 'வானிலை'],
  weather: ['weather', 'forecast', 'mausam', 'मौसम', 'வானிலை', 'temperature'],
  health: ['health', 'condition', 'how is', 'status', 'सेहत', 'हालत', 'நிலை'],
  market: ['price', 'mandi', 'market', 'sell', 'rate', 'भाव', 'मंडी', 'कीमत', 'விலை', 'சந்தை'],
  drone: ['drone', 'spray', 'ड्रोन', 'छिड़काव', 'ட்ரோன்', 'தெளி'],
  sensors: ['sensor', 'node', 'battery', 'device', 'सेंसर', 'बैटरी', 'சென்சார்'],
  help: ['help', 'what can you', 'madad', 'मदद', 'உதவி'],
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

/** Phrasing for offline answers. Kept as templates so all three languages stay in step. */
const T: Record<Language, Record<string, string>> = {
  en: {
    noData: 'No field data yet. Add a plot and let the sensors report, then ask me again.',
    healthLead: '{plot} health is {index}/100 ({risk}).',
    topRisk: 'Main concern: {title} — {detail}',
    allClear: 'No significant risk right now. Keep to your routine schedule.',
    actions: 'What to do:',
    within: 'within {h}h',
    sensorsLine: 'Sensors: {online}/{total} nodes reporting, soil moisture {sm}%, N {n} ppm, pest pressure {pest}/100.',
    weatherLine: 'Today {min}-{max}°C, {rain} mm rain ({prob}% chance), wind to {wind} km/h.',
    noWeather: 'Weather forecast is unavailable offline. It will refresh when you are back online.',
    marketLine: 'Open the Market tab for live mandi prices from data.gov.in — it needs a connection.',
    droneLine: 'Drone: {status}. Tap Drone to review and confirm a mission.',
    droneNone: 'No drone mission is pending. One will be proposed if a spray is needed.',
    help: 'Ask me about irrigation, fertiliser, pests, disease, weather risk, your sensors, or mandi prices. I work offline using your live field data.',
    offlineNote: 'Answered on-device from your sensor data.',
  },
  hi: {
    noData: 'अभी खेत का डेटा नहीं है। एक प्लॉट जोड़ें और सेंसर से रिपोर्ट आने दें, फिर पूछें।',
    healthLead: '{plot} की सेहत {index}/100 है ({risk})।',
    topRisk: 'मुख्य चिंता: {title} — {detail}',
    allClear: 'अभी कोई बड़ा खतरा नहीं है। सामान्य कार्यक्रम जारी रखें।',
    actions: 'क्या करें:',
    within: '{h} घंटे में',
    sensorsLine: 'सेंसर: {online}/{total} नोड चालू, मिट्टी की नमी {sm}%, N {n} ppm, कीट दबाव {pest}/100।',
    weatherLine: 'आज {min}-{max}°C, {rain} मिमी बारिश ({prob}% संभावना), हवा {wind} किमी/घंटा तक।',
    noWeather: 'ऑफ़लाइन में मौसम पूर्वानुमान उपलब्ध नहीं है। नेटवर्क आने पर अपडेट होगा।',
    marketLine: 'मंडी भाव के लिए Market टैब खोलें — इसके लिए इंटरनेट चाहिए।',
    droneLine: 'ड्रोन: {status}। मिशन देखने और पुष्टि करने के लिए Drone खोलें।',
    droneNone: 'कोई ड्रोन मिशन लंबित नहीं है। छिड़काव ज़रूरी होने पर सुझाव आएगा।',
    help: 'सिंचाई, खाद, कीट, रोग, मौसम, सेंसर या मंडी भाव के बारे में पूछें। मैं आपके खेत के डेटा से ऑफ़लाइन भी जवाब देता हूँ।',
    offlineNote: 'आपके सेंसर डेटा से फ़ोन पर ही उत्तर दिया गया।',
  },
  ta: {
    noData: 'இன்னும் வயல் தகவல் இல்லை. ஒரு நிலத்தைச் சேர்த்து சென்சார் தகவல் வரும்வரை காத்திருங்கள்.',
    healthLead: '{plot} ஆரோக்கியம் {index}/100 ({risk}).',
    topRisk: 'முதன்மைக் கவலை: {title} — {detail}',
    allClear: 'இப்போது பெரிய ஆபத்து இல்லை. வழக்கமான அட்டவணையைத் தொடருங்கள்.',
    actions: 'என்ன செய்ய வேண்டும்:',
    within: '{h} மணி நேரத்தில்',
    sensorsLine: 'சென்சார்: {online}/{total} செயலில், மண் ஈரப்பதம் {sm}%, N {n} ppm, பூச்சி அழுத்தம் {pest}/100.',
    weatherLine: 'இன்று {min}-{max}°C, {rain} மிமீ மழை ({prob}% வாய்ப்பு), காற்று {wind} கிமீ/மணி வரை.',
    noWeather: 'ஆஃப்லைனில் வானிலை முன்னறிவிப்பு இல்லை. இணைப்பு வந்ததும் புதுப்பிக்கப்படும்.',
    marketLine: 'சந்தை விலைகளுக்கு Market தாவலைத் திறக்கவும் — இணையம் தேவை.',
    droneLine: 'ட்ரோன்: {status}. பணியை உறுதிப்படுத்த Drone திறக்கவும்.',
    droneNone: 'நிலுவையில் ட்ரோன் பணி இல்லை. தெளிப்பு தேவைப்பட்டால் பரிந்துரைக்கப்படும்.',
    help: 'நீர்ப்பாசனம், உரம், பூச்சி, நோய், வானிலை, சென்சார் அல்லது சந்தை விலை பற்றிக் கேளுங்கள். ஆஃப்லைனிலும் பதிலளிப்பேன்.',
    offlineNote: 'உங்கள் சென்சார் தகவலில் இருந்து சாதனத்திலேயே பதில்.',
  },
};

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Compose an answer from live assessments — no network required. */
export function answerOffline(question: string, ctx: AssistantContext): string {
  const t = T[ctx.language] ?? T.en;
  const { plot, snapshot, assessment, forecast } = ctx;

  if (!plot || !snapshot || !assessment) return t.noData;

  const intent = detectIntent(question);
  const parts: string[] = [];

  const domainIntents: RiskDomain[] = ['irrigation', 'pest', 'nutrient', 'cropHealth', 'climate'];

  if (intent === 'help') return t.help;

  if (intent === 'weather') {
    const d = forecast?.daily?.[0];
    if (!d) return t.noWeather;
    return fill(t.weatherLine, {
      min: Math.round(d.tempMin),
      max: Math.round(d.tempMax),
      rain: d.precipitation,
      prob: d.precipProbability,
      wind: Math.round(d.windMax),
    });
  }

  if (intent === 'market') return t.marketLine;

  if (intent === 'sensors') {
    const r = snapshot.reading;
    return fill(t.sensorsLine, {
      online: snapshot.nodesOnline,
      total: snapshot.nodesTotal,
      sm: r.soilMoisture,
      n: r.nitrogen,
      pest: Math.round(r.pestActivity),
    });
  }

  if (intent === 'drone') {
    const sprayable = assessment.recommendations.filter((r) => r.droneEligible);
    if (sprayable.length === 0) return t.droneNone;
    return fill(t.droneLine, { status: sprayable[0].text });
  }

  // Domain question, or the general "how is my field" case.
  if (domainIntents.includes(intent as RiskDomain)) {
    const risk = assessment.risks.find((r) => r.domain === intent);
    if (risk) {
      parts.push(fill(t.topRisk, { title: risk.title, detail: risk.detail }));
      if (risk.recommendations.length) {
        parts.push(t.actions);
        risk.recommendations.forEach((r) =>
          parts.push(`• ${r.text} (${fill(t.within, { h: r.windowHours })})`)
        );
      }
      return parts.join('\n');
    }
  }

  // Default: overall field status.
  parts.push(
    fill(t.healthLead, { plot: plot.name, index: snapshot.healthIndex, risk: snapshot.risk })
  );
  if (assessment.primary) {
    parts.push(fill(t.topRisk, { title: assessment.primary.title, detail: assessment.primary.detail }));
  } else {
    parts.push(t.allClear);
  }
  if (assessment.recommendations.length) {
    parts.push(t.actions);
    assessment.recommendations
      .slice(0, 3)
      .forEach((r) => parts.push(`• ${r.text} (${fill(t.within, { h: r.windowHours })})`));
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
  switch (language) {
    case 'hi':
      return [
        'क्या मुझे आज सिंचाई करनी चाहिए?',
        'मेरे खेत में कीट का खतरा क्या है?',
        'कौन सी खाद कितनी डालें?',
        'अगले 3 दिन का मौसम कैसा है?',
      ];
    case 'ta':
      return [
        'இன்று நீர்ப்பாசனம் செய்ய வேண்டுமா?',
        'பூச்சி ஆபத்து எவ்வளவு?',
        'எந்த உரம் எவ்வளவு போட வேண்டும்?',
        'அடுத்த 3 நாள் வானிலை என்ன?',
      ];
    default:
      return [
        'Should I irrigate today?',
        'What is the pest risk in my field?',
        'Which fertiliser and how much?',
        'What is the weather risk this week?',
      ];
  }
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
