import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db, hashPIN, validatePINFormat, verifyPIN } from '../config/firebase';
import {
  getLocalCredential,
  getSession,
  markCredentialSynced,
  saveLocalCredential,
  setSession,
} from '../utils/session';
import { LANGUAGES, useLanguage } from '../hooks/useLanguage';
import { sessionChecked, signIn } from '../store/slices/userSlice';
import { useAppDispatch } from '../store/hooks';
import { colors, radii, shadow, spacing, typography } from '../theme';
import { Button, Screen } from '../components/ui';

/**
 * Phone + PIN sign-in.
 *
 * PIN rather than SMS OTP because Firebase phone auth requires billing, and a PIN
 * works with no signal at all once the account exists — which matters for the target
 * user. The PIN is SHA-256 hashed on the device; the plaintext never leaves it.
 *
 * Language selection comes first, before any other text on the screen: a farmer who
 * cannot read English should not have to navigate an English login to change it.
 */
export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language, change } = useLanguage();

  const [step, setStep] = useState<'phone' | 'pin'>('phone');
  const [isSignup, setIsSignup] = useState(false);
  const [countryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState('');
  // True when Firestore could not be reached, so the UI can say so honestly.
  const [offline, setOffline] = useState(false);

  const fullPhone = `${countryCode}${phone.replace(/\D/g, '')}`;

  /**
   * Session restore. The previous build stored a session but never checked it, so a
   * returning farmer was sent back to the login screen every launch.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await getSession();
      if (cancelled) return;
      if (session?.loggedIn && session.phoneNumber) {
        dispatch(signIn({ phoneNumber: session.phoneNumber }));
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        return;
      }
      dispatch(sessionChecked());
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, navigation]);

  const continueWithPhone = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError(t('login.invalidPhone'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', fullPhone));
      setIsSignup(!snap.exists());
      setOffline(false);
      setStep('pin');
    } catch {
      /**
       * Firestore is unreachable. Fall back to whatever this device knows.
       *
       * This previously forced login mode, which trapped a new user: the login
       * path also needs Firestore, so someone signing up for the first time with
       * no backend could never get in at all. Deciding from the local credential
       * instead means a first-time user gets the signup form and can proceed.
       */
      const local = await getLocalCredential(fullPhone);
      setIsSignup(local === null);
      setOffline(true);
      setStep('pin');
    } finally {
      setLoading(false);
    }
  };

  const finish = async (profileName?: string) => {
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    await setSession({ phoneNumber: fullPhone, sessionToken: token, loggedIn: true });
    dispatch(signIn({ phoneNumber: fullPhone, name: profileName }));
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    return token;
  };

  const handleSignup = async () => {
    if (!validatePINFormat(pin)) {
      setError(t('login.pinFormat'));
      return;
    }
    if (pin !== confirmPin) {
      setError(t('login.pinMismatch'));
      return;
    }
    setError('');
    setLoading(true);
    const pinHash = hashPIN(pin);
    // Saved before the network call, so an account created offline can still sign
    // in on this device afterwards.
    await saveLocalCredential(fullPhone, pinHash, false);

    try {
      const token = await finish();
      await setDoc(doc(db, 'users', fullPhone), {
        phoneNumber: fullPhone,
        pinHash,
        sessionToken: token,
        language,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await markCredentialSynced(fullPhone);
    } catch {
      // Already signed in locally; the profile mirrors to Firestore on a later
      // launch once it is reachable.
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!validatePINFormat(pin)) {
      setError(t('login.pinFormat'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', fullPhone));
      if (!snap.exists()) {
        setError(t('login.notFound'));
        setIsSignup(true);
        return;
      }
      const data = snap.data() as { pinHash?: string };
      if (!data.pinHash || !verifyPIN(pin, data.pinHash)) {
        setError(t('login.wrongPin'));
        return;
      }
      const token = await finish();
      await setDoc(
        doc(db, 'users', fullPhone),
        { sessionToken: token, lastLoginAt: new Date().toISOString() },
        { merge: true }
      );
    } catch {
      // Firestore unreachable: verify against the credential stored on this device.
      const local = await getLocalCredential(fullPhone);
      if (local && verifyPIN(pin, local.pinHash)) {
        await finish();
        return;
      }
      setError(
        local ? t('login.wrongPin') : t('login.connectionErrorNoLocal')
      );
    } finally {
      setLoading(false);
    }
  };

  if (restoring) {
    return (
      <Screen>
        <View style={s.restoring}>
          <Image source={require('../../assets/icon.png')} style={s.logoMark} resizeMode="contain" />
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Language first */}
          <View style={s.langRow}>
            {LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => change(l.code)}
                style={({ pressed }) => [
                  s.langChip,
                  language === l.code && s.langChipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[s.langText, language === l.code && { color: '#fff' }]}>{l.native}</Text>
              </Pressable>
            ))}
          </View>

          {/* Brand */}
          <View style={s.brand}>
            <Image source={require('../../assets/icon.png')} style={s.logoMark} resizeMode="contain" />
            <Text style={s.brandName}>DRIKR SYSTEMS</Text>
            <Text style={s.tagline}>{t('login.tagline')}</Text>
          </View>

          <View style={s.card}>
            {step === 'phone' ? (
              <>
                <Text style={s.cardTitle}>{t('login.welcome')}</Text>
                <Text style={s.cardBody}>{t('login.enterPhone')}</Text>

                <View style={s.phoneRow}>
                  <View style={s.codeBox}>
                    <Text style={s.codeText}>🇮🇳 {countryCode}</Text>
                  </View>
                  <TextInput
                    style={s.phoneInput}
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                    placeholder="98765 43210"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="phone-pad"
                    autoFocus
                    maxLength={10}
                  />
                </View>

                {error ? <Text style={s.error}>{error}</Text> : null}

                <Button
                  title={t('common.next')}
                  icon="arrow-forward"
                  onPress={() => void continueWithPhone()}
                  loading={loading}
                  disabled={phone.length < 10}
                  size="lg"
                  style={{ marginTop: spacing.lg }}
                />
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => {
                    setStep('phone');
                    setPin('');
                    setConfirmPin('');
                    setError('');
                  }}
                  style={s.backRow}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.brand} />
                  <Text style={s.backText}>{fullPhone}</Text>
                </Pressable>

                <Text style={s.cardTitle}>{isSignup ? t('login.createPin') : t('login.enterPin')}</Text>
                <Text style={s.cardBody}>{isSignup ? t('login.createPinBody') : t('login.enterPinBody')}</Text>

                <TextInput
                  style={s.pinInput}
                  value={pin}
                  onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                  secureTextEntry
                  autoFocus
                  maxLength={6}
                />

                {isSignup ? (
                  <TextInput
                    style={s.pinInput}
                    value={confirmPin}
                    onChangeText={(v) => setConfirmPin(v.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t('login.confirmPin')}
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={6}
                  />
                ) : null}

                {offline ? (
                  <View style={s.offlineBox}>
                    <Ionicons name="cloud-offline-outline" size={14} color={colors.warn} />
                    <Text style={s.offlineText}>{t('login.offlineNotice')}</Text>
                  </View>
                ) : null}

                {error ? <Text style={s.error}>{error}</Text> : null}

                <Button
                  title={isSignup ? t('login.createAccount') : t('login.signIn')}
                  onPress={() => void (isSignup ? handleSignup() : handleLogin())}
                  loading={loading}
                  disabled={pin.length < 4 || (isSignup && confirmPin.length < 4)}
                  size="lg"
                  style={{ marginTop: spacing.lg }}
                />

                <Text style={s.security}>
                  <Ionicons name="lock-closed" size={11} color={colors.textFaint} /> {t('login.pinSecurity')}
                </Text>
              </>
            )}
          </View>

          <Text style={s.footer}>{t('login.footer')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  restoring: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  langRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.md },
  langChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  langChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  langText: { ...typography.small, color: colors.textMuted, fontWeight: '700' },
  brand: { alignItems: 'center', paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  // No coloured tile behind it: the mark is black and reads best on the light
  // surface, which is how the logo is natively presented.
  logoMark: { width: 64, height: 64 },
  brandName: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: 1.8, marginTop: spacing.md },
  tagline: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 19,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadow.card,
  },
  cardTitle: { ...typography.h2, color: colors.text },
  cardBody: { ...typography.small, color: colors.textMuted, marginTop: 5, lineHeight: 19 },
  phoneRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  codeBox: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
  },
  codeText: { ...typography.bodyStrong, color: colors.text },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1,
  },
  pinInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 8,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: spacing.md },
  backText: { ...typography.small, color: colors.brand, fontWeight: '700' },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.md, lineHeight: 18 },
  offlineBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.warnBg,
  },
  offlineText: { ...typography.tiny, color: colors.warn, flex: 1, lineHeight: 16 },
  security: {
    ...typography.tiny,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 16,
  },
  footer: {
    ...typography.tiny,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 16,
  },
});
