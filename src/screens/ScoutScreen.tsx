import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { cropProfile, INPUT_SUGGESTIONS } from '../config/agronomy';
import { hasTelemetryBackend } from '../config/env';
import { proposeMission } from '../services/drone';
import { enqueue } from '../services/offline';
import { usePlotState } from '../hooks/useTelemetry';
import { useLanguage } from '../hooks/useLanguage';
import { useVoice } from '../hooks/useVoice';
import { proposeMissionAction } from '../store/slices/droneSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { colors, radii, spacing, spacing as sp, typography } from '../theme';
import { RiskDomain } from '../types';
import { AppHeader, Badge, Button, Card, ConfidenceBar, Screen, SectionTitle } from '../components/ui';
import { DriverList, RecommendationList, riskTone } from '../components/domain';

/**
 * Field scouting for disease and pest — one screen, two entry points.
 *
 * Honesty matters here. The previous build returned a hard-coded "Leaf Spot, 92%
 * accurate" from a setTimeout, which is the kind of thing that destroys trust the
 * first time a farmer sprays on it and is wrong.
 *
 * What this screen actually does:
 *  - Reports the sensor-based risk for the domain, which is real: it comes from the
 *    decision engine using live leaf wetness, humidity, VOC and the electrochemical
 *    biosensor current.
 *  - Lets the farmer photograph the symptom and queues it for the image model. Image
 *    classification runs server-side (the PlantVillage/FieldPlant-trained CNN in the
 *    deck's references); with no backend configured the photo is stored and labelled
 *    as pending rather than given an invented verdict.
 *  - Records what the farmer actually found, which is the ground truth the model
 *    improvement loop needs.
 */
