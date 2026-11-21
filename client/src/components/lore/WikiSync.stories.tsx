// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WikiSyncControl } from './WikiSync';

const meta: Meta<typeof WikiSyncControl> = {
  title: 'Lore/WikiSync',
  component: WikiSyncControl,
  args: { syncedAt: null, onSync: fn(async () => null) },
};
export default meta;

type Story = StoryObj<typeof WikiSyncControl>;

export const NeverPulled: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Not pulled from the wiki yet')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Sync from wiki' }));
    await expect(args.onSync).toHaveBeenCalledOnce();
  },
};

export const PullFailed: Story = {
  args: { syncedAt: '2026-11-20T09:00:00Z', onSync: fn(async () => 'Not synced: the wiki is not reachable') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sync from wiki' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('the wiki is not reachable');
  },
};
