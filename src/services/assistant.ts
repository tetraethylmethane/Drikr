import env from '../config/env';
import { routeForSpeech } from './voiceRoutes';

/**
 * What a spoken sentence means, for the voice assistant.
 *
 * Three layers, cheapest first:
 *   1. keywords for the actions (back, help, status, alerts...) in all 13
 *      languages and common Latin spellings - instant and offline;
 *   2. keywords for screens (voiceRoutes.ts);
 *   3. online, Gemini picks one of the same intents for anything phrased
 *      differently. If it says "question" - or there is no signal - the
 *      sentence goes to Kisan Mitra, which answers out loud.
 */
export type Intent =
  | { kind: 'back' }
  | { kind: 'home' }
  | { kind: 'help' }
  | { kind: 'language' }
  | { kind: 'call' }
  | { kind: 'addField' }
  | { kind: 'kit' }
  | { kind: 'alerts' }
  | { kind: 'status' }
  | { kind: 'nav'; screen: string }
  | { kind: 'question'; text: string };

const ACTIONS: Array<{ kind: Exclude<Intent['kind'], 'nav' | 'question'>; words: string[] }> = [
  {
    kind: 'back',
    words: ['go back', 'back', 'peeche', 'wapas', 'पीछे', 'वापस', 'পিছনে', 'ফিরে', 'मागे', 'వెనక్కి', 'பின்னால்', 'પાછળ', 'પાછા', 'واپس', 'پیچھے', 'ಹಿಂದೆ', 'ପଛକୁ', 'പിന്നോട്ട്', 'ਪਿੱਛੇ', 'ਵਾਪਸ', 'পিছলৈ', 'উভতি'],
  },
  {
    kind: 'home',
    words: ['home', 'main screen', 'होम', 'मुख्य पेज', 'হোম', 'मुख्यपृष्ठ', 'హోమ్', 'முகப்பு', 'હોમ', 'ہوم', 'ಮುಖಪುಟ', 'ମୁଖ୍ୟ ପୃଷ୍ଠା', 'ഹോം', 'ਹੋਮ', 'মূল পৃষ্ঠা'],
  },
  // Before "help": "helpline" contains it.
  {
    kind: 'call',
    words: ['call', 'helpline', 'kisan call', 'call centre', 'कॉल', 'हेल्पलाइन', 'फ़ोन करो', 'फोन करो', 'কল', 'ফোন করো', 'फोन करा', 'కాల్', 'ఫోన్ చేయి', 'அழை', 'கால்', 'કૉલ', 'ફોન કરો', 'کال', 'فون کرو', 'ಕರೆ', 'କଲ୍', 'ଫୋନ କର', 'വിളിക്കുക', 'ਕਾਲ', 'ਫ਼ੋਨ ਕਰੋ', 'কল কৰক'],
  },
  {
    kind: 'help',
    words: ['help', 'what can i say', 'madad', 'sahayata', 'मदद', 'सहायता', 'সাহায্য', 'मदत', 'సహాయం', 'உதவி', 'મદદ', 'مدد', 'ಸಹಾಯ', 'ସାହାଯ୍ୟ', 'സഹായം', 'ਮਦਦ', 'সহায়'],
  },
  {
    kind: 'language',
    words: ['language', 'bhasha', 'भाषा', 'ভাষা', 'భాష', 'மொழி', 'ભાષા', 'زبان', 'ಭಾಷೆ', 'ଭାଷା', 'ഭാഷ', 'ਭਾਸ਼ਾ'],
  },
  {
    kind: 'addField',
    words: ['add field', 'new field', 'add a field', 'naya khet', 'नया खेत', 'खेत जोड़', 'নতুন জমি', 'জমি যোগ', 'नवीन शेत', 'शेत जोडा', 'కొత్త పొలం', 'புதிய வயல்', 'નવું ખેતર', 'نیا کھیت', 'ಹೊಸ ಹೊಲ', 'ନୂଆ ବିଲ', 'പുതിയ വയൽ', 'ਨਵਾਂ ਖੇਤ', 'নতুন পথাৰ'],
  },
  {
    kind: 'kit',
    // "Kit" itself, in each script: "sensor" alone opens the readings instead.
    words: ['sensor kit', 'free sensor', ' kit', 'किट', 'কিট', 'కిట్', 'கிட்', 'કિટ', 'کٹ', 'ಕಿಟ್', 'କିଟ', 'കിറ്റ്', 'ਕਿੱਟ'],
  },
  {
    kind: 'alerts',
    words: ['alert', 'warning', 'chetavani', 'चेतावनी', 'अलर्ट', 'সতর্ক', 'सूचना', 'హెచ్చరిక', 'எச்சரிக்கை', 'ચેતવણી', 'انتباہ', 'ಎಚ್ಚರಿಕೆ', 'ସତର୍କ', 'മുന്നറിയിപ്പ്', 'ਚੇਤਾਵਨੀ', 'সতৰ্কবাণী'],
  },
  {
    kind: 'status',
    words: ['my field', 'how is my', 'what should i do', 'what to do', 'mera khet', 'kya karu', 'kya karna', 'मेरा खेत', 'मेरे खेत', 'खेत कैसा', 'क्या करूँ', 'क्या करूं', 'क्या करना', 'আমার জমি', 'কী করব', 'কি করব', 'माझे शेत', 'काय करू', 'నా పొలం', 'ఏమి చేయాలి', 'என் வயல்', 'என்ன செய்ய', 'મારું ખેતર', 'શું કરું', 'میرا کھیت', 'کیا کروں', 'ನನ್ನ ಹೊಲ', 'ಏನು ಮಾಡಲಿ', 'ମୋ ବିଲ', 'କ\'ଣ କରିବି', 'എന്റെ വയൽ', 'എന്ത് ചെയ്യണം', 'ਮੇਰਾ ਖੇਤ', 'ਕੀ ਕਰਾਂ', 'মোৰ পথাৰ', 'কি কৰিম'],
  },
];

