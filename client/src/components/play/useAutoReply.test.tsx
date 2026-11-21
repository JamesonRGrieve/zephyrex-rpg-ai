// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoReply } from './useAutoReply';

describe('useAutoReply (audit gap 6)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('takes a turn after the quiet spell, restarting on a new line or a key, never while not ready', () => {
    const onTurn = vi.fn();
    const { rerender } = renderHook(
      (props: { ready: boolean; quietKey: string }) => useAutoReply({ seconds: 10, onTurn, ...props }),
      {
        initialProps: { ready: true, quietKey: 'm1' },
      },
    );
    act(() => vi.advanceTimersByTime(9000));
    rerender({ ready: true, quietKey: 'm2' });
    act(() => vi.advanceTimersByTime(9000));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    act(() => vi.advanceTimersByTime(9000));
    expect(onTurn).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onTurn).toHaveBeenCalledTimes(1);
    rerender({ ready: false, quietKey: 'm3' });
    act(() => vi.advanceTimersByTime(60000));
    expect(onTurn).toHaveBeenCalledTimes(1);
  });

  it('does nothing when off', () => {
    const onTurn = vi.fn();
    renderHook(() => useAutoReply({ seconds: 0, ready: true, quietKey: 'm1', onTurn }));
    act(() => vi.advanceTimersByTime(60000));
    expect(onTurn).not.toHaveBeenCalled();
  });
});
