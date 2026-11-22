// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Pull down from the top app bar to reload (the operator, 2026-11-22: "I still can't drag up to refresh
 * on the top appbar"). The app installed to a phone runs standalone, where the browser gives no
 * pull-to-refresh of its own. A drag that starts on the bar (the top 64 px) with the page at its top
 * shows an arrow that fills as it's pulled; letting go past the mark reloads.
 */
import { RotateCw } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

const BAR = 64;
const PULL = 96;

export function PullToRefresh(): ReactElement | null {
  const [pull, setPull] = useState(0);
  useEffect(() => {
    let startY: number | null = null;
    let distance = 0;
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      startY = touch !== undefined && touch.clientY <= BAR && window.scrollY <= 0 ? touch.clientY : null;
      distance = 0;
    };
    const move = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (startY === null || touch === undefined) return;
      distance = Math.max(0, touch.clientY - startY);
      setPull(distance);
    };
    const end = () => {
      if (startY !== null && distance >= PULL) window.location.reload();
      startY = null;
      distance = 0;
      setPull(0);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);
  if (pull <= 8) return null;
  const share = Math.min(1, pull / PULL);
  return (
    <div
      role='status'
      aria-label={share >= 1 ? 'Release to reload' : 'Pull to reload'}
      className='pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center'
      style={{ transform: `translateY(${Math.min(pull, PULL + 24) * 0.6}px)` }}
    >
      <span className='mt-2 flex size-10 items-center justify-center rounded-full border bg-background shadow-md'>
        <RotateCw
          className={share >= 1 ? 'size-5 text-primary' : 'size-5 text-muted-foreground'}
          style={{ transform: `rotate(${share * 300}deg)` }}
          aria-hidden
        />
      </span>
    </div>
  );
}
