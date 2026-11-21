// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FirstRun } from './FirstRun';

const meta: Meta<typeof FirstRun> = {
  title: 'Play/FirstRun',
  component: FirstRun,
  args: { hasModel: false, hasCharacter: false, onNewChat: fn() },
};
export default meta;

type Story = StoryObj<typeof FirstRun>;

export const NothingYet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: /Three steps/ })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'New chat' })).toBeDisabled();
  },
};

export const ReadyToChat: Story = {
  args: { hasModel: true, hasCharacter: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'New chat' }));
    await expect(args.onNewChat).toHaveBeenCalledOnce();
  },
};
