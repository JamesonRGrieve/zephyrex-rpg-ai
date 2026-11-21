// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { TalkingSprite } from './TalkingSprite';

const dot = (fill: string): string =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="36" fill="${fill}"/></svg>`)}`;

const meta: Meta<typeof TalkingSprite> = {
  title: 'Play/Talking sprite',
  component: TalkingSprite,
  args: { image: dot('#8a8'), talkingImage: dot('#a88'), alt: 'Ada, calm' },
};
export default meta;
type Story = StoryObj<typeof TalkingSprite>;

/** Speaking: the sprite flips with its talking sprite. */
export const Speaking: Story = {
  args: { speaking: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'Ada, calm' })).toHaveAttribute('data-speaking');
  },
};

/** Quiet: the expression alone. */
export const Quiet: Story = {
  args: { speaking: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'Ada, calm' })).not.toHaveAttribute('data-speaking');
  },
};
