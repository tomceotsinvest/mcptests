/**
 * Settings.tsx — music/SFX volume, haptics, colorblind palette, handedness,
 * reset progress, and the dev tuning-panel toggle (§10). Sliders are simple
 * tap-to-step rows to avoid a slider dependency; a real slider lands in M4.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/ui/Button';
import { useStore } from '@/state/store';
import { FEATURES } from '@/config/features';

export function Settings(): React.JSX.Element {
  const go = useStore((s) => s.go);
  const settings = useStore((s) => s.save.settings);
  const setSetting = useStore((s) => s.setSetting);
  const setHandedness = useStore((s) => s.setHandedness);
  const resetProgress = useStore((s) => s.resetProgress);
  const toggleTuning = useStore((s) => s.toggleTuning);
  const showTuning = useStore((s) => s.showTuning);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.h1}>SETTINGS</Text>
      <ScrollView style={styles.list} contentContainerStyle={{ gap: 6 }}>
        <VolumeRow label="Music" value={settings.music} onChange={(v) => setSetting('music', v)} />
        <VolumeRow label="SFX" value={settings.sfx} onChange={(v) => setSetting('sfx', v)} />
        <ToggleRow label="Haptics" value={settings.haptics} onChange={(v) => setSetting('haptics', v)} />
        <ToggleRow
          label="Colorblind palette"
          value={settings.colorblind}
          onChange={(v) => setSetting('colorblind', v)}
        />
        <View style={styles.row}>
          <Text style={styles.label}>HUD handedness</Text>
          <View style={styles.seg}>
            <Seg active={settings.handedness === 'L'} label="LEFT" onPress={() => setHandedness('L')} />
            <Seg active={settings.handedness === 'R'} label="RIGHT" onPress={() => setHandedness('R')} />
          </View>
        </View>
        {FEATURES.DEBUG_PANEL && (
          <ToggleRow label="Dev tuning panel" value={showTuning} onChange={toggleTuning} />
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="RESET PROGRESS" variant="ghost" onPress={resetProgress} style={styles.wide} />
        <Button label="BACK" onPress={() => go('menu')} style={styles.wide} />
      </View>
    </View>
  );
}

function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): React.JSX.Element {
  const step = () => onChange(Math.round(((value + 0.25) % 1.25) * 100) / 100);
  return (
    <Pressable style={styles.row} onPress={step}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(1, value) * 100}%` }]} />
      </View>
      <Text style={styles.pct}>{Math.round(value * 100)}%</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#5EE7FF' }} />
    </View>
  );
}

function Seg({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.segBtn, active && styles.segActive]}>
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22 },
  h1: { color: '#EAF0FF', fontSize: 28, fontWeight: '900', letterSpacing: 3, marginBottom: 16 },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#131A30',
    gap: 12,
  },
  label: { color: '#EAF0FF', fontSize: 16, flexShrink: 1 },
  bar: { flex: 1, height: 6, backgroundColor: '#131A30', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#5EE7FF' },
  pct: { color: '#7C88B0', width: 44, textAlign: 'right' },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#1C2440' },
  segActive: { backgroundColor: '#5EE7FF', borderColor: '#5EE7FF' },
  segText: { color: '#7C88B0', fontWeight: '700', fontSize: 12 },
  segTextActive: { color: '#05060B' },
  actions: { gap: 12, marginTop: 12 },
  wide: { width: '100%' },
});
