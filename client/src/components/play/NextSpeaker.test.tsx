// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NextSpeaker } from './NextSpeaker';

const CAST = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bram' },
];

describe('NextSpeaker', () => {
  it('names whose turn it is, and picks or unpicks a character for the next reply', async () => {
    const onPick = vi.fn();
    const { rerender } = render(<NextSpeaker cast={CAST} picked={null} upNext='b' onPick={onPick} />);
    expect(screen.getByRole('radio', { name: 'In turn (Bram)' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Ada' }));
    expect(onPick).toHaveBeenLastCalledWith('a');
    rerender(<NextSpeaker cast={CAST} picked='a' upNext='b' onPick={onPick} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Ada' }));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });
});
