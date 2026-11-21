// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { CampaignBrief } from './CampaignBrief';
import { DUNMARCH, KESTREL, SOLENNE } from './fixtures';

const meta: Meta<typeof CampaignBrief> = { title: 'Campaign/Brief', component: CampaignBrief, args: { campaign: KESTREL } };
export default meta;
type Story = StoryObj<typeof CampaignBrief>;

export const Brief: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { name: 'What is true' })).toBeInTheDocument();
  },
};

/** A real campaign's frame on a phone: long premise, several truths, the party list. */
export const SolenneOnAPhone: Story = {
  args: { campaign: SOLENNE },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { level: 1, name: 'Solenne' })).toBeVisible();
  },
};

export const DunmarchOnAPhone: Story = {
  args: { campaign: DUNMARCH },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    // A scenario lists no party: who plays belongs to each campaign.
    await expect(within(canvasElement).queryByRole('heading', { name: 'The characters' })).toBeNull();
  },
};
