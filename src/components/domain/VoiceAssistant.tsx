import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useVoice } from '../../hooks/useVoice';
import { useLanguage } from '../../hooks/useLanguage';
import { goTo, navRef, onRouteChange } from '../../navigation/navigationRef';
import { activeAlerts } from '../../services/alertEngine';
import { Intent, understand } from '../../services/assistant';
import { markGuided } from '../../store/slices/settingsSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { colors, radii, shadow, spacing, typography } from '../../theme';
import { Alert } from '../../types';

/**
 * The voice assistant: a mic on every screen.
 *
 * Tap it and speak - "how is my field", "read my alerts", "weather", "go
 * back", "call the helpline", "I want free sensors" - and the app does it and
 * says what it did. Anything that is not an action is asked to Kisan Mitra,
 * which answers out loud.
 *
 * It also guides: the first time a farmer opens any screen, that screen
 * explains itself in one or two spoken sentences, and "help" repeats it.
 */

const HIDE_ON = new Set(['Welcome', 'Login', 'Setup', 'KisanMitra']);
/** Home reads its own summary; setup and welcome speak for themselves. */
const NO_AUTO_GUIDE = new Set(['HomeTab', 'Welcome', 'Setup']);
const TAB_ROUTES = new Set(['HomeTab', 'FieldsTab', 'AlertsTab', 'ProfileTab']);
/** Screens with a text box along the bottom: the mic sits above it. */
const RAISED = new Set(['Community']);
const KCC = 'tel:18001801551';

/** Several routes share one screen, and one explanation. */
function guideKey(route: string | null): string | null {
  if (!route) return null;
  if (route === 'DiseaseDetection' || route === 'PestDetection') return 'Scout';
  if (route === 'Irrigation' || route === 'Nutrient' || route === 'ClimateRisk') return 'RiskDetail';
  return route;
}

const RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const worstFirst = (a: Alert, b: Alert) => (RANK[b.severity] ?? 0) - (RANK[a.severity] ?? 0) || b.createdAt - a.createdAt;

const Ctx = createContext<{ listen: () => void; listening: boolean }>({ listen: () => {}, listening: false });
export const useAssistant = () => useContext(Ctx);

