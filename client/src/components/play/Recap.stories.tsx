// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Recap } from './Recap';

const meta: Meta<typeof Recap> = {
  title: 'Play/Recap',
  component: Recap,
  decorators: [(Story) => <div className='max-w-2xl'>{Story()}</div>],
  args: {
    summary: 'The crew boarded the Kestrel at dawn. Ada found the coolant leak; Bram still owes the Guild.',
    onRead: fn(),
    onHide: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof Recap>;

/** The story so far, at the top of a returning session. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Read the recap aloud' }));
    await expect(args.onRead).toHaveBeenCalled();
  },
};

/** Where the browser cannot speak: no read button. */
export const Silent: Story = { args: { onRead: undefined } };
