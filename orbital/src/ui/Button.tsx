/**
 * Button.tsx — a big, thumb-friendly neon button with a quick press spring.
 */
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  style?: ViewStyle;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', style, disabled }: Props): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 8 }).start();

  return (
    <Pressable
      onPressIn={() => spring(0.95)}
      onPressOut={() => spring(1)}
      onPress={onPress}
      disabled={disabled}
      style={style}
    >
      <Animated.View
        style={[
          styles.base,
          variant === 'primary' ? styles.primary : styles.ghost,
          disabled && styles.disabled,
          { transform: [{ scale }] },
        ]}
      >
        <Text style={[styles.label, variant === 'primary' ? styles.labelPrimary : styles.labelGhost]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  primary: {
    backgroundColor: '#5EE7FF',
    shadowColor: '#5EE7FF',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#7C88B0',
  },
  disabled: { opacity: 0.4 },
  label: { fontSize: 20, fontWeight: '800', letterSpacing: 1.5 },
  labelPrimary: { color: '#05060B' },
  labelGhost: { color: '#EAF0FF' },
});
