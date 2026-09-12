import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { SPEECH_LOCALE } from './useLanguage';
import { Language } from '../types';

/**
 * Voice input/output for the voice-first interface.
 *
 * `@react-native-voice/voice` is a native module: it is absent in Expo Go, so the
 * import is guarded and `sttAvailable` reports the truth to the UI rather than the
 * mic button failing silently. Text-to-speech (expo-speech) works everywhere, which
 * matters most — a farmer who cannot read the screen can still be *told* the
 * recommendation.
 */

type VoiceModule = {
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  removeAllListeners: () => void;
  onSpeechStart?: (e: unknown) => void;
  onSpeechEnd?: (e: unknown) => void;
  onSpeechResults?: (e: { value?: string[] }) => void;
  onSpeechPartialResults?: (e: { value?: string[] }) => void;
  onSpeechError?: (e: unknown) => void;
};

let VoiceImpl: VoiceModule | null = null;
let voiceLoadFailed = false;

function loadVoice(): VoiceModule | null {
  if (VoiceImpl || voiceLoadFailed) return VoiceImpl;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-voice/voice');
    VoiceImpl = (mod?.default ?? mod) as VoiceModule;
    // In Expo Go the JS module resolves but the native side is missing.
    if (typeof VoiceImpl?.start !== 'function') {
      VoiceImpl = null;
      voiceLoadFailed = true;
    }
  } catch {
    voiceLoadFailed = true;
    VoiceImpl = null;
  }
  return VoiceImpl;
}

export interface UseVoiceOptions {
  language: Language;
  onResult?: (text: string) => void;
}

export function useVoice({ language, onResult }: UseVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const voice = loadVoice();
  const sttAvailable = voice !== null;

  useEffect(() => {
    if (!voice) return;

    voice.onSpeechStart = () => {
      setListening(true);
      setError(null);
    };
    voice.onSpeechEnd = () => setListening(false);
    voice.onSpeechPartialResults = (e) => {
      if (e.value?.[0]) setPartial(e.value[0]);
    };
    voice.onSpeechResults = (e) => {
      const text = e.value?.[0];
      setListening(false);
      setPartial('');
      if (text) onResultRef.current?.(text);
    };
    voice.onSpeechError = () => {
      setListening(false);
      setPartial('');
      setError('Could not hear that. Try again.');
    };

    return () => {
      voice.destroy().then(() => voice.removeAllListeners()).catch(() => undefined);
    };
  }, [voice]);

  const startListening = useCallback(async () => {
    if (!voice) {
      setError('Voice input needs a development build (not available in Expo Go).');
      return;
    }
    try {
      setPartial('');
      setError(null);
      await voice.start(SPEECH_LOCALE[language]);
      setListening(true);
    } catch {
      setError('Could not start the microphone.');
      setListening(false);
    }
  }, [voice, language]);

  const stopListening = useCallback(async () => {
    if (!voice) return;
    try {
      await voice.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, [voice]);

  const speak = useCallback(
    (text: string) => {
      // Strip bullets and markers so TTS does not read punctuation aloud.
      const clean = text.replace(/[•*_#]/g, '').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      Speech.stop();
      setSpeaking(true);
      Speech.speak(clean, {
        language: SPEECH_LOCALE[language],
        pitch: 1.0,
        rate: 0.92,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    },
    [language]
  );

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    setSpeaking(false);
  }, []);

  return {
    listening,
    partial,
    speaking,
    error,
    sttAvailable,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
