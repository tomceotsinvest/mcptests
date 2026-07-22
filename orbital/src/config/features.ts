/**
 * features.ts — feature flags (§12).
 *
 * Everything monetization-related is OFF by default so we can ship a clean,
 * ad-free build for review first. These are compile-time-ish flags read at
 * runtime; flip and rebuild.
 */
export const FEATURES = {
  ADS_ENABLED: false, // rewarded video for continue token / dust doubler
  IAP_ENABLED: false, // one-time "Supporter Pack"
  CONTINUE_TOKENS: true, // resurrect-at-last-planet mechanic
  DAILY_SEED: false, // stretch: seed-of-the-day challenge
  GHOST_REPLAY: false, // stretch: local ghost of best run
  DEBUG_PANEL: __DEV__, // dev tuning panel available in Settings
} as const;
