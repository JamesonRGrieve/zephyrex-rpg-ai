// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LineQueue } from './LineQueue';

const TESSALY = { id: 'tessaly', name: 'Tessaly Kord' };
const PRESENT = [
  { id: 'wren', name: 'Wren' },
  { id: 'mags', name: 'Mags' },
];

const meta: Meta<typeof LineQueue> = {
  title: 'Play/Line queue',
  component: LineQueue,
  args: {
    me: TESSALY,
    speakers: [TESSALY, ...PRESENT],
    present: PRESENT,
    disabled: false,
    onSend: fn(),
    onOutOfGame: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof LineQueue>;

/** A character's turn: a Say and a Do queued, sent as one message of structured lines. */
export const SayAndDo: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Say' }));
    await userEvent.type(canvas.getByLabelText('What is said'), 'Quiet.');
    await userEvent.click(canvas.getByRole('button', { name: 'Do' }));
    await userEvent.type(canvas.getByLabelText('What is done'), 'bangs on the wall.');
    await expect(within(canvas.getByRole('list', { name: 'Queued lines' })).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: 'Send (2)' }));
    await expect(args.onSend).toHaveBeenCalledWith('Tessaly Kord (to everyone): "Quiet."\nTessaly Kord bangs on the wall.');
    // The queue empties once sent.
    await expect(canvas.queryByRole('list', { name: 'Queued lines' })).toBeNull();
  },
};

/** The GM's seat: each item names who speaks, the narrator by default. */
export const AsTheGm: Story = {
  args: { me: null },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Do' }));
    await expect(canvas.getByLabelText('Who speaks')).toHaveValue('');
    await userEvent.type(canvas.getByLabelText('What is done'), 'The lights flicker.');
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
    await expect(args.onSend).toHaveBeenCalledWith('Narrator: The lights flicker.');
  },
};

/** Out of game goes to the GM on its own channel, never into the story. */
export const OutOfGame: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Out of game' }));
    await userEvent.type(canvas.getByLabelText('Out of game'), 'Can I use the vox here?');
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
    await expect(args.onOutOfGame).toHaveBeenCalledWith('Can I use the vox here?');
    await expect(args.onSend).not.toHaveBeenCalled();
  },
};