function byKeyword(text: string): Intent | null {
  const q = ` ${text.toLowerCase().trim()} `;
  for (const a of ACTIONS) {
    if (a.words.some((w) => q.includes(w.toLowerCase()))) return { kind: a.kind } as Intent;
  }
  const screen = routeForSpeech(text);
  return screen ? { kind: 'nav', screen } : null;
}

/** Screens Gemini may choose between - the same names the navigator uses. */
const SCREENS = [
  'Weather', 'Market', 'Drone', 'DroneBooking', 'FieldHealthMap', 'DiseaseDetection', 'Community', 'Schemes',
  'SoilCard', 'Claim', 'SensorNodes', 'SensorKit', 'AlertsTab', 'FieldsTab', 'ProfileTab', 'Privacy',
];

async function byGemini(text: string): Promise<Intent | null> {
  if (!env.geminiApiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const prompt =
      'A farmer spoke to a farming app. Classify what they want. Reply with JSON only: ' +
      '{"intent": one of "back","home","help","language","call","addField","kit","alerts","status","nav","question", ' +
      '"screen": one of ' + JSON.stringify(SCREENS) + ' when intent is "nav"}. ' +
      '"status" = how is my field / what should I do today. "kit" = free sensor kit. "call" = phone the Kisan helpline. ' +
      'Anything asking for farming advice or information is "question". Sentence: ' + JSON.stringify(text);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return null;
    const raw = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const j = JSON.parse(raw);
    if (j.intent === 'nav') return SCREENS.includes(j.screen) ? { kind: 'nav', screen: j.screen } : null;
    if (j.intent === 'question') return { kind: 'question', text };
    if (ACTIONS.some((a) => a.kind === j.intent)) return { kind: j.intent } as Intent;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function understand(text: string, online: boolean): Promise<Intent> {
  const quick = byKeyword(text);
  if (quick) return quick;
  if (online) {
    const smart = await byGemini(text);
    if (smart) return smart;
  }
  return { kind: 'question', text };
}
