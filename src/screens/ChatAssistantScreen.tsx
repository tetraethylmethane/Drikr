import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Constants from 'expo-constants';

type Msg = { from: 'user' | 'bot'; text: string };

const ChatAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  // Read OpenAI key from expo config extra or environment (.env)
  const OPENAI_KEY: string = ((Constants.manifest as any)?.extra?.OPENAI_API_KEY as string) ?? process.env.OPENAI_API_KEY ?? '';

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userText = input.trim();
    setMessages(prev => [...prev, { from: 'user', text: userText }]);
    setInput('');
    setLoading(true);

    // guard if API key missing
    if (!OPENAI_KEY) {
      setMessages(prev => [
        ...prev,
        { from: 'bot', text: 'AI key not configured. Add OPENAI_API_KEY to .env and expose it via app config, then restart Expo (expo start -c).' },
      ]);
      setLoading(false);
      scrollToEnd();
      return;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: userText }],
          max_tokens: 512,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, { from: 'bot', text: `Error: ${data.error.message}` }]);
      } else {
        const botText = data?.choices?.[0]?.message?.content ?? 'No response';
        setMessages(prev => [...prev, { from: 'bot', text: botText }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { from: 'bot', text: 'Error: Unable to reach API' }]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  };

  const scrollToEnd = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  useEffect(() => {
    scrollToEnd();
  }, [messages]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Chat Assistant</Text>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((msg, idx) => (
            <View
              key={idx}
              style={[
                styles.messageRow,
                msg.from === 'user' ? styles.userRow : styles.botRow,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  msg.from === 'user' ? styles.userText : styles.botText,
                ]}
              >
                {msg.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type your message..."
            placeholderTextColor="#9aa9b8"
            style={styles.input}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={sendMessage}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#000' },
  title: { fontSize: 20, fontWeight: '700', color: '#e6f7ff', marginBottom: 8 },
  messages: { flex: 1, borderWidth: 1, borderColor: '#1f2937', borderRadius: 8, marginBottom: 8 },
  messagesContent: { padding: 12 },
  messageRow: { marginVertical: 6, maxWidth: '85%' },
  userRow: { alignSelf: 'flex-end', backgroundColor: '#0ea5e9', borderRadius: 12, padding: 8 },
  botRow: { alignSelf: 'flex-start', backgroundColor: '#1f2937', borderRadius: 12, padding: 8 },
  messageText: { fontSize: 14 },
  userText: { color: '#fff' },
  botText: { color: '#e6f7ff' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#071837', color: '#e6f7ff', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  sendButton: { marginLeft: 8, backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  sendText: { color: '#fff', fontWeight: '700' },
});

export default ChatAssistant;
