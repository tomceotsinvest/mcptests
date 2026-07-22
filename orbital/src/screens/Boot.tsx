/**
 * Boot.tsx — splash: fade the logo in while assets/save load, then auto-advance
 * to the Menu (§10). The particle-forming logo is a polish item for M6; for now
 * it's a clean animated title so the boot never feels dead.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useStore } from '@/state/store';

export function Boot(): React.JSX.Element {
  const booted = useStore((s) => s.booted);
  const go = useStore((s) => s.go);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    if (!booted) return;
    const t = setTimeout(() => go('menu'), 700);
    return () => clearTimeout(t);
  }, [booted, go]);

  return (
    <View style={styles.root}>
      <Animated.Text style={[styles.title, { opacity: fade }]}>ORBITAL</Animated.Text>
      <Text style={styles.sub}>loading the void…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05060B' },
  title: { color: '#5EE7FF', fontSize: 52, fontWeight: '900', letterSpacing: 10 },
  sub: { color: '#7C88B0', marginTop: 12, letterSpacing: 2 },
});
