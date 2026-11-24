// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, within } from 'storybook/test';
import { StartingLevelField } from './StartingLevel';

const meta: Meta<typeof StartingLevelField> = { title: 'Play/Starting level', component: StartingLevelField };
export default meta;
type Story = StoryObj<typeof StartingLevelField>;

/** A 5e scenario at level 4 of the SRD's 20. */
export const AtFour: Story = {
  args: { levels: { maxLevel: 20, startingLevel: 4 }, saving: false, report: null, onCommit: fn() },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByText('4 of 20')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Starting level' })).toHaveAttribute('aria-valuenow', '4');
  },
};

/** After a build: what each pregen still has to choose. */
export const WithOpenChoices: Story = {
  args: {
    levels: { maxLevel: 20, startingLevel: 10 },
    saving: false,
    report: 'Dingus McQuingus the Eighteenth: open subclass, ability, spells',
    onCommit: fn(),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/open subclass/)).toBeVisible();
  },
};
