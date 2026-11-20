// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import { useEffect } from 'react';

/**
 * (Copied from Chronos; a candidate to lift into zephyrex/hooks with AppPage, card 256.)
 *
 * Keeps the screen awake while `active`: a reply being written, or a table in play, is no use once the screen sleeps. The
 * lock is released when the page is hidden, so it is taken again when the page comes back.
 * Browsers without the Wake Lock API simply let the screen sleep.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const take = async (): Promise<void> => {
      if (document.visibilityState !== 'visible') return;
      try {
        const taken = await navigator.wakeLock.request('screen');
        if (cancelled) await taken.release();
        else lock = taken;
      } catch {
        // Refused (battery saver, no user gesture yet): the screen may sleep, nothing breaks.
      }
    };
    const onVisible = (): void => {
      void take();
    };
    void take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock !== null) void lock.release();
    };
  }, [active]);
}