export default function ScoutScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { speak } = useVoice({ language });

  const domain: RiskDomain = route.params?.domain === 'pest' ? 'pest' : 'cropHealth';
  const { plot, snapshot, map, assessment, forecast } = usePlotState();
  const online = useAppSelector((s) => s.telemetry.online);
  const confidenceThreshold = useAppSelector((s) => s.settings.confidenceThreshold);

  const [image, setImage] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const risk = useMemo(
    () => assessment?.risks.find((r) => r.domain === domain) ?? null,
    [assessment, domain]
  );

  const crop = plot ? cropProfile(plot.crop) : null;
  const candidates = crop ? (domain === 'pest' ? crop.commonPests : crop.commonDiseases) : [];

  const capture = async (mode: 'camera' | 'library') => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
    };
    const result =
      mode === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      setSubmitted(false);
    }
  };

  const submit = async () => {
    if (!plot) return;
    setSubmitting(true);
    // Queued as ground truth for the model-improvement loop. With no backend this
    // stays on the device until one is configured — nothing is silently discarded.
    await enqueue('alertFeedback', {
      kind: 'scoutObservation',
      plotId: plot.id,
      domain,
      note: note.trim(),
      imageUri: image,
      sensorContext: snapshot?.reading,
      at: Date.now(),
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  const scheduleDrone = () => {
    if (!plot || !snapshot) return;
    dispatch(
      proposeMissionAction(
        proposeMission({ plot, type: 'spray', map, reading: snapshot.reading, forecast })
      )
    );
    navigation.navigate('Drone');
  };

  const title = domain === 'pest' ? t('scout.pestTitle') : t('scout.diseaseTitle');

  return (
    <Screen scroll>
      <AppHeader
        title={title}
        subtitle={plot ? `${plot.name} · ${crop?.label}` : undefined}
        onBack={() => navigation.goBack()}
      />

      {/* Sensor-based risk — the part that is genuinely computed */}
      {risk ? (
        <>
          <SectionTitle title={t('scout.sensorAssessment')} icon="pulse" />
          <Card>
            <View style={s.riskTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.riskTitle}>{risk.title}</Text>
                <Text style={s.riskDetail}>{risk.detail}</Text>
              </View>
              <Badge label={`${risk.score}/100`} tone={riskTone(risk.level)} />
            </View>

            <ConfidenceBar confidence={risk.confidence} threshold={confidenceThreshold} />

            <View style={s.driversBlock}>
              <DriverList drivers={risk.drivers} />
            </View>

            <Button
              title={t('alerts.readAloud')}
              icon="volume-medium"
              variant="secondary"
              size="sm"
              onPress={() => speak(`${risk.title}. ${risk.detail}`)}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </>
      ) : (
        <Card>
          <Text style={s.muted}>{t('home.waitingForSensors')}</Text>
        </Card>
      )}

      {/* Likely candidates for this crop */}
      {candidates.length > 0 ? (
        <>
          <SectionTitle
            title={domain === 'pest' ? t('scout.likelyPests') : t('scout.likelyDiseases')}
            icon="list"
          />
          <Card>
            <Text style={s.muted}>{t('scout.candidatesHelp', { crop: crop?.label })}</Text>
            <View style={s.candidates}>
              {candidates.map((c) => (
                <View key={c} style={s.candidate}>
                  <Ionicons
                    name={domain === 'pest' ? 'bug-outline' : 'leaf-outline'}
                    size={14}
                    color={colors.brandLight}
                  />
                  <Text style={s.candidateText}>{c}</Text>
                </View>
              ))}
            </View>
          </Card>
        </>
      ) : null}

      {/* Photo capture */}
      <SectionTitle title={t('scout.photograph')} icon="camera" />
      <Card>
        {image ? (
          <Image source={{ uri: image }} style={s.image} resizeMode="cover" />
        ) : (
          <View style={s.imagePlaceholder}>
            <Ionicons name="camera-outline" size={34} color={colors.textFaint} />
            <Text style={s.placeholderText}>{t('scout.noImage')}</Text>
            <Text style={s.placeholderHint}>{t('scout.photoHint')}</Text>
          </View>
        )}

        <View style={s.captureRow}>
          <Button
            title={t('scout.takePhoto')}
            icon="camera"
            onPress={() => void capture('camera')}
            style={{ flex: 1 }}
          />
          <Button
            title={t('scout.upload')}
            icon="images"
            variant="secondary"
            onPress={() => void capture('library')}
            style={{ flex: 1 }}
          />
        </View>

        {/* Explicit about what the image can and cannot do right now */}
        <View style={s.modelNotice}>
          <Ionicons
            name={hasTelemetryBackend() ? 'cloud-upload-outline' : 'information-circle-outline'}
            size={15}
            color={colors.info}
          />
          <Text style={s.modelNoticeText}>
            {hasTelemetryBackend() ? t('scout.modelOnline') : t('scout.modelPending')}
          </Text>
        </View>
      </Card>

      {/* Farmer's observation */}
      <SectionTitle title={t('scout.whatYouSee')} icon="create" />
      <Card>
        <TextInput
          style={s.noteInput}
          placeholder={t('scout.notePlaceholder')}
          placeholderTextColor={colors.textFaint}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={400}
        />

        {submitted ? (
          <View style={s.submittedRow}>
            <Ionicons name="checkmark-circle" size={17} color={colors.ok} />
            <Text style={s.submittedText}>
              {online ? t('scout.submitted') : t('scout.submittedOffline')}
            </Text>
          </View>
        ) : (
          <Button
            title={t('scout.submit')}
            icon="send"
            onPress={() => void submit()}
            loading={submitting}
            disabled={!image && !note.trim()}
            style={{ marginTop: spacing.md }}
          />
        )}
        <Text style={s.submitHelp}>{t('scout.submitHelp')}</Text>
      </Card>

      {/* Treatment */}
      {risk && risk.recommendations.length > 0 ? (
        <>
          <SectionTitle title={t('scout.treatment')} icon="medkit" />
          <Card>
            <RecommendationList recommendations={risk.recommendations} onSpeak={speak} />
            <View style={s.inputBox}>
              <Text style={s.inputBoxTitle}>{t('scout.suggestedInput')}</Text>
              <Text style={s.inputBoxText}>
                {domain === 'pest' ? INPUT_SUGGESTIONS.pest : INPUT_SUGGESTIONS.disease}
              </Text>
              <Text style={s.inputBoxNote}>{t('scout.safetyNote')}</Text>
            </View>
            {risk.recommendations.some((r) => r.droneEligible) ? (
              <Button
                title={t('alerts.scheduleDrone')}
                icon="paper-plane"
                onPress={scheduleDrone}
                style={{ marginTop: spacing.lg }}
              />
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  muted: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  riskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  riskTitle: { ...typography.h3, color: colors.text },
  riskDetail: { ...typography.small, color: colors.textMuted, marginTop: 4, lineHeight: 19 },
  driversBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  candidates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  candidateText: { ...typography.small, color: colors.text },
  image: { width: '100%', height: 200, borderRadius: radii.md, marginBottom: spacing.md },
  imagePlaceholder: {
    height: 150,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: 4,
  },
  placeholderText: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  placeholderHint: {
    ...typography.tiny,
    color: colors.textFaint,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 15,
  },
  captureRow: { flexDirection: 'row', gap: spacing.sm },
  modelNotice: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.sm + 2,
    backgroundColor: colors.infoBg,
    borderRadius: radii.sm,
  },
  modelNoticeText: { ...typography.tiny, color: colors.info, flex: 1, lineHeight: 16 },
  noteInput: {
    minHeight: 84,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
  },
  submittedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  submittedText: { ...typography.small, color: colors.ok, flex: 1, fontWeight: '600', lineHeight: 18 },
  submitHelp: { ...typography.tiny, color: colors.textFaint, marginTop: sp.sm, lineHeight: 16 },
  inputBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
  },
  inputBoxTitle: { ...typography.tiny, color: colors.textMuted },
  inputBoxText: { ...typography.bodyStrong, color: colors.text, marginTop: 4, lineHeight: 20 },
  inputBoxNote: { ...typography.tiny, color: colors.textFaint, marginTop: 6, lineHeight: 15 },
});
