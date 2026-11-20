// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { SampleScene } from './SampleScene';

const meta: Meta<typeof SampleScene> = { title: 'Landing/Sample scene', component: SampleScene };
export default meta;
type Story = StoryObj<typeof SampleScene>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Sam (table talk)')).toBeInTheDocument();
  },
};
