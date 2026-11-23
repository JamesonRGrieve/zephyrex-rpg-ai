// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DEVICE_SETTINGS, saveDeviceSettings } from './deviceSettings';
import { deviceSettingsStore, useDeviceSettings } from './useDeviceSettings';

beforeEach(() => {
  window.localStorage.clear();
  deviceSettingsStore.reset();
});

describe('useDeviceSettings', () => {
  it('reads what is stored, and a change reaches every reader and storage', () => {
    saveDeviceSettings(window.localStorage, { ...DEFAULT_DEVICE_SETTINGS, textSize: 'large' });
    const first = renderHook(() => useDeviceSettings());
    const second = renderHook(() => useDeviceSettings());
    expect(first.result.current.settings.textSize).toBe('large');
    act(() => first.result.current.change({ voiceMode: 'autoplay' }));
    expect(second.result.current.settings.voiceMode).toBe('autoplay');
    deviceSettingsStore.reset();
    expect(deviceSettingsStore.snapshot()).toMatchObject({ textSize: 'large', voiceMode: 'autoplay' });
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useDeviceSettings());
    expect(result.current.settings.showTableTalk).toBe(true);
    saveDeviceSettings(window.localStorage, { ...DEFAULT_DEVICE_SETTINGS, showTableTalk: false });
    act(() => {
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current.settings.showTableTalk).toBe(false);
  });
});
