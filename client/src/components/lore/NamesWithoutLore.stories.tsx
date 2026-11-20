// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NamesWithoutLore } from './NamesWithoutLore';

const meta: Meta<typeof NamesWithoutLore> = {
  title: 'Lore/Names without lore',
  component: NamesWithoutLore,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: {
    names: ['Port Vesna', 'Guild', 'Old Harrow'],
    books: [{ id: 'b1', name: 'Kestrel' }],
    onAdd: fn(async () => null),
  },
};
export default meta;
type Story = StoryObj<typeof NamesWithoutLore>;

/** Names the story keeps using, each a tap from a stub entry. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add a stub for Guild' }));
    await expect(args.onAdd).toHaveBeenCalledWith('Guild', 'b1');
  },
};

/** Nothing missing. */
export const AllKnown: Story = { args: { names: [] } };

/** No lorebook yet. */
export const NoLorebook: Story = { args: { books: [] } };
