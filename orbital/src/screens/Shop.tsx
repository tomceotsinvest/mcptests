/**
 * Shop.tsx — spend stardust on ship skins + trail palettes (cosmetic) and
 * continue tokens (§10, §12). Buying/equipping is wired to the store; a fuller
 * preview + continue-token purchase flow expands in M5.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/ui/Button';
import { useStore } from '@/state/store';
import { SHIP_SKINS, TRAIL_SKINS } from '@/config/theme';

export function Shop(): React.JSX.Element {
  const go = useStore((s) => s.go);
  const save = useStore((s) => s.save);
  const spend = useStore((s) => s.spendStardust);
  const unlock = useStore((s) => s.unlock);
  const equip = useStore((s) => s.equip);
  const insets = useSafeAreaInsets();

  const buy = (kind: 'ships' | 'trails', id: string, price: number): void => {
    if (save.unlocks[kind].includes(id)) return;
    if (spend(price)) unlock(kind, id);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.head}>
        <Text style={styles.h1}>SHOP</Text>
        <Text style={styles.balance}>✦ {save.totalStardust}</Text>
      </View>

      <ScrollView contentContainerStyle={{ gap: 20, paddingBottom: 20 }}>
        <Section title="SHIPS">
          {Object.entries(SHIP_SKINS).map(([id, s]) => (
            <Item
              key={id}
              label={s.label}
              color={s.hull}
              price={s.price}
              owned={save.unlocks.ships.includes(id)}
              equipped={save.equipped.ship === id}
              onBuy={() => buy('ships', id, s.price)}
              onEquip={() => equip('ship', id)}
            />
          ))}
        </Section>

        <Section title="TRAILS">
          {Object.entries(TRAIL_SKINS).map(([id, t]) => (
            <Item
              key={id}
              label={t.label}
              color={t.a}
              price={t.price}
              owned={save.unlocks.trails.includes(id)}
              equipped={save.equipped.trail === id}
              onBuy={() => buy('trails', id, t.price)}
              onEquip={() => equip('trail', id)}
            />
          ))}
        </Section>
      </ScrollView>

      <Button label="BACK" onPress={() => go('menu')} style={styles.wide} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function Item({
  label,
  color,
  price,
  owned,
  equipped,
  onBuy,
  onEquip,
}: {
  label: string;
  color: string;
  price: number;
  owned: boolean;
  equipped: boolean;
  onBuy: () => void;
  onEquip: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.item}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.itemLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {equipped ? (
        <Text style={styles.equipped}>EQUIPPED</Text>
      ) : owned ? (
        <Button label="EQUIP" variant="ghost" onPress={onEquip} style={styles.itemBtn} />
      ) : (
        <Button label={`✦ ${price}`} variant="ghost" onPress={onBuy} style={styles.itemBtn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  h1: { color: '#EAF0FF', fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  balance: { color: '#FFDD88', fontSize: 20, fontWeight: '800' },
  section: { color: '#7C88B0', letterSpacing: 3, marginBottom: 8, fontSize: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#131A30',
    borderRadius: 12,
    padding: 12,
  },
  swatch: { width: 26, height: 26, borderRadius: 8 },
  itemLabel: { color: '#EAF0FF', fontSize: 16, fontWeight: '700' },
  itemBtn: { minWidth: 0 },
  equipped: { color: '#7CE0A6', fontWeight: '800', letterSpacing: 1 },
  wide: { width: '100%' },
});
