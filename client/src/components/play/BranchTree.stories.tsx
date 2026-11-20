// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { BranchTree } from './BranchTree';

const meta: Meta<typeof BranchTree> = {
  title: 'Play/Branch tree',
  component: BranchTree,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: {
    rows: [
      { id: 'a', speaker: 'Ada Vance', text: '*wipes her hands* Welcome aboard.', depth: 0, onPath: true, leaf: false },
      { id: 'b1', speaker: 'Sam', text: 'Thanks. Where do I sleep?', depth: 1, onPath: false, leaf: true },
      { id: 'b2', speaker: 'Sam', text: 'Is that coolant I smell?', depth: 1, onPath: true, leaf: false },
      { id: 'c', speaker: 'Ada Vance', text: 'Mind the coolant.', depth: 1, onPath: true, leaf: true },
    ],
    onPick: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof BranchTree>;

export const Fork: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Where do I sleep/ }));
    await expect(args.onPick).toHaveBeenCalledWith('b1');
  },
};
