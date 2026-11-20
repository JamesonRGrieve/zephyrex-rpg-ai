// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ADA_REPLY, TABLE_TALK, USER_LINE } from './fixtures';
import { MessageItem } from './MessageItem';

describe('MessageItem', () => {
  it('pages through alternatives and branches', async () => {
    const onSwipe = vi.fn();
    const onFork = vi.fn();
    const { rerender } = render(<MessageItem message={ADA_REPLY} onSwipe={onSwipe} />);
    expect(screen.getByRole('button', { name: 'Previous reply' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next reply' }));
    expect(onSwipe).toHaveBeenCalledWith(1);
    rerender(<MessageItem message={USER_LINE} onFork={onFork} />);
    await userEvent.click(screen.getByRole('button', { name: 'Previous branch' }));
    expect(onFork).toHaveBeenCalledWith(-1);
  });

  it('names table talk as such and leaves out the portrait', () => {
    render(<MessageItem message={TABLE_TALK} />);
    expect(screen.getByRole('article', { name: 'Sam, table talk' })).toBeInTheDocument();
    expect(screen.queryByText('S')).not.toBeInTheDocument();
  });

  it('edits in place from the menu', async () => {
    const onEdit = vi.fn();
    render(<MessageItem message={USER_LINE} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: "More for Sam's message" }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const box = screen.getByLabelText('Edit message');
    await userEvent.clear(box);
    await userEvent.type(box, 'I hand her the wrench.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenCalledWith('I hand her the wrench.');
  });
});
