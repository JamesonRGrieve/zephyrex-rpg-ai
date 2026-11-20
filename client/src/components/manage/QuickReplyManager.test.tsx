// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickReplyFormView } from './QuickReplyManager';

describe('QuickReplyFormView', () => {
  it('keeps a quick reply that runs after a reply to filling, never sending', async () => {
    const onSave = vi.fn(async () => null);
    render(<QuickReplyFormView reply={null} onSave={onSave} done={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Button label'), 'Next');
    await userEvent.type(screen.getByLabelText('Line'), 'I look around.');
    await userEvent.click(screen.getByRole('radio', { name: 'After each reply' }));
    expect(screen.getByRole('radio', { name: 'Fill in to edit' })).toHaveAttribute('aria-checked', 'true');
    // Choosing to send puts the trigger back to one that may send.
    await userEvent.click(screen.getByRole('radio', { name: 'Send at once' }));
    expect(screen.getByRole('radio', { name: 'Only when pressed' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'When a chat opens' }));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ label: 'Next', action: 'send', auto_run: 'chat_open' }));
  });

  it('says why a quick reply was not saved', async () => {
    render(
      <QuickReplyFormView
        reply={{
          id: 'q1',
          created_at: 'x',
          updated_at: null,
          label: 'Look',
          message: 'I look.',
          action: 'send',
          channel: 'ic',
          enabled: true,
          position: 0,
          auto_run: 'none',
        }}
        onSave={async () => 'A quick reply that runs after a send or a reply can only fill the composer'}
        done={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText(/can only fill the composer/)).toBeInTheDocument();
  });
});
