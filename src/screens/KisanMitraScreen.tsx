import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { hasCloudAi } from '../config/env';
import { ask, newMessage, suggestedPrompts } from '../services/kisanMitra';
import { usePlotState } from '../hooks/useTelemetry';
import { useLanguage } from '../hooks/useLanguage';
import { useVoice } from '../hooks/useVoice';
import { addMessage, clearChat, setThinking } from '../store/slices/chatSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { AppHeader, Badge, Card, Screen } from '../components/ui';

/**
 * Kisan Mitra — the voice-first multilingual assistant.
 *
 * The mic is the largest control on the screen, not an afterthought: the deck
 * targets farmers with low digital literacy, for whom speaking a question is far
 * easier than typing one in a script their keyboard may not handle well.
 *
 * Every answer is tagged with whether it came from the cloud model or the on-device
 * engine, so the farmer is never misled about what answered them.
 */
export default function KisanMitraScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language } = useLanguage();

  const { plot, snapshot, assessment, forecast } = usePlotState();
  const { messages, thinking } = useAppSelector((s) => s.chat);
  const autoSpeak = useAppSelector((s) => s.settings.autoSpeak);
  const online = useAppSelector((s) => s.telemetry.online);

  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || thinking) return;

      setInput('');
      dispatch(addMessage(newMessage('user', question)));
      dispatch(setThinking(true));

      const reply = await ask(question, {
        plot,
        snapshot,
        assessment,
        forecast,
        language,
      });

      dispatch(addMessage(newMessage('assistant', reply.text, reply.offline)));
      dispatch(setThinking(false));
      if (autoSpeak) speak(reply.text);
    },
    [thinking, dispatch, plot, snapshot, assessment, forecast, language, autoSpeak]
  );

  const { listening, partial, speaking, error, sttAvailable, startListening, stopListening, speak, stopSpeaking } =
    useVoice({ language, onResult: (text) => void send(text) });

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(id);
  }, [messages.length, thinking]);

  const prompts = suggestedPrompts(language);

  return (
    <Screen edges={['top']}>
      <AppHeader
        title={t('mitra.title')}
        subtitle={plot ? `${plot.name} · ${t('mitra.grounded')}` : t('mitra.subtitle')}
        onBack={() => navigation.goBack()}
        right={
          messages.length > 0 ? (
            <Pressable onPress={() => dispatch(clearChat())} hitSlop={10} accessibilityLabel={t('mitra.clear')}>
              <Ionicons name="trash-outline" size={19} color={colors.textMuted} />
            </Pressable>
          ) : undefined
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <>
              <Card style={s.introCard}>
                <View style={s.introRow}>
                  <View style={s.introIcon}>
                    <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.introTitle}>{t('mitra.introTitle')}</Text>
                    <Text style={s.introBody}>{t('mitra.introBody')}</Text>
                  </View>
                </View>

                <View style={s.capRow}>
                  <Badge
                    label={hasCloudAi() && online ? t('mitra.cloudMode') : t('mitra.offlineMode')}
                    tone={hasCloudAi() && online ? 'info' : 'ok'}
                    icon={hasCloudAi() && online ? 'cloud' : 'phone-portrait'}
                  />
                  {snapshot ? <Badge label={t('mitra.liveData')} tone="ok" icon="pulse" /> : null}
                  {!sttAvailable ? <Badge label={t('mitra.noMic')} tone="warn" icon="mic-off" /> : null}
                </View>
              </Card>

              <Text style={s.promptsTitle}>{t('mitra.tryAsking')}</Text>
              <View style={s.prompts}>
                {prompts.map((p) => (
                  <Pressable
                    key={p}
                    style={({ pressed }) => [s.promptChip, pressed && { opacity: 0.75 }]}
                    onPress={() => void send(p)}
                  >
                    <Text style={s.promptText}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {messages.map((m) => (
            <View key={m.id} style={[s.bubbleRow, m.role === 'user' ? s.bubbleRowUser : null]}>
              <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleBot]}>
                <Text style={[s.bubbleText, m.role === 'user' ? s.bubbleTextUser : null]}>{m.text}</Text>
                <View style={s.bubbleMeta}>
                  <Text style={[s.bubbleTime, m.role === 'user' ? { color: '#FFFFFFAA' } : null]}>
                    {new Date(m.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  {m.role === 'assistant' ? (
                    <>
                      {m.offline ? (
                        <View style={s.offlineTag}>
                          <Ionicons name="phone-portrait-outline" size={9} color={colors.textFaint} />
                          <Text style={s.offlineTagText}>{t('mitra.onDevice')}</Text>
                        </View>
                      ) : null}
                      <Pressable onPress={() => speak(m.text)} hitSlop={8} accessibilityLabel={t('alerts.readAloud')}>
                        <Ionicons name="volume-medium-outline" size={14} color={colors.brandLight} />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            </View>
          ))}

          {thinking ? (
            <View style={s.bubbleRow}>
              <View style={[s.bubble, s.bubbleBot, s.thinkingBubble]}>
                <ActivityIndicator size="small" color={colors.brandLight} />
                <Text style={s.thinkingText}>{t('mitra.thinking')}</Text>
              </View>
            </View>
          ) : null}

          {listening ? (
            <View style={s.listeningCard}>
              <View style={s.listeningDot} />
              <Text style={s.listeningText}>{partial || t('mitra.listening')}</Text>
            </View>
          ) : null}

          {error ? <Text style={s.errorText}>{error}</Text> : null}
        </ScrollView>

        {/* Composer: mic first, matching the voice-first intent */}
        <View style={s.composer}>
          <Pressable
            onPress={listening ? stopListening : startListening}
            style={({ pressed }) => [
              s.micBtn,
              listening && s.micBtnActive,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel={listening ? t('mitra.stopListening') : t('mitra.startListening')}
          >
            <Ionicons name={listening ? 'stop' : 'mic'} size={22} color={listening ? '#fff' : colors.brand} />
          </Pressable>

          <TextInput
            style={s.input}
            placeholder={t('mitra.placeholder')}
            placeholderTextColor={colors.textFaint}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void send(input)}
            returnKeyType="send"
            multiline
            maxLength={500}
          />

          {speaking ? (
            <Pressable onPress={stopSpeaking} style={s.sendBtn} accessibilityLabel={t('mitra.stopSpeaking')}>
              <Ionicons name="volume-mute" size={20} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void send(input)}
              disabled={!input.trim() || thinking}
              style={({ pressed }) => [
                s.sendBtn,
                (!input.trim() || thinking) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel={t('mitra.send')}
            >
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { paddingBottom: spacing.lg, paddingTop: spacing.sm },
  introCard: { backgroundColor: colors.surfaceAlt, borderColor: colors.brandLight + '2A' },
  introRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  introIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: { ...typography.h3, color: colors.text },
  introBody: { ...typography.small, color: colors.textMuted, marginTop: 4, lineHeight: 19 },
  capRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: spacing.md },
  promptsTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  prompts: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  promptChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  promptText: { ...typography.small, color: colors.text },
  bubbleRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm, alignItems: 'flex-start' },
  bubbleRowUser: { alignItems: 'flex-end' },
  bubble: { maxWidth: '88%', borderRadius: radii.lg, padding: spacing.md },
  bubbleBot: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 5,
  },
  bubbleUser: { backgroundColor: colors.brand, borderTopRightRadius: 5 },
  bubbleText: { ...typography.body, color: colors.text, lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  bubbleTime: { ...typography.tiny, color: colors.textFaint },
  offlineTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  offlineTagText: { fontSize: 9, fontWeight: '600', color: colors.textFaint },
  thinkingBubble: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thinkingText: { ...typography.small, color: colors.textMuted },
  listeningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerBg,
  },
  listeningDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger },
  listeningText: { ...typography.small, color: colors.danger, flex: 1, fontWeight: '600' },
  errorText: {
    ...typography.tiny,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  micBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.brand + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingTop: 13,
    paddingBottom: 13,
    ...typography.body,
    color: colors.text,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
