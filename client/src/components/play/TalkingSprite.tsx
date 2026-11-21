// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The stage's sprite (A4), talking while its line is read aloud (A54, talking heads): it flips to
 * the character's `talking` sprite and back, as a mouth moving, or with no such sprite gently bobs.
 * With reduced motion asked for, it stays still.
 */
import { type ReactElement, useEffect, useState, useSyncExternalStore } from 'react';

/** How often a talking sprite flips, in ms: about a syllable. */
export const TALK_FLIP_MS = 160;

const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (listener: () => void): (() => void) => {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
const reducedMotion = (): boolean => window.matchMedia(motionQuery).matches;

export function TalkingSprite({
  image,
  talkingImage,
  speaking,
  alt,
}: {
  image: string;
  /** The character's `talking` sprite, if they have one. */
  talkingImage: string | null;
  speaking: boolean;
  alt: string;
}): ReactElement {
  const still = useSyncExternalStore(subscribeMotion, reducedMotion, () => true);
  const moving = speaking && !still;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!moving || talkingImage === null) return undefined;
    const flip = window.setInterval(() => setOpen((was) => !was), TALK_FLIP_MS);
    return () => window.clearInterval(flip);
  }, [moving, talkingImage]);

  const showTalking = moving && talkingImage !== null && open;
  return (
    <img
      src={showTalking ? talkingImage : image}
      alt={alt}
      data-speaking={speaking ? '' : undefined}
      className={`max-h-48 rounded-lg object-contain${moving && talkingImage === null ? ' animate-bounce [animation-duration:1.2s]' : ''}`}
    />
  );
}
