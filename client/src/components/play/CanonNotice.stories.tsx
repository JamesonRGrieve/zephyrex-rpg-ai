// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { CanonNotice } from './CanonNotice';

const meta: Meta<typeof CanonNotice> = { title: 'Play/Canon notice', component: CanonNotice };
export default meta;
type Story = StoryObj<typeof CanonNotice>;

/** Red: a tech-priest who doesn't know the Omnissiah. */
export const Red: Story = {
  args: {
    notice: {
      level: 'red',
      reason:
        'This flagrantly breaks in-universe canon. The Omnissiah: “The Machine God, worshipped by the Adeptus Mechanicus.”',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Breaks canon:');
  },
};

/** Yellow: a dead NPC spoken of as alive. */
export const Yellow: Story = {
  args: { notice: { level: 'yellow', reason: 'This may contravene established canon. Osric: “Osric died in Session 6.”' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Canon check:');
  },
};

/** No notice: nothing is shown. */
export const None: Story = {
  args: { notice: { level: 'none', reason: '' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('status')).toBeNull();
  },
};
