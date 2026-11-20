// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reads what the browser says about the device (tier.ts decides from it). Every read is guarded:
 * a browser that hides a signal gives the neutral value, never an error.
 */
import type { DeviceSignals } from './tier';

const FRAME_SAMPLES = 20;
const LOW_BATTERY = 0.2;

interface NavigatorHints {
  gpu?: unknown;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
}

/** WebGL2 support and the GPU's largest texture side, from a throwaway context. */
export function readWebgl(documentRef: Pick<Document, 'createElement'> | undefined): { webgl2: boolean; maxTextureSize: number } {
  if (documentRef === undefined) return { webgl2: false, maxTextureSize: 0 };
  try {
    const canvas = documentRef.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl === null) return { webgl2: false, maxTextureSize: 0 };
    const size = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2: true, maxTextureSize: Number.isFinite(size) ? size : 0 };
  } catch {
    return { webgl2: false, maxTextureSize: 0 };
  }
}

/** The median of a short run of frame intervals, in ms. */
export function medianFrameMs(intervals: readonly number[]): number | null {
  if (intervals.length === 0) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function sampleFrames(): Promise<number | null> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const stamps: number[] = [];
    const tick = (time: number): void => {
      stamps.push(time);
      if (stamps.length > FRAME_SAMPLES) resolve(medianFrameMs(stamps.slice(1).map((stamp, index) => stamp - stamps[index])));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function lowBattery(hints: NavigatorHints): Promise<boolean> {
  try {
    const battery = await hints.getBattery?.();
    return battery !== undefined && !battery.charging && battery.level < LOW_BATTERY;
  } catch {
    return false;
  }
}

/** Everything the tier needs, measured on this device now. */
export async function readDeviceSignals(): Promise<DeviceSignals> {
  const hints: NavigatorHints = typeof navigator === 'undefined' ? {} : (navigator as unknown as NavigatorHints);
  const webgl = readWebgl(typeof document === 'undefined' ? undefined : document);
  const [frameMs, onLowBattery] = await Promise.all([sampleFrames(), lowBattery(hints)]);
  return {
    webgpu: hints.gpu !== undefined,
    ...webgl,
    memoryGiB: typeof hints.deviceMemory === 'number' ? hints.deviceMemory : null,
    cores: typeof hints.hardwareConcurrency === 'number' ? hints.hardwareConcurrency : 1,
    frameMs,
    saveData: hints.connection?.saveData === true,
    lowBattery: onLowBattery,
  };
}
