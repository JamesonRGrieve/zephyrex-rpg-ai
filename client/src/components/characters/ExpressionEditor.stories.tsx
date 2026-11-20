// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ExpressionSprites } from './ExpressionEditor';

const DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const meta: Meta<typeof ExpressionSprites> = {
  title: 'Characters/Expression sprites',
  component: ExpressionSprites,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: {
    name: 'Ada Vance',
    sprites: [
      { id: 's1', label: 'joy', image: DOT },
      { id: 's2', label: 'anger', image: DOT },
    ],
    onAdd: fn(async () => null),
    onRemove: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof ExpressionSprites>;

/** Each feeling's picture, named for the character; a picture can be chosen once a feeling is named. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Ada Vance, joy' })).toBeInTheDocument();
    const choose = canvas.getByLabelText('Choose a sprite picture');
    await expect(choose).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Feeling'), 'fear');
    await expect(choose).toBeEnabled();
  },
};

/** No sprites yet: only the way to add one. */
export const Empty: Story = {
  args: { sprites: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('list', { name: 'Sprites' })).not.toBeInTheDocument();
  },
};
