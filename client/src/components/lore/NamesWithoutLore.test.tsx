// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NamesWithoutLore } from './NamesWithoutLore';

const BOOKS = [
  { id: 'b1', name: 'Kestrel' },
  { id: 'b2', name: 'Guild' },
];

describe('NamesWithoutLore', () => {
  it('adds a stub for a name to the chosen book, and marks it', async () => {
    const onAdd = vi.fn(async () => null);
    render(<NamesWithoutLore names={['Port Vesna', 'Guild']} books={BOOKS} onAdd={onAdd} />);
    await userEvent.selectOptions(screen.getByLabelText('Add stubs to'), 'b2');
    await userEvent.click(screen.getByRole('button', { name: 'Add a stub for Port Vesna' }));
    expect(onAdd).toHaveBeenCalledWith('Port Vesna', 'b2');
    expect(screen.getByText('Stub added')).toBeInTheDocument();
  });

  it('says why a stub was not added', async () => {
    render(<NamesWithoutLore names={['Guild']} books={BOOKS} onAdd={async () => 'Not saved'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a stub for Guild' }));
    expect(await screen.findByText('Not saved')).toBeInTheDocument();
  });

  it('says when nothing is missing, and asks for a lorebook when there is none', () => {
    const { rerender } = render(<NamesWithoutLore names={[]} books={BOOKS} onAdd={vi.fn()} />);
    expect(screen.getByText(/Every name in play so far/)).toBeInTheDocument();
    rerender(<NamesWithoutLore names={['Guild']} books={[]} onAdd={vi.fn()} />);
    expect(screen.getByText('Make a lorebook first to keep notes on them.')).toBeInTheDocument();
  });
});
