// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Composer } from './Composer';

const meta: Meta<typeof Composer> = {
  title: 'Play/Composer',
  component: Composer,
  args: { writing: false, onSend: fn(), onStop: fn() },
};
export default meta;
type Story = StoryObj<typeof Composer>;

export const InCharacter: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Your next line'), '((brb)){Enter}');
    await expect(args.onSend).toHaveBeenCalledWith('brb', 'ooc');
  },
};

/** A turn of queued items (docs/DESIGN.md, Structured lines): Say, Do and Out of game. */
export const Queued: Story = {
  args: {
    queue: {
      me: { id: 'tess', name: 'Tessaly Kord' },
      speakers: [{ id: 'wren', name: 'Wren' }],
      present: [{ id: 'wren', name: 'Wren' }],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Say' }));
    await userEvent.type(canvas.getByLabelText('What is said'), 'Quiet.');
    await userEvent.click(canvas.getByRole('button', { name: 'Out of game' }));
    await userEvent.type(canvas.getByLabelText('Out of game'), 'brb');
    await userEvent.click(canvas.getByRole('button', { name: /^Send/ }));
    await expect(args.onSend).toHaveBeenCalledWith('Tessaly Kord (to everyone): "Quiet."', 'ic');
    await expect(args.onSend).toHaveBeenCalledWith('brb', 'gm');
  },
};

export const Writing: Story = { args: { writing: true } };

/** Quick replies above the box (A32): one sends at once, one fills the box to edit. */
export const QuickReplies: Story = {
  args: {
    quickReplies: [
      { id: 'q1', label: 'Look around', text: 'I look around.', action: 'send', channel: 'ic' },
      { id: 'q2', label: 'Pause?', text: 'Can we pause for a minute?', action: 'fill', channel: 'ooc' },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Look around' }));
    await expect(args.onSend).toHaveBeenCalledWith('I look around.', 'ic');
    await userEvent.click(canvas.getByRole('button', { name: 'Pause?' }));
    await expect(canvas.getByDisplayValue('Can we pause for a minute?')).toBeInTheDocument();
  },
};
