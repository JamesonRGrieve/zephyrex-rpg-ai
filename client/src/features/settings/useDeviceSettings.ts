// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { readDeviceSignals } from '~/features/device/probe';
import { type DeviceTier, deviceTier } from '~/features/device/tier';
import {
  DEFAULT_DEVICE_SETTINGS,
  type DeviceSettings,
  effectiveTier,
  loadDeviceSettings,
  saveDeviceSettings,
} from './deviceSettings';

const browserStorage = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * This device's settings as one store over localStorage: every component reading them sees a change
 * at once, and a change made in another tab too. The server renders the defaults (it has no
 * storage), so the first client render matches it and then reads the stored settings.
 */
export const deviceSettingsStore = (() => {
  const listeners = new Set<() => void>();
  let cached: DeviceSettings | null = null;
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const onStorage = () => {
    cached = null;
    emit();
  };
  return {
    snapshot(): DeviceSettings {
      cached ??= loadDeviceSettings(browserStorage());
      return cached;
    },
    subscribe(listener: () => void): () => void {
      if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
    change(next: Partial<DeviceSettings>): void {
      cached = { ...this.snapshot(), ...next };
      saveDeviceSettings(browserStorage(), cached);
      emit();
    },
    /** Forgets what was read, so the next read is from storage again (tests). */
    reset(): void {
      cached = null;
    },
  };
})();

const serverSnapshot = (): DeviceSettings => DEFAULT_DEVICE_SETTINGS;

/** This device's settings, what it measured, and the tier in force. */
export function useDeviceSettings(): {
  settings: DeviceSettings;
  measured: DeviceTier | null;
  tier: DeviceTier | null;
  change(next: Partial<DeviceSettings>): void;
} {
  const settings = useSyncExternalStore(
    (listener) => deviceSettingsStore.subscribe(listener),
    () => deviceSettingsStore.snapshot(),
    serverSnapshot,
  );
  const [measured, setMeasured] = useState<DeviceTier | null>(null);

  useEffect(() => {
    let live = true;
    void readDeviceSignals().then((signals) => {
      if (live) setMeasured(deviceTier(signals));
    });
    return () => {
      live = false;
    };
  }, []);

  const change = useCallback((next: Partial<DeviceSettings>) => deviceSettingsStore.change(next), []);

  return { settings, measured, tier: measured === null ? null : effectiveTier(settings.tier, measured), change };
}
