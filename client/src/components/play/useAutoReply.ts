// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Auto-reply (audit gap 6, SillyTavern's group auto-mode): once a group chat has been quiet for
 * `seconds`, the next member speaks. The countdown restarts whenever `quietKey` changes (a new line)
 * or the person types or presses a key anywhere on the page, and it never runs while not `ready`
 * (a reply streaming, a seat change saving, or the chat paused).
 */
import { useEffect, useRef, useState } from 'react';

export function useAutoReply({
  seconds,
  ready,
  quietKey,
  onTurn,
}: {
  seconds: number;
  ready: boolean;
  quietKey: string;
  onTurn: () => void;
}): void {
  const [touched, setTouched] = useState(0);
  const turn = useRef(onTurn);
  useEffect(() => {
    turn.current = onTurn;
  }, [onTurn]);
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const touch = () => setTouched((count) => count + 1);
    window.addEventListener('input', touch, true);
    window.addEventListener('keydown', touch, true);
    return () => {
      window.removeEventListener('input', touch, true);
      window.removeEventListener('keydown', touch, true);
    };
  }, [seconds]);
  useEffect(() => {
    if (seconds <= 0 || !ready) return undefined;
    const timer = window.setTimeout(() => turn.current(), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, ready, quietKey, touched]);
}
