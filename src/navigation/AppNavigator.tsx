import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { unreadCount } from '../services/alertEngine';
import { useAppSelector } from '../store/hooks';
import { colors, typography } from '../theme';

import AlertDetailScreen from '../screens/AlertDetailScreen';
import AlertsScreen from '../screens/AlertsScreen';
import CommunityScreen from '../screens/CommunityScreen';
import DroneScreen from '../screens/DroneScreen';
import FieldHealthMapScreen from '../screens/FieldHealthMapScreen';
import FieldSetupScreen from '../screens/FieldSetupScreen';
import FieldLocationScreen from '../screens/FieldLocationScreen';
import FieldsScreen from '../screens/FieldsScreen';
import HomeScreen from '../screens/HomeScreen';
import KisanMitraScreen from '../screens/KisanMitraScreen';
import LoginScreen from '../screens/LoginScreen';
import MarketScreen from '../screens/MarketScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProfitLossScreen from '../screens/ProfitLossScreen';
import RiskDetailScreen from '../screens/RiskDetailScreen';
import ScoutScreen from '../screens/ScoutScreen';
import SensorDetailScreen from '../screens/SensorDetailScreen';
import SensorNodesScreen from '../screens/SensorNodesScreen';
import SensorSetupScreen from '../screens/SensorSetupScreen';
import WeatherScreen from '../screens/WeatherScreen';

/**
 * Navigation.
 *
 * Tabs are Home / Fields / Alerts / Profile, exactly as in the deck mockups. Alerts
 * gets a live unread badge because an unseen warning is the one thing in this app
 * that has a cost if missed.
 *
 * The Irrigation, Nutrient, ClimateRisk, Disease and Pest entries are the same two
 * screens with a fixed `domain` param — the engine treats all five detection domains
 * uniformly, so the UI does too.
 */

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabBarBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

function MainTabs() {
  const { t } = useTranslation();
  const alerts = useAppSelector((state) => state.alerts.items);
  const unread = unreadCount(alerts);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tabs.home'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="FieldsTab"
        component={FieldsScreen}
        options={{
          tabBarLabel: t('tabs.fields'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AlertsTab"
        component={AlertsScreen}
        options={{
          tabBarLabel: t('tabs.alerts'),
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <Ionicons
                name={focused ? 'notifications' : 'notifications-outline'}
                size={size - 2}
                color={color}
              />
              <TabBarBadge count={unread} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('tabs.profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size - 2} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="MainTabs" component={MainTabs} />

      <Stack.Screen name="FieldHealthMap" component={FieldHealthMapScreen} />
      <Stack.Screen name="FieldSetup" component={FieldSetupScreen} />
      <Stack.Screen name="FieldLocation" component={FieldLocationScreen} />
      <Stack.Screen name="SensorNodes" component={SensorNodesScreen} />
      <Stack.Screen name="SensorSetup" component={SensorSetupScreen} />
      <Stack.Screen name="SensorDetail" component={SensorDetailScreen} />
      <Stack.Screen name="AlertDetail" component={AlertDetailScreen} />
      <Stack.Screen name="RiskDetail" component={RiskDetailScreen} />
      <Stack.Screen name="KisanMitra" component={KisanMitraScreen} />
      <Stack.Screen name="Drone" component={DroneScreen} />
      <Stack.Screen name="Weather" component={WeatherScreen} />
      <Stack.Screen name="Market" component={MarketScreen} />
      <Stack.Screen name="Community" component={CommunityScreen} />
      <Stack.Screen name="ProfitLoss" component={ProfitLossScreen} />

      {/* Domain shortcuts onto the shared detail screens */}
      <Stack.Screen name="Irrigation" component={RiskDetailScreen} initialParams={{ domain: 'irrigation' }} />
      <Stack.Screen name="Nutrient" component={RiskDetailScreen} initialParams={{ domain: 'nutrient' }} />
      <Stack.Screen name="ClimateRisk" component={RiskDetailScreen} initialParams={{ domain: 'climate' }} />
      <Stack.Screen name="DiseaseDetection" component={ScoutScreen} initialParams={{ domain: 'cropHealth' }} />
      <Stack.Screen name="PestDetection" component={ScoutScreen} initialParams={{ domain: 'pest' }} />
    </Stack.Navigator>
  );
}

const s = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { ...typography.tiny, color: '#fff', fontSize: 9.5 },
});
