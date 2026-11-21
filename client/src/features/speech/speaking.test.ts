// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { speakingStore } from './speaking';

describe('speakingStore', () => {
  it('knows who is speaking, and a line ending never clears a later speaker', () => {
    const seen: (string | null)[] = [];
    const stop = speakingStore.subscribe(() => seen.push(speakingStore.snapshot()));
    speakingStore.start('ada');
    speakingStore.start('bram');
    speakingStore.end('ada');
    expect(speakingStore.snapshot()).toBe('bram');
    speakingStore.end('bram');
    stop();
    expect(seen).toEqual(['ada', 'bram', null]);
  });
});
