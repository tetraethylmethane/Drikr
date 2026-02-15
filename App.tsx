import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { NavigationContainer, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { store } from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import './src/i18n/i18n';
import VoiceAssistant from './src/components/VoiceAssistant';

export default function App() {
  const customDarkTheme = {
    ...NavigationDarkTheme,
    colors: {
      ...NavigationDarkTheme.colors,
      background: '#000000',
      card: '#071837',
      text: '#E6F7FF',
      primary: '#1E40AF',
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <NavigationContainer theme={customDarkTheme}>
          <StatusBar style="light" />
          <AppNavigator />
          <VoiceAssistant />
        </NavigationContainer>
      </Provider>
    </GestureHandlerRootView>
  );
}
