// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_SETTINGS,
  effectiveTier,
  loadDeviceSettings,
  parseDeviceSettings,
  saveDeviceSettings,
} from './deviceSettings';

describe('device settings', () => {
  it('reads what was saved, and the defaults for anything unknown', () => {
    expect(parseDeviceSettings('{"tier":"light","showTableTalk":false}')).toEqual({
      ...DEFAULT_DEVICE_SETTINGS,
      tier: 'light',
      showTableTalk: false,
    });
    expect(parseDeviceSettings('{"chatLayout":"document","textSize":"larger"}')).toMatchObject({
      chatLayout: 'document',
      textSize: 'larger',
    });
    expect(parseDeviceSettings('{"chatLayout":"comic","textSize":"huge"}')).toMatchObject({
      chatLayout: 'flat',
      textSize: 'normal',
    });
    expect(parseDeviceSettings('{"tier":"ultra","showTableTalk":"yes"}')).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(parseDeviceSettings('not json')).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(parseDeviceSettings(null)).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it('survives storage that refuses or is missing', () => {
    const refusing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadDeviceSettings(refusing)).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(saveDeviceSettings(refusing, DEFAULT_DEVICE_SETTINGS)).toBe(false);
    expect(loadDeviceSettings(undefined)).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it('round-trips through real storage', () => {
    const chosen = {
      ...DEFAULT_DEVICE_SETTINGS,
      tier: 'strong' as const,
      showTableTalk: false,
      showExpressions: false,
      textSize: 'large' as const,
    };
    expect(saveDeviceSettings(window.localStorage, chosen)).toBe(true);
    expect(loadDeviceSettings(window.localStorage)).toEqual(chosen);
  });

  it('uses the measured tier unless the person chose one', () => {
    expect(effectiveTier('auto', 'standard')).toBe('standard');
    expect(effectiveTier('light', 'strong')).toBe('light');
  });
});
