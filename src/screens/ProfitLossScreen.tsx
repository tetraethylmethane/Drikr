import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryBar, VictoryChart, VictoryAxis, VictoryTheme } from 'victory-native';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function ProfitLossScreen() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    cropName: '',
    area: '',
    fertilizerCost: '',
    laborCost: '',
    irrigationCost: '',
    marketPrice: '',
  });
  const [result, setResult] = useState<any>(null);

  const calculate = () => {
    const area = parseFloat(formData.area) || 0;
    const fertilizerCost = parseFloat(formData.fertilizerCost) || 0;
    const laborCost = parseFloat(formData.laborCost) || 0;
    const irrigationCost = parseFloat(formData.irrigationCost) || 0;
    const marketPrice = parseFloat(formData.marketPrice) || 0;

    if (!formData.cropName || area <= 0) {
      Alert.alert('Error', 'Please fill in crop name and area');
      return;
    }

    // Mock calculation
    const estimatedYield = area * 2500; // kg per acre
    const totalCost = fertilizerCost + laborCost + irrigationCost;
    const expectedRevenue = estimatedYield * marketPrice;
    const profitOrLoss = expectedRevenue - totalCost;
    const profitPercentage = ((profitOrLoss / totalCost) * 100).toFixed(1);

    const alertLevel = 
      profitOrLoss > totalCost * 0.5 ? 'highProfit' :
      profitOrLoss > 0 ? 'lowMargin' :
      'lossWarning';

    setResult({
      cropName: formData.cropName,
      estimatedYield,
      totalCost,
      expectedRevenue,
      profitOrLoss,
      profitPercentage,
      alertLevel,
    });
  };

  const getChartData = () => {
    if (!result) return [];
    return [
      { x: t('profit.totalCost'), y: result.totalCost },
      { x: t('profit.expectedRevenue'), y: result.expectedRevenue },
    ];
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView>
        <View style={styles.header}>
        <Text style={styles.title}>{t('profit.title')}</Text>
        <Text style={styles.subtitle}>{t('profit.subtitle')}</Text>
      </View>

      <Card>
        <Input
          label={t('profit.cropName')}
          value={formData.cropName}
          onChangeText={(text) => setFormData({ ...formData, cropName: text })}
          placeholder="Enter crop name (e.g., Rice)"
        />
        <Input
          label={t('profit.area')}
          value={formData.area}
          onChangeText={(text) => setFormData({ ...formData, area: text })}
          keyboardType="numeric"
          placeholder="Area in acres"
        />
        <Input
          label={t('profit.fertilizerCost')}
          value={formData.fertilizerCost}
          onChangeText={(text) => setFormData({ ...formData, fertilizerCost: text })}
          keyboardType="numeric"
        />
        <Input
          label={t('profit.laborCost')}
          value={formData.laborCost}
          onChangeText={(text) => setFormData({ ...formData, laborCost: text })}
          keyboardType="numeric"
        />
        <Input
          label={t('profit.irrigationCost')}
          value={formData.irrigationCost}
          onChangeText={(text) => setFormData({ ...formData, irrigationCost: text })}
          keyboardType="numeric"
        />
        <Input
          label={t('profit.marketPrice')}
          value={formData.marketPrice}
          onChangeText={(text) => setFormData({ ...formData, marketPrice: text })}
          keyboardType="numeric"
        />
        <Button title={t('profit.calculate')} onPress={calculate} style={{ marginTop: 8 }} />
      </Card>

      {result && (
        <>
          {result.alertLevel === 'highProfit' && (
            <Card style={{ backgroundColor: '#dcfce7', borderWidth: 2, borderColor: '#22c55e' }}>
              <View style={styles.alertRow}>
                <Ionicons name="trending-up" size={24} color="#16a34a" />
                <Text style={styles.alertText}>{t('profit.highProfit')}</Text>
              </View>
            </Card>
          )}
          {result.alertLevel === 'lowMargin' && (
            <Card style={{ backgroundColor: '#fef3c7', borderWidth: 2, borderColor: '#f59e0b' }}>
              <View style={styles.alertRow}>
                <Ionicons name="warning" size={24} color="#d97706" />
                <Text style={styles.alertText}>{t('profit.lowMargin')}</Text>
              </View>
            </Card>
          )}
          {result.alertLevel === 'lossWarning' && (
            <Card style={{ backgroundColor: '#fee2e2', borderWidth: 2, borderColor: '#ef4444' }}>
              <View style={styles.alertRow}>
                <Ionicons name="alert-circle" size={24} color="#dc2626" />
                <Text style={styles.alertText}>{t('profit.lossWarning')}</Text>
              </View>
            </Card>
          )}

          <Card>
            <Text style={styles.sectionTitle}>{t('profit.results')}</Text>
            
            <View style={styles.resultGrid}>
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>{t('profit.estimatedYield')}</Text>
                <Text style={styles.resultValue}>{result.estimatedYield.toLocaleString()} kg</Text>
              </View>
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>{t('profit.totalCost')}</Text>
                <Text style={styles.resultValue}>₹{result.totalCost.toLocaleString()}</Text>
              </View>
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>{t('profit.expectedRevenue')}</Text>
                <Text style={styles.resultValue}>₹{result.expectedRevenue.toLocaleString()}</Text>
              </View>
              <View style={[styles.resultCard, result.profitOrLoss >= 0 ? styles.profitCard : styles.lossCard]}>
                <Text style={styles.resultLabel}>{result.profitOrLoss >= 0 ? t('profit.profit') : t('profit.loss')}</Text>
                <Text style={[styles.resultValue, result.profitOrLoss >= 0 ? styles.profitValue : styles.lossValue]}>
                  ₹{Math.abs(result.profitOrLoss).toLocaleString()}
                </Text>
              </View>
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Cost vs Revenue</Text>
            <View style={styles.chartContainer}>
              <VictoryChart theme={VictoryTheme.material} height={300}>
                <VictoryAxis dependentAxis />
                <VictoryAxis />
                <VictoryBar data={getChartData()} x="x" y="y" barRatio={0.5} />
              </VictoryChart>
            </View>
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
    backgroundColor: '#f59e0b',
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
    color: '#fef3c7',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  resultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  resultCard: {
    width: '48%',
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  resultLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  resultValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  profitCard: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  lossCard: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  profitValue: {
    color: '#16a34a',
  },
  lossValue: {
    color: '#dc2626',
  },
  chartContainer: {
    height: 350,
  },
});
