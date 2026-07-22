/**
 * App.tsx — boot + hand-rolled screen switch (§3, §10).
 * A tiny zustand-driven state machine: Boot -> Menu -> Game -> GameOver ->
 * (Menu | Shop | Settings). No nav library.
 */
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from '@/state/store';
import { Boot } from '@/screens/Boot';
import { Menu } from '@/screens/Menu';
import { Game } from '@/screens/Game';
import { GameOver } from '@/screens/GameOver';
import { Shop } from '@/screens/Shop';
import { Settings } from '@/screens/Settings';

export default function App(): React.JSX.Element {
  const screen = useStore((s) => s.screen);
  const boot = useStore((s) => s.boot);

  useEffect(() => {
    boot();
  }, [boot]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        {screen === 'boot' && <Boot />}
        {screen === 'menu' && <Menu />}
        {screen === 'game' && <Game />}
        {screen === 'gameover' && <GameOver />}
        {screen === 'shop' && <Shop />}
        {screen === 'settings' && <Settings />}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060B' },
});
