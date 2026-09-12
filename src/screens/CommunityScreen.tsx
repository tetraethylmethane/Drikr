import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { cropProfile } from '../config/agronomy';
import { enqueue } from '../services/offline';
import { formatAge } from '../services/offline';
import { usePlotState } from '../hooks/useTelemetry';
import { addPost, addReply, toggleLike } from '../store/slices/communitySlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { CommunityPost } from '../types';
import { AppHeader, Badge, Card, Pill, Screen } from '../components/ui';

/**
 * Farmer-to-farmer knowledge sharing.
 *
 * Posts are written locally first and queued for sync, so a farmer standing in a
 * field with no signal can still record what worked while it is fresh — which is
 * exactly when the advice is worth capturing.
 */
export default function CommunityScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const posts = useAppSelector((s) => s.community.posts);
  const profile = useAppSelector((s) => s.user.profile);
  const online = useAppSelector((s) => s.telemetry.online);
  const { plot } = usePlotState();

  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'all' | 'myCrop'>('all');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const author = profile?.name ?? (profile?.phoneNumber ? `${profile.phoneNumber.slice(-4)}` : t('community.you'));
  const myCrop = plot ? cropProfile(plot.crop).label : null;

  const filtered = useMemo(() => {
    if (filter === 'myCrop' && myCrop) {
      return posts.filter((p) => p.crop?.toLowerCase() === myCrop.toLowerCase());
    }
    return posts;
  }, [posts, filter, myCrop]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    const post: CommunityPost = {
      id: `p-${Date.now()}`,
      author,
      district: profile?.district,
      crop: myCrop ?? undefined,
      text: body,
      at: Date.now(),
      likes: 0,
      replies: [],
    };
    dispatch(addPost(post));
    void enqueue('communityPost', post);
    setText('');
  };

  const submitReply = (postId: string) => {
    const body = replyText.trim();
    if (!body) return;
    dispatch(addReply({ postId, author, text: body }));
    setReplyText('');
    setReplyTo(null);
  };

  return (
    <Screen edges={['top']}>
      <AppHeader
        title={t('community.title')}
        subtitle={t('community.subtitle')}
        right={!online ? <Badge label={t('community.willSync')} tone="warn" icon="cloud-offline" /> : undefined}
      />

      {myCrop ? (
        <View style={s.filters}>
          <Pill label={t('community.allPosts')} active={filter === 'all'} onPress={() => setFilter('all')} />
          <Pill label={myCrop} active={filter === 'myCrop'} onPress={() => setFilter('myCrop')} icon="leaf" />
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Card>
              <View style={s.postTop}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{item.author.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.author}>{item.author}</Text>
                  <Text style={s.postMeta}>
                    {[item.district, item.crop].filter(Boolean).join(' · ')}
                    {item.district || item.crop ? ' · ' : ''}
                    {formatAge(item.at)}
                  </Text>
                </View>
                {item.crop ? <Badge label={item.crop} tone="neutral" /> : null}
              </View>

              <Text style={s.postText}>{item.text}</Text>

              <View style={s.postActions}>
                <Pressable
                  onPress={() => dispatch(toggleLike(item.id))}
                  hitSlop={8}
                  style={s.actionBtn}
                  accessibilityLabel={t('community.helpful')}
                >
                  <Ionicons
                    name={item.likedByMe ? 'heart' : 'heart-outline'}
                    size={16}
                    color={item.likedByMe ? colors.danger : colors.textMuted}
                  />
                  <Text style={[s.actionText, item.likedByMe && { color: colors.danger }]}>{item.likes}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setReplyTo(replyTo === item.id ? null : item.id)}
                  hitSlop={8}
                  style={s.actionBtn}
                >
                  <Ionicons name="chatbubble-outline" size={15} color={colors.textMuted} />
                  <Text style={s.actionText}>{item.replies.length}</Text>
                </Pressable>
              </View>

              {item.replies.length > 0 ? (
                <View style={s.replies}>
                  {item.replies.map((r) => (
                    <View key={r.id} style={s.reply}>
                      <Text style={s.replyAuthor}>{r.author}</Text>
                      <Text style={s.replyText}>{r.text}</Text>
                      <Text style={s.replyTime}>{formatAge(r.at)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {replyTo === item.id ? (
                <View style={s.replyComposer}>
                  <TextInput
                    style={s.replyInput}
                    placeholder={t('community.replyPlaceholder')}
                    placeholderTextColor={colors.textFaint}
                    value={replyText}
                    onChangeText={setReplyText}
                    onSubmitEditing={() => submitReply(item.id)}
                    returnKeyType="send"
                    autoFocus
                  />
                  <Pressable onPress={() => submitReply(item.id)} style={s.replySend}>
                    <Ionicons name="arrow-up" size={16} color="#fff" />
                  </Pressable>
                </View>
              ) : null}
            </Card>
          )}
        />

        <View style={s.composer}>
          <TextInput
            style={s.input}
            placeholder={t('community.placeholder')}
            placeholderTextColor={colors.textFaint}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={600}
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim()}
            style={({ pressed }) => [s.sendBtn, !text.trim() && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
            accessibilityLabel={t('community.post')}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  filters: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  postTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  author: { ...typography.bodyStrong, color: colors.text },
  postMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  postText: { ...typography.body, color: colors.text, lineHeight: 21, marginTop: spacing.md },
  postActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  replies: { marginTop: spacing.md, gap: spacing.sm, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.surfaceSunken },
  reply: { gap: 2 },
  replyAuthor: { ...typography.tiny, color: colors.brand, fontWeight: '700' },
  replyText: { ...typography.small, color: colors.text, lineHeight: 18 },
  replyTime: { fontSize: 9.5, color: colors.textFaint },
  replyComposer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  replyInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.small,
    color: colors.text,
  },
  replySend: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
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
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...typography.body,
    color: colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
