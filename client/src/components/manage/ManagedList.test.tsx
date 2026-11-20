// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ManagedList } from './ManagedList';

const ROWS = [{ id: 'p1', name: 'Sam' }];

describe('ManagedList', () => {
  it('opens the editor for a row and for a new one, and hides a deleted row at once', async () => {
    render(
      <ManagedList
        what='persona'
        rows={ROWS}
        summary={() => 'summary'}
        newLabel='New persona'
        emptyText='None yet.'
        editor={(row) => <p>Editing {row?.name ?? 'new'}</p>}
        onDelete={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Sam/ }));
    expect(await screen.findByText('Editing Sam')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Sam' }));
    expect(screen.queryByRole('button', { name: /^Sam/ })).not.toBeInTheDocument();
    expect(screen.getByText('None yet.')).toBeInTheDocument();
  });
});
