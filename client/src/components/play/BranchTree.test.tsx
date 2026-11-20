// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BranchTree } from './BranchTree';

const ROWS = [
  { id: 'a', speaker: 'Ada', text: 'Welcome aboard.', depth: 0, onPath: true, leaf: false },
  { id: 'b1', speaker: 'Sam', text: 'Thanks.', depth: 1, onPath: false, leaf: true },
  { id: 'b2', speaker: 'Sam', text: 'Where is the galley?', depth: 1, onPath: true, leaf: true },
];

describe('BranchTree', () => {
  it('marks the branch shown and picks another', async () => {
    const onPick = vi.fn();
    render(<BranchTree rows={ROWS} onPick={onPick} />);
    expect(screen.getByRole('button', { name: /Where is the galley/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Thanks/ })).not.toHaveAttribute('aria-current');
    await userEvent.click(screen.getByRole('button', { name: /Thanks/ }));
    expect(onPick).toHaveBeenCalledWith('b1');
  });

  it('says when nothing is written', () => {
    render(<BranchTree rows={[]} onPick={vi.fn()} />);
    expect(screen.getByText('Nothing written yet.')).toBeInTheDocument();
  });
});
