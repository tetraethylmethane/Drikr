import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { SPEECH_LOCALE } from './useLanguage';
import { Language } from '../types';

/**
 * Voice input/output for the voice-first interface.
 *
 * Speech-to-text runs on `expo-speech-recognition`. The previous implementation used
 * `@react-native-voice/voice`, which is deprecated (npm itself points here) and
 * could not be built at all on a modern toolchain: its android/build.gradle calls
 * `jcenter()`, removed from Gradle 8+, which hard-failed the Android build.
 *
 * Text-to-speech stays on expo-speech. That matters more than STT for this app — a
 * farmer who cannot read the screen can still be *told* the recommendation.
 *
 * The public shape of this hook is unchanged from the old implementation, so no
 * calling screen needed edits.
 */

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

  // Guards against a final result arriving after the user already stopped.
  const activeRef = useRef(false);

  /**
   * Availability is resolved at runtime rather than assumed: a device can lack any
   * speech recognition service, and the UI surfaces this instead of offering a mic
   * button that silently does nothing.
   */
  const [sttAvailable, setSttAvailable] = useState(false);
  useEffect(() => {
    try {
      const services = ExpoSpeechRecognitionModule.getSpeechRecognitionServices?.() ?? [];
      const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition?.() ?? false;
      setSttAvailable(services.length > 0 || onDevice);
    } catch {
      // Native module absent (Expo Go, or an unsupported platform).
      setSttAvailable(false);
    }
  }, []);

  useSpeechRecognitionEvent('start', () => {
    activeRef.current = true;
    setListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    activeRef.current = false;
    setListening(false);
    setPartial('');
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript?.trim();
    if (!transcript) return;

    if (event.isFinal) {
      activeRef.current = false;
      setListening(false);
      setPartial('');
      onResultRef.current?.(transcript);
    } else {
      // Interim text is shown live so the farmer can see they are being heard.
      setPartial(transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    activeRef.current = false;
    setListening(false);
    setPartial('');
    // "no-speech" is a normal outcome of a quiet field, not a fault worth shouting about.
    setError(event.error === 'no-speech' ? 'Did not hear anything. Try again.' : 'Could not hear that. Try again.');
  });

  useSpeechRecognitionEvent('nomatch', () => {
    activeRef.current = false;
    setListening(false);
    setPartial('');
    setError('Did not catch that. Try again.');
  });

  const startListening = useCallback(async () => {
    try {
      setError(null);
      setPartial('');

      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission is needed to ask by voice.');
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: SPEECH_LOCALE[language],
        interimResults: true,
        // One question at a time: the recogniser should stop on its own when the
        // farmer stops talking, rather than holding the mic open.
        continuous: false,
        maxAlternatives: 1,
      });
      setListening(true);
    } catch {
      setError('Voice input is unavailable on this device.');
      setListening(false);
    }
  }, [language]);

  const stopListening = useCallback(async () => {
    try {
      // stop() still delivers a final result; abort() would discard what was said.
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  // Never leave the microphone open behind a screen the user has left.
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          /* ignore */
        }
      }
      Speech.stop();
    };
  }, []);

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
