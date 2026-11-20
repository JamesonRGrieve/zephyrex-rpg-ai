// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { canRunLocalModel, type DeviceSignals, deviceTier } from './tier';

const DESKTOP: DeviceSignals = {
  webgpu: true,
  webgl2: true,
  maxTextureSize: 16384,
  memoryGiB: 8,
  cores: 16,
  frameMs: 8,
  saveData: false,
  lowBattery: false,
};

describe('deviceTier', () => {
  it('gives a roomy GPU the strong tier, and lets it run a local model', () => {
    expect(deviceTier(DESKTOP)).toBe('strong');
    expect(canRunLocalModel(DESKTOP)).toBe(true);
  });

  it('keeps a mid phone on the standard tier', () => {
    const phone = { ...DESKTOP, webgpu: false, maxTextureSize: 4096, memoryGiB: 4, cores: 8, frameMs: 16 };
    expect(deviceTier(phone)).toBe('standard');
    expect(canRunLocalModel(phone)).toBe(false);
  });

  it('drops to light with no WebGL, little memory, slow frames or data saving', () => {
    expect(deviceTier({ ...DESKTOP, webgpu: false, webgl2: false })).toBe('light');
    expect(deviceTier({ ...DESKTOP, memoryGiB: 2 })).toBe('light');
    expect(deviceTier({ ...DESKTOP, frameMs: 50 })).toBe('light');
    expect(deviceTier({ ...DESKTOP, saveData: true })).toBe('light');
  });

  it('steps a strong device down to standard on low battery', () => {
    expect(deviceTier({ ...DESKTOP, lowBattery: true })).toBe('standard');
  });

  it('treats unknown memory as no reason to step down', () => {
    expect(deviceTier({ ...DESKTOP, memoryGiB: null })).toBe('strong');
    expect(canRunLocalModel({ ...DESKTOP, memoryGiB: null })).toBe(false);
  });
});
