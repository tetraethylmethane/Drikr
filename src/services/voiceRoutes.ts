/**
 * Spoken navigation: "mausam batao", "मंडी भाव", "ড্রোন" opens the right screen.
 *
 * Keywords cover all 13 app languages plus common Latin-script spellings. A
 * request that matches nothing is not an error - it goes to Kisan Mitra as a
 * question, which is what a farmer speaking to the app usually means anyway.
 */
const ROUTES: Array<{ screen: string; words: string[] }> = [
  {
    screen: 'Weather',
    words: ['weather', 'mausam', 'barish', 'rain', 'मौसम', 'बारिश', 'আবহাওয়া', 'বৃষ্টি', 'हवामान', 'पाऊस', 'వాతావరణ', 'వర్షం', 'வானிலை', 'மழை', 'હવામાન', 'વરસાદ', 'موسم', 'بارش', 'ಹವಾಮಾನ', 'ಮಳೆ', 'ପାଣିପାଗ', 'ବର୍ଷା', 'കാലാവസ്ഥ', 'മഴ', 'ਮੌਸਮ', 'ਮੀਂਹ', 'বতৰ', 'বৰষুণ'],
  },
  {
    screen: 'Market',
    words: ['price', 'mandi', 'market', 'bhav', 'rate', 'भाव', 'मंडी', 'दाम', 'বাজার', 'দাম', 'बाजार', 'ధర', 'మార్కెట్', 'விலை', 'சந்தை', 'ભાવ', 'બજાર', 'قیمت', 'منڈی', 'بھاؤ', 'ಬೆಲೆ', 'ಮಾರುಕಟ್ಟೆ', 'ଦାମ', 'ବଜାର', 'വില', 'ചന്ത', 'ਭਾਅ', 'ਮੰਡੀ', 'বজাৰ'],
  },
  {
    screen: 'Claim',
    words: ['insurance', 'bima', 'pmfby', 'claim', 'बीमा', 'বীমা', 'विमा', 'బీమా', 'காப்பீடு', 'વીમો', 'بیمہ', 'ವಿಮೆ', 'ବୀମା', 'ഇൻഷുറൻസ്', 'ਬੀਮਾ'],
  },
  {
    screen: 'DroneBooking',
    words: ['kiraya', 'kiraye', 'book drone', 'hire', 'किराय', 'भाड़े', 'ভাড়া', 'भाड्या', 'అద్దె', 'வாடகை', 'ભાડે', 'کرایہ', 'ಬಾಡಿಗೆ', 'ଭଡ଼ା', 'വാടക', 'ਕਿਰਾਏ', 'ভাড়া'],
  },
  {
    screen: 'Drone',
    words: ['drone', 'ड्रोन', 'ড্রোন', 'డ్రోన్', 'ட்ரோன்', 'ડ્રોન', 'ڈرون', 'ಡ್ರೋನ್', 'ଡ୍ରୋନ', 'ഡ്രോൺ', 'ਡਰੋਨ', 'ড্ৰোন'],
  },
  {
    screen: 'SoilCard',
    words: ['soil card', 'soil health', 'mitti', 'मिट्टी', 'मृदा', 'মাটি', 'माती', 'నేల', 'மண்', 'માટી', 'مٹی', 'ಮಣ್ಣು', 'ମାଟି', 'മണ്ണ്', 'ਮਿੱਟੀ'],
  },
  {
    screen: 'Schemes',
    words: ['yojana', 'scheme', 'pm kisan', 'kisan samman', 'msp', 'योजना', 'सम्मान', 'প্রকল্প', 'పథకం', 'திட்டம்', 'યોજના', 'اسکیم', 'ಯೋಜನೆ', 'ଯୋଜନା', 'പദ്ധതി', 'ਯੋਜਨਾ', 'আঁচনি'],
  },
  {
    screen: 'FieldHealthMap',
    words: ['map', 'naksha', 'नक्शा', 'मानचित्र', 'মানচিত্র', 'नकाशा', 'మ్యాప్', 'வரைபடம்', 'નકશો', 'نقشہ', 'ನಕ್ಷೆ', 'ମାନଚିତ୍ର', 'മാപ്പ്', 'ਨਕਸ਼ਾ', 'মানচিত্ৰ'],
  },
  {
    screen: 'DiseaseDetection',
    words: ['photo', 'camera', 'फोटो', 'फ़ोटो', 'ছবি', 'ఫోటో', 'புகைப்படம்', 'ફોટો', 'تصویر', 'ಫೋಟೋ', 'ଫଟୋ', 'ഫോട്ടോ', 'ਫ਼ੋਟੋ', 'ফটো'],
  },
  {
    screen: 'SensorNodes',
    words: ['sensor', 'reading', 'सेंसर', 'सेन्सर', 'রিডিং', 'সেন্সর', 'సెన్సార్', 'சென்சார்', 'સેન્સર', 'سینسر', 'ಸೆನ್ಸರ್', 'ସେନ୍ସର', 'സെൻസർ', 'ਸੈਂਸਰ', 'চেন্সৰ'],
  },
  {
    screen: 'Community',
    words: ['community', 'other farmers', 'समुदाय', 'সমাজ', 'समुदाय', 'సంఘం', 'சமூகம்', 'સમુદાય', 'برادری', 'ಸಮುದಾಯ', 'ସମାଜ', 'സമൂഹം', 'ਭਾਈਚਾਰਾ'],
  },
];

/** The screen the farmer asked for, or null when it reads like a question. */
export function routeForSpeech(text: string): string | null {
  const q = ` ${text.toLowerCase()} `;
  let best: string | null = null;
  let hits = 0;
  for (const r of ROUTES) {
    const n = r.words.filter((w) => q.includes(w.toLowerCase())).length;
    if (n > hits) {
      hits = n;
      best = r.screen;
    }
  }
  return best;
}
