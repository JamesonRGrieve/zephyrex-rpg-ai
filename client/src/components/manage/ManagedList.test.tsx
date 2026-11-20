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

describe('ManagedList deletes', () => {
  it('deletes only once the undo window has passed (fake timers)', async () => {
    const { act } = await import('@testing-library/react');
    const { UNDO_MS } = await import('zephyrex/hooks/useToast');
    vi.useFakeTimers();
    try {
      const onDelete = vi.fn();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <ManagedList
          what='persona'
          rows={[{ id: 'p1', name: 'Sam' }]}
          summary={() => 'summary'}
          newLabel='New persona'
          emptyText='None yet.'
          editor={() => null}
          onDelete={onDelete}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Delete Sam' }));
      expect(screen.queryByRole('button', { name: /^Sam/ })).not.toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(UNDO_MS);
      });
      expect(onDelete).toHaveBeenCalledWith({ id: 'p1', name: 'Sam' });
    } finally {
      vi.useRealTimers();
    }
  });
});
