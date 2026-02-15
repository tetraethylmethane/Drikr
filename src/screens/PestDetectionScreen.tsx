import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Card from '../components/Card';
import Button from '../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function PestDetectionScreen() {
  const { t } = useTranslation();
  const [image, setImage] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      setResult(null);
    }
  };

  const detectPest = async () => {
    if (!image && !description.trim()) {
      alert('Please upload an image or describe the pest symptoms');
      return;
    }

    setDetecting(true);
    
    setTimeout(() => {
      setResult({
        pestName: 'Aphids',
        pestNameTamil: 'பூச்சி பூச்சிகள்',
        affectedCrop: 'Vegetables, Flowers',
        affectedCropTamil: 'காய்கறிகள், பூக்கள்',
        naturalControl: [
          'Spray neem oil solution',
          'Introduce ladybugs',
          'Use soap water spray',
          'Remove affected parts',
        ],
        naturalControlTamil: [
          'வேப்ப எண்ணெய் தெளிப்பு',
          'லேடிபக் பூச்சிகளை அறிமுகப்படுத்துங்கள்',
          'சோப்பு நீர் தெளிப்பு',
          'பாதிக்கப்பட்ட பகுதிகளை அகற்றவும்',
        ],
      });
      setDetecting(false);
    }, 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView>
        <View style={styles.header}>
        <Text style={styles.title}>{t('pest.title')}</Text>
        <Text style={styles.subtitle}>{t('pest.subtitle')}</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Upload Pest Image or Describe</Text>
        
        {image && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: image }} style={styles.image} />
            <TouchableOpacity onPress={pickImage} style={styles.changeImageButton}>
              <Ionicons name="refresh" size={20} color="#3b82f6" />
              <Text style={styles.changeImageText}>Change Image</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
          <Ionicons name="camera-outline" size={32} color="#3b82f6" />
          <Text style={styles.uploadButtonText}>Upload Image</Text>
        </TouchableOpacity>

        <Text style={styles.divider}>OR</Text>

        <Text style={styles.label}>Describe Pest Symptoms</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Describe the pest, location, damage..."
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
        />

        <Button
          title={detecting ? "Detecting..." : "Detect Pest"}
          onPress={detectPest}
          style={{ marginTop: 16 }}
          disabled={detecting}
        />
      </Card>

      {result && (
        <>
          <Card>
            <View style={styles.resultHeader}>
              <Ionicons name="bug" size={32} color="#8b5cf6" />
              <Text style={styles.resultTitle}>{t('pest.detected')}</Text>
            </View>
            
            <View style={styles.resultContent}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>{t('pest.pestName')}</Text>
                <Text style={styles.infoValue}>{result.pestName}</Text>
                <Text style={styles.infoValueTamil}>{result.pestNameTamil}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>{t('pest.affectedCrop')}</Text>
                <Text style={styles.infoValue}>{result.affectedCrop}</Text>
                <Text style={styles.infoValueTamil}>{result.affectedCropTamil}</Text>
              </View>
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>{t('pest.remedies')}</Text>
            {result.naturalControl.map((remedy: string, index: number) => (
              <View key={index} style={styles.cureItem}>
                <Ionicons name="leaf" size={20} color="#10b981" />
                <Text style={styles.cureText}>{remedy}</Text>
              </View>
            ))}
          </Card>
        </>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#8b5cf6',
    padding: 20,
    paddingTop: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ddd6fe',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  imageContainer: {
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  changeImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 4,
  },
  changeImageText: {
    color: '#3b82f6',
    fontWeight: '500',
  },
  uploadButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 40,
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  divider: {
    textAlign: 'center',
    color: '#9ca3af',
    marginVertical: 16,
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  resultContent: {
    gap: 16,
  },
  infoRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 12,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 4,
  },
  infoValueTamil: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  cureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  cureText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
