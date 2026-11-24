// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, userEvent, within } from 'storybook/test';
import { RevisionButton } from './RevisionButton';

const meta: Meta<typeof RevisionButton> = { title: 'Play/Revision button', component: RevisionButton };
export default meta;
type Story = StoryObj<typeof RevisionButton>;

/** A line written again because the first answer broke canon; its reasoning is shown apart from the answer. */
export const Canon: Story = {
  args: {
    revision: {
      kind: 'canon',
      reason: 'Osric died in Session 6, and the first answer had him pour the drinks.',
      original: '<think>Osric runs the bar, so he serves them.</think>Osric slides two tankards across the counter.',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Outside the app wrapper there is no drawer, so the details open in place.
    await expect(canvas.queryByText('The first answer')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Written again: show the first answer' }));
    await expect(canvas.getByText('It broke canon.')).toBeInTheDocument();
    await expect(canvas.getByText('Osric slides two tankards across the counter.')).toBeInTheDocument();
    await expect(canvas.getByText('Its reasoning')).toBeInTheDocument();
    await expect(canvas.getByText('Osric runs the bar, so he serves them.')).toBeInTheDocument();
  },
};

/** A first answer that spoke for the person's character, with no reasoning to show. */
export const SpokeForYou: Story = {
  args: {
    revision: {
      kind: 'voice',
      reason: 'It had Tessaly agree to the deal.',
      original: 'Tessaly nods and shakes the trader’s hand.',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Written again: show the first answer' }));
    await expect(canvas.getByText('It spoke for your character.')).toBeInTheDocument();
    await expect(canvas.queryByText('Its reasoning')).toBeNull();
    // A second tap folds the details away again.
    await userEvent.click(canvas.getByRole('button', { name: 'Written again: show the first answer' }));
    await expect(canvas.queryByText('The first answer')).toBeNull();
  },
};
