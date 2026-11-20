// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How much this device can do, so heavy features adapt instead of disappearing (docs/SUITE.md,
 * Mobile and PWA). Pure: `deviceTier` decides from what `readDeviceSignals` (probe.ts) measured,
 * and the person can override the result in settings.
 *
 * - `strong`: WebGL2 or WebGPU with room to spare. Live lighting shaders, full textures, local
 *   models where WebGPU and memory allow.
 * - `standard`: WebGL2 on a modest GPU or under power saving. Baked lighting, lower-resolution
 *   atlases, server models.
 * - `light`: no WebGL2, little memory, slow frames or data saving. Canvas2D, server-computed masks,
 *   static effects, server models.
 */

export type DeviceTier = 'strong' | 'standard' | 'light';

export interface DeviceSignals {
  webgpu: boolean;
  webgl2: boolean;
  /** The GPU's largest texture side, 0 when unknown. */
  maxTextureSize: number;
  /** `navigator.deviceMemory` in GiB, null when the browser does not say. */
  memoryGiB: number | null;
  cores: number;
  /** Median frame time of a short sample, in ms, null when not measured. */
  frameMs: number | null;
  saveData: boolean;
  lowBattery: boolean;
}

/** Thresholds (named, so a change is one edit and its test). */
export const TIER_RULES = {
  strongTexture: 8192,
  strongMemoryGiB: 8,
  strongCores: 6,
  lightMemoryGiB: 2,
  lightFrameMs: 34,
  standardFrameMs: 20,
} as const;

export function deviceTier(signals: DeviceSignals): DeviceTier {
  const memory = signals.memoryGiB;
  if (!signals.webgl2 && !signals.webgpu) return 'light';
  if (signals.saveData || (memory !== null && memory <= TIER_RULES.lightMemoryGiB)) return 'light';
  if (signals.frameMs !== null && signals.frameMs > TIER_RULES.lightFrameMs) return 'light';
  const roomy =
    signals.maxTextureSize >= TIER_RULES.strongTexture &&
    (memory === null || memory >= TIER_RULES.strongMemoryGiB) &&
    signals.cores >= TIER_RULES.strongCores &&
    (signals.frameMs === null || signals.frameMs <= TIER_RULES.standardFrameMs);
  return roomy && !signals.lowBattery ? 'strong' : 'standard';
}

/** Whether a small model may run in this browser (WebGPU with enough memory, on a strong device). */
export function canRunLocalModel(signals: DeviceSignals): boolean {
  return signals.webgpu && deviceTier(signals) === 'strong' && (signals.memoryGiB ?? 0) >= TIER_RULES.strongMemoryGiB;
}
