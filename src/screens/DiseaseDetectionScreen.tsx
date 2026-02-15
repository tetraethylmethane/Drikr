import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Card from '../components/Card';
import Button from '../components/Button';
import { useTranslation } from 'react-i18next';

export default function DiseaseDetectionScreen() {
  const { t } = useTranslation();
  const [image, setImage] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Camera permission is required to take photos');
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
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

  const detectDisease = async () => {
    if (!image) {
      Alert.alert('No Image', 'Please select an image first');
      return;
    }

    setDetecting(true);
    
    // Simulate API call
    setTimeout(() => {
      setResult({
        disease: 'Leaf Spot Disease',
        diseaseTamil: 'இலை புள்ளி நோய்',
        accuracy: 92,
        description: 'Leaf spot is a common fungal disease affecting many crops. It appears as brown or black spots on leaves.',
        descriptionTamil: 'இலை புள்ளி பல பயிர்களையும் பாதிக்கும் பொதுவான பூஞ்சை நோய் ஆகும்.',
        cures: [
          'Apply fungicide sprays every 7-10 days',
          'Remove and destroy affected leaves',
          'Improve air circulation around plants',
          'Avoid overhead watering',
        ],
        curesTamil: [
          'ஒவ்வொரு 7-10 நாட்களுக்கும் பூஞ்சைக்கொல்லி தெளிப்பு',
          'பாதிக்கப்பட்ட இலைகளை அகற்றி அழிக்கவும்',
          'தாவரங்களைச் சுற்றி காற்று சுழற்சியை மேம்படுத்த',
          'மேலே தண்ணீர் பாய்ச்சுவதைத் தவிர்க்கவும்',
        ],
      });
      setDetecting(false);
    }, 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView>
        <View style={styles.header}>
        <Text style={styles.title}>{t('disease.title')}</Text>
        <Text style={styles.subtitle}>{t('disease.subtitle')}</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Upload Leaf Image</Text>
        
        <View style={styles.imageSection}>
          {image ? (
            <Image source={{ uri: image }} style={styles.image} />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="leaf" size={48} color="#22c55e" />
              <Text style={styles.placeholderText}>No image selected</Text>
            </View>
          )}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.actionButton, styles.cameraButton]} onPress={takePhoto}>
            <Ionicons name="camera" size={24} color="#ffffff" />
            <Text style={styles.buttonText}>{t('disease.takePhoto')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.galleryButton]} onPress={pickImage}>
            <Ionicons name="images" size={24} color="#ffffff" />
            <Text style={styles.buttonText}>{t('disease.uploadImage')}</Text>
          </TouchableOpacity>
        </View>

        {image && (
          <Button
            title={detecting ? "Detecting..." : "Detect Disease"}
            onPress={detectDisease}
            style={{ marginTop: 16 }}
            disabled={detecting}
          />
        )}

        {detecting && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text style={styles.loadingText}>{t('disease.detecting')}</Text>
          </View>
        )}
      </Card>

      {result && (
        <>
          <Card>
            <View style={styles.resultHeader}>
              <Ionicons name="checkmark-circle" size={32} color="#22c55e" />
              <Text style={styles.resultTitle}>{t('disease.detected')}</Text>
            </View>
            
            <View style={styles.diseaseInfo}>
              <Text style={styles.diseaseName}>{result.disease}</Text>
              <Text style={styles.diseaseNameTamil}>{result.diseaseTamil}</Text>
              
              <View style={styles.accuracyBadge}>
                <Text style={styles.accuracyText}>
                  {t('disease.accuracy')}: {result.accuracy}%
                </Text>
              </View>
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>{t('disease.description')}</Text>
            <Text style={styles.description}>{result.description}</Text>
            <Text style={styles.description}>{result.descriptionTamil}</Text>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>{t('disease.cure')}</Text>
            {result.cures.map((cure: string, index: number) => (
              <View key={index} style={styles.cureItem}>
                <Ionicons name="checkmark" size={20} color="#22c55e" />
                <Text style={styles.cureText}>{cure}</Text>
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
    backgroundColor: '#ef4444',
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
    color: '#fee2e2',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  imageSection: {
    marginBottom: 16,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  cameraButton: {
    backgroundColor: '#22c55e',
  },
  galleryButton: {
    backgroundColor: '#3b82f6',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
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
  diseaseInfo: {
    marginBottom: 16,
  },
  diseaseName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 4,
  },
  diseaseNameTamil: {
    fontSize: 18,
    color: '#6b7280',
    marginBottom: 12,
  },
  accuracyBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  accuracyText: {
    color: '#166534',
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
    marginBottom: 12,
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
