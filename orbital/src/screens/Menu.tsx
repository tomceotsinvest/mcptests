/**
 * Menu.tsx — animated title, best-distance badge, and a giant PLAY button in
 * the thumb zone (§10). The live idle background (ghost ship auto-slingshotting)
 * is an M4/M6 polish item; the title pulse keeps the screen alive for now.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/ui/Button';
import { useStore } from '@/state/store';

export function Menu(): React.JSX.Element {
  const go = useStore((s) => s.go);
  const best = useStore((s) => s.save.bestDistance);
  const stardust = useStore((s) => s.save.totalStardust);
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }]}>
      <View style={styles.top}>
        <Animated.Text style={[styles.title, { transform: [{ scale }] }]}>ORBITAL</Animated.Text>
        <Text style={styles.tagline}>hold to grab · release to fling</Text>
        <View style={styles.badges}>
          <Badge label="BEST" value={`${Math.floor(best)} m`} />
          <Badge label="STARDUST" value={`${stardust}`} />
        </View>
      </View>

      <View style={styles.bottom}>
        <Button label="PLAY" onPress={() => go('game')} style={styles.play} />
        <View style={styles.row}>
          <Button label="SHOP" variant="ghost" onPress={() => go('shop')} style={styles.small} />
          <Button label="SETTINGS" variant="ghost" onPress={() => go('settings')} style={styles.small} />
        </View>
      </View>
    </View>
  );
}

function Badge({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <Text style={styles.badgeValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 },
  top: { alignItems: 'center', marginTop: 40 },
  title: { color: '#5EE7FF', fontSize: 60, fontWeight: '900', letterSpacing: 8 },
  tagline: { color: '#7C88B0', marginTop: 10, letterSpacing: 2, fontSize: 13 },
  badges: { flexDirection: 'row', gap: 14, marginTop: 34 },
  badge: {
    borderWidth: 1,
    borderColor: '#1C2440',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 110,
  },
  badgeLabel: { color: '#7C88B0', fontSize: 11, letterSpacing: 2 },
  badgeValue: { color: '#EAF0FF', fontSize: 22, fontWeight: '800', marginTop: 2 },
  bottom: { width: '100%', alignItems: 'center', gap: 16 },
  play: { width: '100%' },
  row: { flexDirection: 'row', gap: 12 },
  small: { flex: 1 },
});
