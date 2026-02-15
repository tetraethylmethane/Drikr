import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  style,
  textStyle,
  disabled = false,
}: ButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        styles[variant],
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.text, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
	            minHeight: 50,
	            paddingHorizontal: 20,
	            paddingVertical: 12,
  },
  primary: {
	            backgroundColor: '#22c55e',
  },
  secondary: {
	            backgroundColor: '#f3f4f6',
  },
  danger: {
	            backgroundColor: '#ef4444',
  },
  disabled: {
	            backgroundColor: '#d1d5db',
	            opacity: 0.6,
  },
  text: {
	            color: '#ffffff',
	            fontSize: 16,
	            fontWeight: '600',
	            textAlign: 'center',
  },
});