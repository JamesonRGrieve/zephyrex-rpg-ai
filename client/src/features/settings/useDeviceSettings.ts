// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import { useCallback, useEffect, useState } from 'react';
import { readDeviceSignals } from '~/features/device/probe';
import { type DeviceTier, deviceTier } from '~/features/device/tier';
import { DEFAULT_DEVICE_SETTINGS, type DeviceSettings, effectiveTier, loadDeviceSettings, saveDeviceSettings } from './deviceSettings';

const browserStorage = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

/** This device's settings, what it measured, and the tier in force. */
export function useDeviceSettings(): {
  settings: DeviceSettings;
  measured: DeviceTier | null;
  tier: DeviceTier | null;
  change(next: Partial<DeviceSettings>): void;
} {
  const [settings, setSettings] = useState(DEFAULT_DEVICE_SETTINGS);
  const [measured, setMeasured] = useState<DeviceTier | null>(null);

  useEffect(() => {
    setSettings(loadDeviceSettings(browserStorage()));
    let live = true;
    void readDeviceSignals().then((signals) => {
      if (live) setMeasured(deviceTier(signals));
    });
    return () => {
      live = false;
    };
  }, []);

  const change = useCallback((next: Partial<DeviceSettings>) => {
    setSettings((current) => {
      const merged = { ...current, ...next };
      saveDeviceSettings(browserStorage(), merged);
      return merged;
    });
  }, []);

  return { settings, measured, tier: measured === null ? null : effectiveTier(settings.tier, measured), change };
}
