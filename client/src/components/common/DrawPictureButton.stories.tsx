// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DrawPictureButton } from './DrawPictureButton';

const meta: Meta<typeof DrawPictureButton> = {
  title: 'Common/Draw a picture',
  component: DrawPictureButton,
  args: { label: 'Draw a portrait', onDrawn: fn(), onProblem: fn() },
};
export default meta;
type Story = StoryObj<typeof DrawPictureButton>;

/** Drawn: the picture is handed back. */
export const Drawn: Story = {
  args: { draw: fn(async () => ({ image: 'data:image/png;base64,AA' })) },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Draw a portrait' }));
    await waitFor(() => expect(args.onDrawn).toHaveBeenCalledWith('data:image/png;base64,AA'));
  },
};

/** No model draws yet: the reason goes back to be shown. */
export const NoModel: Story = {
  args: {
    draw: fn(async () => {
      throw new Error('Set a model to draw pictures first');
    }),
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Draw a portrait' }));
    await waitFor(() => expect(args.onProblem).toHaveBeenLastCalledWith('Set a model to draw pictures first'));
  },
};
