/**
 * GameOver.tsx — results card: distance, stardust, combo peak, NEW BEST
 * celebration, and a 1-tap RETRY (§10). The freeze-frame + explosion is drawn
 * in-canvas at M3/M4; here we present the numbers and the fast retry loop.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/ui/Button';
import { useStore } from '@/state/store';

export function GameOver(): React.JSX.Element {
  const go = useStore((s) => s.go);
  const result = useStore((s) => s.lastResult);
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(60)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [slide, fade]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 30, paddingTop: insets.top + 40 }]}>
      <Animated.View style={[styles.card, { opacity: fade, transform: [{ translateY: slide }] }]}>
        {result?.newBest && <Text style={styles.newBest}>NEW BEST!</Text>}
        <Text style={styles.label}>DISTANCE</Text>
        <Text style={styles.distance}>{result?.distance ?? 0} m</Text>

        <View style={styles.stats}>
          <Stat label="STARDUST" value={`✦ ${result?.stardust ?? 0}`} />
          <Stat label="COMBO PEAK" value={`×${result?.comboPeak ?? 0}`} />
        </View>
      </Animated.View>

      <View style={styles.actions}>
        <Button label="RETRY" onPress={() => go('game')} style={styles.retry} />
        <View style={styles.row}>
          <Button label="MENU" variant="ghost" onPress={() => go('menu')} style={styles.small} />
          <Button label="SHOP" variant="ghost" onPress={() => go('shop')} style={styles.small} />
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 },
  card: { alignItems: 'center', marginTop: 60 },
  newBest: { color: '#FFDD88', fontSize: 22, fontWeight: '900', letterSpacing: 3, marginBottom: 14 },
  label: { color: '#7C88B0', letterSpacing: 3, fontSize: 12 },
  distance: { color: '#EAF0FF', fontSize: 64, fontWeight: '900' },
  stats: { flexDirection: 'row', gap: 16, marginTop: 30 },
  stat: {
    borderWidth: 1,
    borderColor: '#1C2440',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    minWidth: 130,
  },
  statLabel: { color: '#7C88B0', fontSize: 11, letterSpacing: 2 },
  statValue: { color: '#EAF0FF', fontSize: 22, fontWeight: '800', marginTop: 3 },
  actions: { width: '100%', alignItems: 'center', gap: 14 },
  retry: { width: '100%' },
  row: { flexDirection: 'row', gap: 12 },
  small: { flex: 1 },
});
