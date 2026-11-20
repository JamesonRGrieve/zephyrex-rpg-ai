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

  it('attaches pictures to a story line, and sends them with it', async () => {
    const onSend = vi.fn();
    render(<Composer writing={false} onSend={onSend} onStop={vi.fn()} />);
    const png = new File([new Uint8Array([1, 2, 3])], 'map.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Attach a picture'), png);
    expect(await screen.findByRole('img', { name: 'Attached picture 1' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Your next line'), 'What is this?{Enter}');
    expect(onSend).toHaveBeenCalledWith('What is this?', 'ic', ['data:image/png;base64,AQID']);
  });

  it('runs a slash command instead of sending it, and says why a line is not one', async () => {
    const onSend = vi.fn();
    const onCommand = vi.fn();
    render(<Composer writing={false} onSend={onSend} onStop={vi.fn()} onCommand={onCommand} />);
    const box = screen.getByLabelText('Your next line');
    await userEvent.type(box, '/sys The lights flicker.{Enter}');
    expect(onCommand).toHaveBeenCalledWith({ name: 'sys', text: 'The lights flicker.' });
    await userEvent.type(box, '/dance{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('/dance is not a command (try /help)');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('runs a script whole, and a lone chat command as a command', async () => {
    const onSend = vi.fn();
    const onCommand = vi.fn();
    const onScript = vi.fn();
    render(<Composer writing={false} onSend={onSend} onStop={vi.fn()} onCommand={onCommand} onScript={onScript} />);
    const box = screen.getByLabelText('Your next line');
    await userEvent.type(box, '/setvar key=hp 10 | /sys Ready.{Enter}');
    expect(onScript).toHaveBeenCalledWith('/setvar key=hp 10 | /sys Ready.');
    expect(box).toHaveValue('');
    await userEvent.type(box, '/sys Alone.{Enter}');
    expect(onCommand).toHaveBeenCalledWith({ name: 'sys', text: 'Alone.' });
    expect(onScript).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('offers to stop a reply being written', async () => {
    const onStop = vi.fn();
    render(<Composer writing onSend={vi.fn()} onStop={onStop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop the reply' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  describe('quick replies that run by themselves (A38)', () => {
    const reply = (
      id: string,
      autoRun: 'chat_open' | 'after_send' | 'after_reply',
      action: 'send' | 'fill',
      text: string,
    ) => ({
      id,
      label: id,
      text,
      action,
      channel: 'ooc' as const,
      autoRun,
    });

    it('sends once when the chat opens, and fills the box when one fills', () => {
      const onSend = vi.fn();
      const replies = [
        reply('hello', 'chat_open', 'send', 'Hi, all.'),
        reply('start', 'chat_open', 'fill', 'Where were we?'),
      ];
      const { rerender } = render(<Composer writing={false} onSend={onSend} onStop={vi.fn()} quickReplies={replies} />);
      rerender(<Composer writing={false} onSend={onSend} onStop={vi.fn()} quickReplies={[...replies]} />);
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith('Hi, all.', 'ooc');
      // The fill is table talk, so the box is too.
      expect(screen.getByLabelText('Table talk')).toHaveValue('Where were we?');
    });

    it('fills the box after a send, and after each reply while it is empty', async () => {
      const onSend = vi.fn();
      const replies = [
        reply('again', 'after_send', 'fill', 'And then'),
        reply('next', 'after_reply', 'fill', 'I look around.'),
      ];
      const { rerender } = render(
        <Composer writing={false} onSend={onSend} onStop={vi.fn()} quickReplies={replies} repliesWritten={0} />,
      );
      const box = screen.getByLabelText('Your next line');
      await userEvent.type(box, 'I wave.{Enter}');
      expect(box).toHaveValue('And then');
      await userEvent.clear(box);
      rerender(<Composer writing={false} onSend={onSend} onStop={vi.fn()} quickReplies={replies} repliesWritten={1} />);
      expect(box).toHaveValue('I look around.');
    });
  });
});
