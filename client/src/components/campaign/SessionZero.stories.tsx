// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SessionZero } from './SessionZero';

const meta: Meta<typeof SessionZero> = {
  title: 'Campaigns/Session zero',
  component: SessionZero,
  args: { create: fn(async () => ({ id: 'story-campaign' })), onSaved: fn() },
};
export default meta;
type Story = StoryObj<typeof SessionZero>;

/** The first question: Next opens once the game has a name. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Name'), 'The Kestrel');
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(canvas.getByRole('heading', { name: 'The tone' })).toHaveFocus();
  },
};

/** The way through to the frame, as the players' brief, and saving it. */
export const ToTheFrame: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Name'), 'The Kestrel');
    for (let step = 0; step < 8; step += 1) {
      await userEvent.click(canvas.getByRole('button', { name: /^(Next|See the frame)$/ }));
    }
    await expect(canvas.getByRole('heading', { name: 'The Kestrel' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Save the campaign' }));
    await expect(args.onSaved).toHaveBeenCalledWith('story-campaign');
  },
};
