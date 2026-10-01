import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert as RNAlert,
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
import { currentUid, ensureSignedIn } from '../config/firebase';
import { enqueue, formatAge } from '../services/offline';
import { amIExpert, hidePost, reportPost, watchCommunity } from '../services/sync';
import { translateText, translationReady } from '../services/translate';
import { usePlotState } from '../hooks/useTelemetry';
import { addPost, setRemote, toggleLike } from '../store/slices/communitySlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, typography } from '../theme';
import { CommunityPost } from '../types';
import { AppHeader, Badge, Card, EmptyState, Pill, Screen } from '../components/ui';

/**
 * Farmer-to-farmer knowledge sharing, live across every phone.
 *
 * Posts are written locally first and queued, so a farmer with no signal can
 * still record what worked; the shared feed comes from Firestore. Posts show a
 * name and district, never a phone number. Anyone can report a post; moderators
 * (agriculture experts the team adds) can hide it, and their own posts carry an
 * "Expert" badge so farmers know whose advice is checked.
 */
export default function CommunityScreen() {
  const dispatch = useAppDispatch();
  const { t, i18n } = useTranslation();

  const local = useAppSelector((s) => s.community.posts ?? []);
  const remote = useAppSelector((s) => s.community.remote ?? []);
  const liked = useAppSelector((s) => s.community.liked ?? {});
  const profile = useAppSelector((s) => s.user.profile);
  const online = useAppSelector((s) => s.telemetry.online);
  const { plot } = usePlotState();

  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'all' | 'myCrop'>('all');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [expert, setExpert] = useState(false);

  useEffect(() => {
    let stop = () => {};
    let alive = true;
    void (async () => {
      await ensureSignedIn();
      if (!alive) return;
      void amIExpert().then((e) => alive && setExpert(e));
      stop = watchCommunity((rows) => {
        const posts = rows
          // Old-format posts carried a phone number as the author; they are not shown.
          .filter((r) => typeof r.authorUid === 'string' && r.authorUid && !r.hidden)
          .map(
            (r): CommunityPost => ({
              id: String(r.id),
              author: String(r.author ?? ''),
              authorUid: String(r.authorUid),
              district: r.district ? String(r.district) : undefined,
              cropKey: r.cropKey ? String(r.cropKey) : undefined,
              text: String(r.text ?? ''),
              at: Number(r.at) || 0,
              likes: Number(r.likes) || 0,
              replies: [],
              expert: Boolean(r.expert),
              replyTo: r.replyTo ? String(r.replyTo) : undefined,
              lang: r.lang ? String(r.lang) : undefined,
            })
          );
        dispatch(setRemote(posts));
      }, 200);
    })();
    return () => {
      alive = false;
      stop();
    };
  }, [dispatch]);

  const author = profile?.name?.trim() || t('community.farmer');
  const myCropKey = plot ? cropProfile(plot.crop).key : null;

  // Merge: the server copy wins; a local post shows until it has uploaded.
  const all = useMemo(() => {
    const byId = new Map<string, CommunityPost>();
    for (const p of local) if (!p.id.startsWith('seed-')) byId.set(p.id, p);
    for (const p of remote) byId.set(p.id, p);
    return Array.from(byId.values()).sort((a, b) => b.at - a.at);
  }, [local, remote]);

  const replies = useMemo(() => {
    const m: Record<string, CommunityPost[]> = {};
    for (const p of all) if (p.replyTo) (m[p.replyTo] ??= []).push(p);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.at - b.at);
    return m;
  }, [all]);

  const top = useMemo(() => {
    const posts = all.filter((p) => !p.replyTo);
    return filter === 'myCrop' && myCropKey ? posts.filter((p) => p.cropKey === myCropKey) : posts;
  }, [all, filter, myCropKey]);

  const publish = (body: string, parent?: string) => {
    const post: CommunityPost = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author,
      authorUid: currentUid() ?? undefined,
      district: profile?.district,
      cropKey: myCropKey ?? undefined,
      text: body,
      at: Date.now(),
      likes: 0,
      replies: [],
      ...(expert ? { expert: true } : null),
      ...(parent ? { replyTo: parent } : null),
      lang: i18n.language,
    };
    dispatch(addPost(post));
    void enqueue('communityPost', post);
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    publish(body);
    setText('');
  };

  const submitReply = (postId: string) => {
    const body = replyText.trim();
    if (!body) return;
    publish(body, postId);
    setReplyText('');
    setReplyTo(null);
  };

  const report = (post: CommunityPost) => {
    const send = (reason: string) =>
      void reportPost(post.id, reason).then((ok) =>
        RNAlert.alert(ok ? t('community.reported') : t('community.reportFailed'))
      );
    RNAlert.alert(t('community.reportTitle'), t('community.reportBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('community.reasonWrong'), onPress: () => send('wrong advice') },
      { text: t('community.reasonAbuse'), onPress: () => send('abuse or spam') },
    ]);
  };

  const hide = (post: CommunityPost) =>
    RNAlert.alert(t('community.hideTitle'), post.text.slice(0, 120), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('community.hide'), style: 'destructive', onPress: () => void hidePost(post.id) },
    ]);

  const mine = (p: CommunityPost) => p.authorUid != null && p.authorUid === currentUid();

  return (
    <Screen edges={['top']}>
      <AppHeader
        title={t('community.title')}
        subtitle={t('community.subtitle')}
        right={!online ? <Badge label={t('community.willSync')} tone="warn" icon="cloud-offline" /> : undefined}
      />

      {myCropKey ? (
        <View style={s.filters}>
          <Pill label={t('community.allPosts')} active={filter === 'all'} onPress={() => setFilter('all')} />
          <Pill
            label={cropProfile(myCropKey).label}
            active={filter === 'myCrop'}
            onPress={() => setFilter('myCrop')}
            icon="leaf"
          />
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={top}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<Text style={s.rules}>{t('community.rules')}</Text>}
          ListEmptyComponent={
            <EmptyState icon="people-outline" title={t('community.emptyTitle')} body={t('community.emptyBody')} />
          }
          renderItem={({ item }) => (
            <Card>
              <View style={s.postTop}>
                <View style={[s.avatar, item.expert && { backgroundColor: colors.brand }]}>
                  <Text style={s.avatarText}>{(item.author || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.author}>{item.author}</Text>
                  <Text style={s.postMeta}>
                    {[item.district, item.cropKey ? cropProfile(item.cropKey).label : null].filter(Boolean).join(' · ')}
                    {item.district || item.cropKey ? ' · ' : ''}
                    {formatAge(item.at)}
                  </Text>
                </View>
                {item.expert ? <Badge label={t('community.expert')} tone="ok" icon="ribbon" /> : null}
              </View>

              <PostText text={item.text} lang={item.lang} style={s.postText} />

              <View style={s.postActions}>
                <Pressable
                  onPress={() => dispatch(toggleLike(item.id))}
                  hitSlop={8}
                  style={s.actionBtn}
                  accessibilityLabel={t('community.helpful')}
                >
                  <Ionicons
                    name={liked[item.id] ? 'thumbs-up' : 'thumbs-up-outline'}
                    size={16}
                    color={liked[item.id] ? colors.brand : colors.textMuted}
                  />
                  <Text style={[s.actionText, liked[item.id] && { color: colors.brand }]}>{t('community.helpful')}</Text>
                </Pressable>
                <Pressable onPress={() => setReplyTo(replyTo === item.id ? null : item.id)} hitSlop={8} style={s.actionBtn}>
                  <Ionicons name="chatbubble-outline" size={15} color={colors.textMuted} />
                  <Text style={s.actionText}>{(replies[item.id] ?? []).length}</Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                {expert && !mine(item) ? (
                  <Pressable onPress={() => hide(item)} hitSlop={8} style={s.actionBtn} accessibilityLabel={t('community.hide')}>
                    <Ionicons name="eye-off-outline" size={15} color={colors.textMuted} />
                  </Pressable>
                ) : null}
                {!mine(item) ? (
                  <Pressable onPress={() => report(item)} hitSlop={8} style={s.actionBtn} accessibilityLabel={t('community.report')}>
                    <Ionicons name="flag-outline" size={15} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {(replies[item.id] ?? []).length > 0 ? (
                <View style={s.replies}>
                  {(replies[item.id] ?? []).map((r) => (
                    <View key={r.id} style={s.reply}>
                      <Text style={s.replyAuthor}>
                        {r.author}
                        {r.expert ? ` · ${t('community.expert')}` : ''}
                      </Text>
                      <PostText text={r.text} lang={r.lang} style={s.replyText} />
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
                    maxLength={600}
                    autoFocus
                  />
                  <Pressable onPress={() => submitReply(item.id)} style={s.replySend} accessibilityLabel={t('community.post')}>
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

/**
 * A post's text, with a Translate link when it was written in another
 * language and Bhashini is configured. Tapping again shows the original.
 */
function PostText({ text, lang, style }: { text: string; lang?: string; style: object }) {
  const { t, i18n } = useTranslation();
  const mine = i18n.language;
  const foreign = !!lang && lang !== mine;
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setShown(null);
    if (foreign) void translationReady().then(setReady);
  }, [foreign, mine]);

  const toggle = async () => {
    if (shown) return setShown(null);
    setBusy(true);
    const out = await translateText(text, lang!, mine);
    setBusy(false);
    if (out) setShown(out);
    else RNAlert.alert(t('community.translateFailed'));
  };

  return (
    <View>
      <Text style={style}>{shown ?? text}</Text>
      {foreign && ready ? (
        <Pressable onPress={() => void toggle()} hitSlop={8} disabled={busy} style={s.translateBtn}>
          <Ionicons name="language-outline" size={14} color={colors.brand} />
          <Text style={s.translateText}>
            {busy ? t('community.translating') : shown ? t('community.showOriginal') : t('community.translate')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  translateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' },
  translateText: { ...typography.small, color: colors.brand, fontWeight: '700' },
  filters: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  rules: { ...typography.tiny, color: colors.textMuted, marginHorizontal: spacing.lg, marginBottom: spacing.sm, lineHeight: 16 },
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
