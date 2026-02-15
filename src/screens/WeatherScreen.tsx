import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import { useTranslation } from 'react-i18next';

export default function WeatherScreen() {
  const { t } = useTranslation();
  const [weather, setWeather] = useState({
    current: {
      temp: 28,
      condition: 'Sunny',
      humidity: 65,
      windSpeed: 12,
    },
    forecast: [
      { day: 'Today', temp: 28, condition: 'Sunny', icon: 'sunny' },
      { day: 'Tomorrow', temp: 26, condition: 'Cloudy', icon: 'cloud' },
      { day: 'Day 3', temp: 27, condition: 'Sunny', icon: 'sunny' },
      { day: 'Day 4', temp: 25, condition: 'Rainy', icon: 'rainy' },
      { day: 'Day 5', temp: 29, condition: 'Sunny', icon: 'sunny' },
      { day: 'Day 6', temp: 30, condition: 'Sunny', icon: 'sunny' },
      { day: 'Day 7', temp: 28, condition: 'Cloudy', icon: 'cloud' },
    ],
  });

  const getIcon = (condition: string) => {
    const icons: any = {
      sunny: 'sunny',
      cloudy: 'cloud',
      rainy: 'rainy',
      windy: 'cloudy',
    };
    return icons[condition.toLowerCase()] || 'sunny';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>{t('weather.title')}</Text>
          <Text style={styles.subtitle}>{t('weather.current')}</Text>
        </View>

      <Card>
        <View style={styles.currentWeather}>
          <Ionicons name="sunny" size={80} color="#f59e0b" />
          <View style={styles.tempSection}>
            <Text style={styles.temp}>{weather.current.temp}°C</Text>
            <Text style={styles.condition}>{weather.current.condition}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="water" size={24} color="#3b82f6" />
            <Text style={styles.statLabel}>{t('weather.humidity')}</Text>
            <Text style={styles.statValue}>{weather.current.humidity}%</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="speedometer" size={24} color="#8b5cf6" />
            <Text style={styles.statLabel}>Wind Speed</Text>
            <Text style={styles.statValue}>{weather.current.windSpeed} km/h</Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>{t('weather.forecast')}</Text>
        
        {weather.forecast.map((day, index) => (
          <View key={index} style={styles.forecastItem}>
            <Text style={styles.dayText}>{day.day}</Text>
            <Ionicons name={getIcon(day.condition) as any} size={32} color="#f59e0b" />
            <Text style={styles.tempText}>{day.temp}°C</Text>
            <Text style={styles.conditionText}>{day.condition}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Farming Tips</Text>
        
        <View style={styles.tipItem}>
          <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
          <Text style={styles.tipText}>
            Weather is ideal for planting. Ensure adequate irrigation.
          </Text>
        </View>
        
        <View style={styles.tipItem}>
          <Ionicons name="warning" size={24} color="#f59e0b" />
          <Text style={styles.tipText}>
            Day 4 forecast shows rain. Plan irrigation accordingly.
          </Text>
        </View>
        
        <View style={styles.tipItem}>
          <Ionicons name="leaf" size={24} color="#10b981" />
          <Text style={styles.tipText}>
            Current conditions are perfect for crop spraying activities.
          </Text>
        </View>
      </Card>
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
    backgroundColor: '#3b82f6',
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
    color: '#dbeafe',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  currentWeather: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  tempSection: {
    alignItems: 'center',
  },
  temp: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#111827',
  },
  condition: {
    fontSize: 18,
    color: '#6b7280',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 4,
  },
  forecastItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  dayText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  tempText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    width: 50,
    textAlign: 'right',
  },
  conditionText: {
    fontSize: 14,
    color: '#6b7280',
    width: 80,
    textAlign: 'right',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
