import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, hashPIN, verifyPIN, validatePINFormat } from '../config/firebase';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [isSignup, setIsSignup] = useState(false); // Toggle between login and signup
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+91'); // Default to India
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState(''); // Only for signup
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentStep, setCurrentStep] = useState<'phone' | 'pin'>('phone'); // Step 1: phone, Step 2: pin
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Common country codes
  const countryCodes = [
    { code: '+1', country: 'US/CA', flag: '🇺🇸' },
    { code: '+44', country: 'UK', flag: '🇬🇧' },
    { code: '+91', country: 'India', flag: '🇮🇳' },
    { code: '+86', country: 'China', flag: '🇨🇳' },
    { code: '+81', country: 'Japan', flag: '🇯🇵' },
    { code: '+82', country: 'Korea', flag: '🇰🇷' },
    { code: '+61', country: 'Australia', flag: '🇦🇺' },
    { code: '+971', country: 'UAE', flag: '🇦🇪' },
    { code: '+65', country: 'Singapore', flag: '🇸🇬' },
    { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
    { code: '+880', country: 'Bangladesh', flag: '🇧🇩' },
    { code: '+92', country: 'Pakistan', flag: '🇵🇰' },
    { code: '+94', country: 'Sri Lanka', flag: '🇱🇰' },
    { code: '+977', country: 'Nepal', flag: '🇳🇵' },
    { code: '+20', country: 'Egypt', flag: '🇪🇬' },
    { code: '+27', country: 'South Africa', flag: '🇿🇦' },
  ];

  // Format phone number with country code
  const formatPhoneNumber = (text: string): string => {
    const digits = text.replace(/\D/g, '');
    // For India (default)
    if (countryCode === '+91') {
      if (digits.startsWith('91') && digits.length === 12) {
        return `+${digits}`;
      }
      if (digits.startsWith('0') && digits.length === 11) {
        return `+91${digits.substring(1)}`;
      }
      if (digits.length === 10) {
        return `+91${digits}`;
      }
      if (digits.startsWith('91') && digits.length >= 10) {
        return `+${digits}`;
      }
      return digits ? `${countryCode}${digits}` : '';
    }
    // For other countries, just prepend country code
    return digits ? `${countryCode}${digits}` : '';
  };

  // Get the full formatted phone number for display
  const getFullPhoneNumber = (): string => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    return cleaned ? `${countryCode}${cleaned}` : '';
  };

  // Handle phone number submission
  const handlePhoneSubmit = async () => {
    const formattedPhone = getFullPhoneNumber();
    
    if (!phoneNumber || phoneNumber.length < 7) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    setErrorMessage('');
    
    // Check if user exists in Firestore
    try {
      const userQuery = await getDoc(doc(db, 'users', formattedPhone));
      
      if (userQuery.exists()) {
        // User exists, show login mode
        setIsSignup(false);
        setCurrentStep('pin');
      } else {
        // User doesn't exist, show signup mode
        setIsSignup(true);
        setCurrentStep('pin');
      }
    } catch (error: any) {
      console.error('Error checking user:', error);
      setErrorMessage('Error checking user. Please try again.');
    }
  };

  // Handle signup
  const handleSignup = async () => {
    const formattedPhone = getFullPhoneNumber();

    // Validate PIN format
    if (!validatePINFormat(pin)) {
      setErrorMessage('PIN must be 4-6 numeric digits');
      return;
    }

    // Check PIN confirmation (only for signup)
    if (pin !== confirmPin) {
      setErrorMessage('PINs do not match. Please try again.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      // Hash the PIN before storing
      const pinHash = hashPIN(pin);

      // Generate a simple session token
      const sessionToken = Date.now().toString() + Math.random().toString(36).substring(7);

      // Save user to Firestore
      await setDoc(doc(db, 'users', formattedPhone), {
        phoneNumber: formattedPhone,
        pinHash: pinHash,
        sessionToken: sessionToken,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Store session in AsyncStorage
      await AsyncStorage.setItem('userSession', JSON.stringify({
        phoneNumber: formattedPhone,
        sessionToken: sessionToken,
        loggedIn: true,
      }));

      setErrorMessage('');
      Alert.alert('Success', 'Account created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Navigate to HomeScreen
            navigation.replace('MainTabs');
          },
        },
      ]);
    } catch (error: any) {
      console.error('Signup error:', error);
      let errorMsg = 'Failed to create account. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMsg = 'Permission denied. Please check Firestore rules.';
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setErrorMessage(errorMsg);
      Alert.alert('Signup Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Handle login
  const handleLogin = async () => {
    const formattedPhone = getFullPhoneNumber();

    // Validate PIN format
    if (!validatePINFormat(pin)) {
      setErrorMessage('PIN must be 4-6 numeric digits');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      // Retrieve user document from Firestore
      const userDocRef = doc(db, 'users', formattedPhone);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        setErrorMessage('User not found. Please sign up first.');
        Alert.alert('Login Failed', 'User not found. Please sign up first.');
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      const storedPinHash = userData.pinHash;

      if (!storedPinHash) {
        setErrorMessage('Invalid user data. Please contact support.');
        Alert.alert('Error', 'Invalid user data. Please contact support.');
        setLoading(false);
        return;
      }

      // Verify PIN
      const isPinValid = verifyPIN(pin, storedPinHash);

      if (!isPinValid) {
        setErrorMessage('Incorrect PIN. Please try again.');
        Alert.alert('Login Failed', 'Incorrect PIN. Please try again.');
        setLoading(false);
        return;
      }

      // PIN is valid, generate new session token
      const sessionToken = Date.now().toString() + Math.random().toString(36).substring(7);

      // Store session in AsyncStorage
      await AsyncStorage.setItem('userSession', JSON.stringify({
        phoneNumber: formattedPhone,
        sessionToken: sessionToken,
        loggedIn: true,
      }));

      // Update last login time and session token
      await setDoc(
        doc(db, 'users', formattedPhone),
        {
          updatedAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          sessionToken: sessionToken,
        },
        { merge: true }
      );

      setErrorMessage('');
      Alert.alert('Success', 'Login successful!', [
        {
          text: 'OK',
          onPress: () => {
            // Navigate to HomeScreen
            navigation.replace('MainTabs');
          },
        },
      ]);
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMsg = 'Failed to login. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMsg = 'Permission denied. Please check Firestore rules.';
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setErrorMessage(errorMsg);
      Alert.alert('Login Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Handle PIN submission
  const handlePinSubmit = async () => {
    if (isSignup) {
      await handleSignup();
    } else {
      await handleLogin();
    }
  };

  // Reset to phone input step
  const handleBack = () => {
    setCurrentStep('phone');
    setPin('');
    setConfirmPin('');
    setErrorMessage('');
  };

  // Mask PIN for display (●●●●)
  const maskPIN = (pinValue: string): string => {
    return '●'.repeat(pinValue.length);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#071840']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              {/* Title */}
              <Text style={styles.title}>Welcome to Drikr 🌾</Text>
              <Text style={styles.subtitle}>
                {currentStep === 'phone' 
                  ? 'Enter your phone number to continue'
                  : isSignup 
                    ? 'Create your secure PIN' 
                    : 'Enter your PIN to login'}
              </Text>

              {/* Phone Number Input Step */}
              {currentStep === 'phone' && (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Mobile Number</Text>
                    <View style={styles.phoneInputContainer}>
                      {/* Country Code Picker Button */}
                      <TouchableOpacity
                        style={styles.countryCodeButton}
                        onPress={() => setShowCountryPicker(!showCountryPicker)}
                        disabled={loading}
                      >
                        <Text style={styles.countryCodeText}>{countryCode}</Text>
                        <Text style={styles.dropdownIcon}>▼</Text>
                      </TouchableOpacity>

                      {/* Phone Number Input */}
                      <TextInput
                        style={styles.phoneInput}
                        placeholder="Phone number"
                        placeholderTextColor="#9ca3af"
                        value={phoneNumber}
                        onChangeText={(text) => {
                          const digits = text.replace(/\D/g, '');
                          setPhoneNumber(digits);
                          setErrorMessage('');
                        }}
                        keyboardType="phone-pad"
                        maxLength={15}
                        editable={!loading}
                        autoComplete="tel"
                      />
                    </View>

                    {/* Country Code Dropdown */}
                    {showCountryPicker && (
                      <View style={styles.countryPickerContainer}>
                        <ScrollView style={styles.countryPickerScroll} nestedScrollEnabled>
                          {countryCodes.map((country, index) => (
                            <TouchableOpacity
                              key={index}
                              style={[
                                styles.countryOption,
                                countryCode === country.code && styles.countryOptionSelected
                              ]}
                              onPress={() => {
                                setCountryCode(country.code);
                                setShowCountryPicker(false);
                              }}
                            >
                              <Text style={styles.countryFlag}>{country.flag}</Text>
                              <Text style={styles.countryText}>{country.country}</Text>
                              <Text style={styles.countryCodeOption}>{country.code}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handlePhoneSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>Continue</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* PIN Input Step */}
              {currentStep === 'pin' && (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Enter PIN</Text>
                    <View style={styles.pinContainer}>
                      <TextInput
                        style={styles.pinInput}
                        placeholder="••••"
                        placeholderTextColor="#9ca3af"
                        value={pin}
                        onChangeText={(text) => {
                          // Only allow numeric input
                          const numericText = text.replace(/[^0-9]/g, '');
                          // Limit to 6 digits
                          if (numericText.length <= 6) {
                            setPin(numericText);
                            setErrorMessage('');
                          }
                        }}
                        keyboardType="number-pad"
                        maxLength={6}
                        editable={!loading}
                        secureTextEntry={true}
                        autoFocus={true}
                      />
                    </View>
                    <Text style={styles.pinHint}>
                      PIN must be 4-6 digits
                    </Text>
                  </View>

                  {/* Confirm PIN (only for signup) */}
                  {isSignup && (
                    <View style={styles.inputContainer}>
                      <Text style={styles.label}>Confirm PIN</Text>
                      <View style={styles.pinContainer}>
                        <TextInput
                          style={styles.pinInput}
                          placeholder="••••"
                          placeholderTextColor="#9ca3af"
                          value={confirmPin}
                          onChangeText={(text) => {
                            const numericText = text.replace(/[^0-9]/g, '');
                            if (numericText.length <= 6) {
                              setConfirmPin(numericText);
                              setErrorMessage('');
                            }
                          }}
                          keyboardType="number-pad"
                          maxLength={6}
                          editable={!loading}
                          secureTextEntry={true}
                        />
                      </View>
                    </View>
                  )}

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.button, styles.buttonSecondary]}
                      onPress={handleBack}
                      disabled={loading}
                    >
                      <Text style={styles.buttonSecondaryText}>Back</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.button, styles.buttonPrimary, loading && styles.buttonDisabled]}
                      onPress={handlePinSubmit}
                      disabled={loading || pin.length < 4 || (isSignup && pin !== confirmPin)}
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.buttonText}>
                          {isSignup ? 'Sign Up' : 'Login'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Toggle Login/Signup */}
                  <TouchableOpacity
                    style={styles.toggleButton}
                    onPress={() => {
                      setIsSignup(!isSignup);
                      setPin('');
                      setConfirmPin('');
                      setErrorMessage('');
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.toggleText}>
                      {isSignup 
                        ? 'Already have an account? Login' 
                        : "Don't have an account? Sign Up"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Error Message */}
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Phone number display (when on PIN step) */}
              {currentStep === 'pin' && (
                <View style={styles.phoneDisplayContainer}>
                  <Text style={styles.phoneDisplayText}>
                    {getFullPhoneNumber()}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  gradient: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    zIndex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#1e293b',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minWidth: 80,
    justifyContent: 'space-between',
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  dropdownIcon: {
    fontSize: 10,
    color: '#6b7280',
    marginLeft: 4,
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#1e293b',
  },
  countryPickerContainer: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 2,
  },
  countryPickerScroll: {
    maxHeight: 200,
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  countryOptionSelected: {
    backgroundColor: '#f0fdf4',
  },
  countryFlag: {
    fontSize: 20,
    marginRight: 12,
  },
  countryText: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
  },
  countryCodeOption: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  pinContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 8,
    backgroundColor: '#ffffff',
    color: '#1e293b',
    textAlign: 'center',
  },
  pinHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    minHeight: 52,
  },
  buttonPrimary: {
    backgroundColor: '#22c55e',
    flex: 1,
    marginLeft: 8,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonSecondary: {
    backgroundColor: '#e5e7eb',
    flex: 1,
    marginRight: 8,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  phoneDisplayContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  phoneDisplayText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
});
