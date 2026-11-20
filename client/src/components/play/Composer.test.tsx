// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen, within } from '@testing-library/react';
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

  it('fills the box with the line Impersonate writes, for the person to edit and send', async () => {
    const onSend = vi.fn();
    render(<Composer writing={false} onSend={onSend} onStop={vi.fn()} onImpersonate={async () => '  I wave back.  '} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write my line for me' }));
    expect(await screen.findByDisplayValue('I wave back.')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends a quick reply at once, or fills the box with it to edit', async () => {
    const onSend = vi.fn();
    render(
      <Composer
        writing={false}
        onSend={onSend}
        onStop={vi.fn()}
        quickReplies={[
          { id: 'q1', label: 'Look', text: 'I look around.', action: 'send', channel: 'ic' },
          { id: 'q2', label: 'Pause', text: 'Can we pause?', action: 'fill', channel: 'ooc' },
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'Quick replies' });
    await userEvent.click(within(group).getByRole('button', { name: 'Look' }));
    expect(onSend).toHaveBeenCalledWith('I look around.', 'ic');
    await userEvent.click(within(group).getByRole('button', { name: 'Pause' }));
    expect(await screen.findByDisplayValue('Can we pause?')).toBeInTheDocument();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('offers to stop a reply being written', async () => {
    const onStop = vi.fn();
    render(<Composer writing onSend={vi.fn()} onStop={onStop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop the reply' }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
