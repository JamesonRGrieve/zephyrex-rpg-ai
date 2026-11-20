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

export const TableTalk: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Table talk' }));
    await expect(canvas.getByLabelText('Table talk')).toBeInTheDocument();
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
