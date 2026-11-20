// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { CampaignBrief } from './CampaignBrief';
import { KESTREL } from './fixtures';

const meta: Meta<typeof CampaignBrief> = { title: 'Campaign/Brief', component: CampaignBrief, args: { campaign: KESTREL } };
export default meta;
type Story = StoryObj<typeof CampaignBrief>;

export const Brief: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { name: 'What is true' })).toBeInTheDocument();
  },
};
