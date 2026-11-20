// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

describe('Composer', () => {
  it('sends a story line with Enter and clears the box', async () => {
    const onSend = vi.fn();
    render(<Composer writing={false} onSend={onSend} onStop={vi.fn()} />);
    const box = screen.getByLabelText('Your next line');
    await userEvent.type(box, 'I open the hatch.{Enter}');
    expect(onSend).toHaveBeenCalledWith('I open the hatch.', 'ic');
    expect(box).toHaveValue('');
  });

  it('sends table talk once the switch is turned', async () => {
    const onSend = vi.fn();
    render(<Composer writing={false} onSend={onSend} onStop={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Table talk' }));
    await userEvent.type(screen.getByLabelText('Table talk'), 'pizza?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith('pizza?', 'ooc');
  });

  it('offers to stop a reply being written', async () => {
    const onStop = vi.fn();
    render(<Composer writing onSend={vi.fn()} onStop={onStop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop the reply' }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
