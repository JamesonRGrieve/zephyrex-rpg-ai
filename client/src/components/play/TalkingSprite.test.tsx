// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TALK_FLIP_MS, TalkingSprite } from './TalkingSprite';

afterEach(() => vi.useRealTimers());

describe('TalkingSprite', () => {
  it('flips to the talking sprite and back while speaking', () => {
    vi.useFakeTimers();
    // The test setup's matchMedia answers false for reduced motion.
    render(<TalkingSprite image='calm.png' talkingImage='talk.png' speaking alt='Ada, calm' />);
    const sprite = screen.getByRole('img', { name: 'Ada, calm' });
    expect(sprite).toHaveAttribute('src', 'calm.png');
    act(() => vi.advanceTimersByTime(TALK_FLIP_MS));
    expect(sprite).toHaveAttribute('src', 'talk.png');
    act(() => vi.advanceTimersByTime(TALK_FLIP_MS));
    expect(sprite).toHaveAttribute('src', 'calm.png');
  });

  it('bobs when there is no talking sprite, and is still when not speaking', () => {
    const { rerender } = render(<TalkingSprite image='calm.png' talkingImage={null} speaking alt='Ada' />);
    expect(screen.getByRole('img', { name: 'Ada' }).className).toContain('animate-bounce');
    rerender(<TalkingSprite image='calm.png' talkingImage={null} speaking={false} alt='Ada' />);
    expect(screen.getByRole('img', { name: 'Ada' }).className).not.toContain('animate-bounce');
  });
});
