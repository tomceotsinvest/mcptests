// Metro config — Expo default. tsconfig `paths` (@/*) are resolved by Metro's
// built-in tsconfigPaths support (on by default since Expo SDK 50), so no extra
// resolver plugin is needed.
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
