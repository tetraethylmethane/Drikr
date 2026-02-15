import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CommunityScreen() {
  const [messages, setMessages] = useState<Array<{ id: string; author: string; text: string; time: string }>>([]);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<any> | null>(null);

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg = { id: Date.now().toString(), author: 'You', text: input.trim(), time: 'Now' };
    setMessages((m) => [...m, newMsg]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 50);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Community Forum</Text>
        <Text style={styles.subtitle}>Join groups and chat</Text>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 100}
        style={{ flex: 1 }}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: true })}
          contentContainerStyle={styles.messagesList}
          renderItem={({ item }) => (
            <View style={styles.messageRow}>
              <View style={styles.msgAvatar}>
                <Text style={styles.avatarText}>{item.author[0]}</Text>
              </View>
              <View style={styles.msgBody}>
                <Text style={styles.msgAuthor}>{item.author} <Text style={styles.msgTime}>{item.time}</Text></Text>
                <Text style={styles.msgText}>{item.text}</Text>
              </View>
            </View>
          )}
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            placeholder={`Type a message...`}
            placeholderTextColor="#9aa9b8"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendMessage}
            onFocus={() => setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 150)}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    backgroundColor: '#071837',
    padding: 20,
    paddingTop: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e6f7ff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9fbfe6',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#071837',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#11324a',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    color: '#e6f7ff',
  },
  postCard: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0b6b3a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  postInfo: {
    flex: 1,
  },
  author: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e6f7ff',
  },
  time: {
    fontSize: 12,
    color: '#9aa9b8',
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e6f7ff',
    marginBottom: 8,
  },
  postContent: {
    fontSize: 14,
    color: '#9aa9b8',
    lineHeight: 20,
    marginBottom: 12,
  },
  postActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 14,
    color: '#9aa9b8',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 40,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  msgAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0b6b3a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  msgBody: {
    flex: 1,
    backgroundColor: '#071837',
    padding: 12,
    borderRadius: 8,
  },
  msgAuthor: {
    fontSize: 13,
    color: '#e6f7ff',
    fontWeight: '600',
    marginBottom: 4,
  },
  msgTime: {
    fontSize: 11,
    color: '#9aa9b8',
    fontWeight: '400',
  },
  msgText: {
    fontSize: 14,
    color: '#9aa9b8',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#11324a',
    backgroundColor: '#000000',
  },
  inputField: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#11324a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#071837',
    color: '#e6f7ff',
  },
  sendBtn: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendText: {
    color: '#021427',
    fontWeight: '700',
  },
});
