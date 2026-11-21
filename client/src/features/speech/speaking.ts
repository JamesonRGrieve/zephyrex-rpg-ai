// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Who is being read aloud right now (A54, talking heads): set when a line starts and cleared when it
 * ends, is stopped or fails, so the stage can show its speaker talking. `''` is the narrator.
 */
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();
const emit = (): void => {
  for (const listener of listeners) listener();
};

export const speakingStore = {
  snapshot: (): string | null => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  start(speaker: string): void {
    current = speaker;
    emit();
  },
  /** Ends `speaker`'s line; a later line (another speaker) already started is left alone. */
  end(speaker: string): void {
    if (current !== speaker) return;
    current = null;
    emit();
  },
};

const serverSnapshot = (): string | null => null;

export function useSpeaking(): string | null {
  return useSyncExternalStore(speakingStore.subscribe, speakingStore.snapshot, serverSnapshot);
}
