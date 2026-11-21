// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, within } from 'storybook/test';
import { RollSheet } from './RollSheet';

const meta: Meta<typeof RollSheet> = {
  title: 'Play/Roll',
  component: RollSheet,
  args: { open: true, onOpenChange: fn(), rollers: [], initial: null, onRolled: fn() },
};
export default meta;
type Story = StoryObj<typeof RollSheet>;

/** A chat with no cast: nobody can roll, and the tray is not shown. */
export const NobodyToRoll: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('heading', { name: 'Roll' })).toBeVisible();
    await expect(page.getByText('Nobody in this chat can roll yet.')).toBeVisible();
  },
};
