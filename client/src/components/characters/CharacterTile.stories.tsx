// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CharacterTile } from './CharacterTile';

const ADA = { id: 'c-ada', name: 'Ada Vance', avatar: null, tags: ['sci-fi', 'engineer'], favourite: false, description: 'A ship’s engineer with a dry wit.' };

const meta: Meta<typeof CharacterTile> = {
  title: 'Characters/Character tile',
  component: CharacterTile,
  decorators: [(Story) => <div className='max-w-xs'>{Story()}</div>],
  args: { character: ADA, onToggleFavourite: fn() },
};
export default meta;
type Story = StoryObj<typeof CharacterTile>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('AV')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Favourite Ada Vance' }));
    await expect(args.onToggleFavourite).toHaveBeenCalled();
  },
};

export const Favourite: Story = { args: { character: { ...ADA, favourite: true } } };