export function VoiceAssistantProvider({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const signedIn = useAppSelector((s) => Boolean(s.user.profile));
  const autoSpeak = useAppSelector((s) => s.settings.autoSpeak);
  const guided = useAppSelector((s) => s.settings.guidedScreens ?? []);
  const online = useAppSelector((s) => s.telemetry.online);
  const alerts = useAppSelector((s) => s.alerts.items);
  const { plots, selectedPlotId } = useAppSelector((s) => s.farm);

  const [route, setRoute] = useState<string | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Latest values for the async handler, without re-creating it.
  const live = useRef({ alerts, plots, selectedPlotId, online, route });
  live.current = { alerts, plots, selectedPlotId, online, route };

  const show = (text: string, ms = 6000) => {
    setBubble(text);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  };

  const guideFor = (r: string | null) => {
    const key = guideKey(r);
    return key && i18n.exists(`guide.${key}`) ? t(`guide.${key}`) : null;
  };

  const statusLine = (): string => {
    const { alerts: all, plots: ps, selectedPlotId: sel } = live.current;
    const plot = ps.find((p) => p.id === sel) ?? ps[0];
    if (!plot) return t('assistant.noField');
    const top = activeAlerts(all).filter((a) => a.plotId === plot.id).sort(worstFirst)[0];
    return top ? `${plot.name}. ${top.title}. ${top.detail}` : t('assistant.allGood', { name: plot.name });
  };

  const alertsLine = (): string => {
    const list = activeAlerts(live.current.alerts).sort(worstFirst).slice(0, 3);
    if (!list.length) return t('assistant.noAlerts');
    return [t('assistant.alertsCount', { n: list.length }), ...list.map((a) => `${a.plotName}: ${a.title}`)].join('. ');
  };

  const act = async (intent: Intent, say: (s: string) => void) => {
    const opening = (screen: string) => t('assistant.opening', { name: t(`screens.${screen}`, { defaultValue: '' }) || screen });
    switch (intent.kind) {
      case 'back':
        if (navRef.isReady() && navRef.canGoBack()) navRef.goBack();
        else say(t('assistant.cantBack'));
        return;
      case 'home':
        goTo('HomeTab');
        say(opening('HomeTab'));
        return;
      case 'help':
        say(`${guideFor(live.current.route) ?? t('assistant.helpGeneral')} ${t('assistant.examples')}`);
        return;
      case 'language':
        goTo('Welcome', { change: true });
        return;
      case 'call':
        say(t('assistant.calling'));
        void Linking.openURL(KCC);
        return;
      case 'addField':
        goTo('FieldSetup');
        say(opening('FieldSetup'));
        return;
      case 'kit':
        goTo('SensorKit');
        say(opening('SensorKit'));
        return;
      case 'alerts':
        goTo('AlertsTab');
        say(alertsLine());
        return;
      case 'status':
        say(statusLine());
        return;
      case 'nav':
        goTo(intent.screen);
        say(opening(intent.screen));
        return;
      case 'question':
        // Kisan Mitra answers it, out loud when read-aloud is on.
        goTo('KisanMitra', { question: intent.text });
        return;
    }
  };

  const { listening, partial, error, sttAvailable, startListening, stopListening, speak } = useVoice({
    language,
    onResult: (text) => {
      show(`“${text}”`);
      setThinking(true);
      void understand(text, live.current.online)
        .then((intent) =>
          act(intent, (reply) => {
            show(reply, 9000);
            speak(reply);
          }),
        )
        .finally(() => setThinking(false));
    },
  });

  useEffect(() => {
    if (error) show(error, 4000);
  }, [error]);

  // Track the screen, and explain it the first time it opens.
  useEffect(
    () =>
      onRouteChange((r) => {
        setRoute(r);
        const key = guideKey(r);
        if (!r || !key || NO_AUTO_GUIDE.has(r) || !autoSpeak) return;
        if (guided.includes(key) || !i18n.exists(`guide.${key}`)) return;
        dispatch(markGuided(key));
        setTimeout(() => speak(t(`guide.${key}`)), 700);
      }),
    [autoSpeak, guided, dispatch, speak, t, i18n],
  );

  const listen = useCallback(() => {
    if (listening) void stopListening();
    else void startListening();
  }, [listening, startListening, stopListening]);

  // A slow pulse while listening, so it is obvious the phone is hearing.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!listening) return pulse.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const visible = signedIn && sttAvailable && !!route && !HIDE_ON.has(route);
  const bottom =
    insets.bottom + (route && TAB_ROUTES.has(route) ? 74 : route && RAISED.has(route) ? 84 : 20);
  const label = listening ? partial || t('assistant.listening') : thinking ? t('assistant.thinking') : bubble;

  return (
    <Ctx.Provider value={{ listen, listening }}>
      {children}
      {visible ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
          {label ? (
            <View pointerEvents="none" style={[s.bubble, { marginBottom: bottom + 70 }]}>
              <Text style={s.bubbleText} numberOfLines={5}>
                {label}
              </Text>
            </View>
          ) : null}
          <Animated.View style={[s.fabWrap, { bottom, transform: [{ scale: pulse }] }]}>
            <Pressable
              onPress={listen}
              onLongPress={() => void act({ kind: 'help' }, (r) => (show(r, 9000), speak(r)))}
              style={[s.fab, listening && s.fabOn]}
              accessibilityRole="button"
              accessibilityLabel={t('assistant.button')}
              accessibilityHint={t('assistant.hint')}
            >
              <Ionicons name={listening ? 'radio' : 'mic'} size={28} color="#fff" />
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  fabWrap: { position: 'absolute', right: spacing.lg },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
    elevation: 8,
  },
  fabOn: { backgroundColor: colors.danger },
  bubble: {
    alignSelf: 'flex-end',
    marginRight: spacing.lg,
    marginLeft: spacing.xxl,
    backgroundColor: colors.text,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 320,
  },
  bubbleText: { ...typography.body, color: '#fff', lineHeight: 21 },
});
