// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { medianFrameMs, readDeviceSignals, readWebgl } from './probe';

describe('device probe', () => {
  it('reads no WebGL2 where the browser has none (jsdom), without throwing', () => {
    expect(readWebgl(document)).toEqual({ webgl2: false, maxTextureSize: 0 });
    expect(readWebgl(undefined)).toEqual({ webgl2: false, maxTextureSize: 0 });
  });

  it('takes the median frame interval', () => {
    expect(medianFrameMs([16, 17, 40, 16, 15])).toBe(16);
    expect(medianFrameMs([])).toBeNull();
  });

  it('reads neutral signals from a browser that hides them', async () => {
    const signals = await readDeviceSignals();
    expect(signals).toMatchObject({ webgl2: false, saveData: false, lowBattery: false });
    expect(signals.cores).toBeGreaterThanOrEqual(1);
  });
});
