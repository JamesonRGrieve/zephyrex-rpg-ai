// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ToolSwitches } from './ToolSwitches';

const meta: Meta<typeof ToolSwitches> = {
  title: 'Play/Tool switches',
  component: ToolSwitches,
  args: {
    off: [],
    onChange: fn(),
    tools: [
      { name: 'web_search', label: 'Web search', hint: 'Looks things up on the web', unavailable: null },
      { name: 'draw', label: 'Pictures', hint: 'Draws a scene or a portrait', unavailable: null },
      { name: 'lore', label: 'Lore lookup', hint: 'Reads an entry from the chat’s lorebooks', unavailable: null },
      { name: 'roll', label: 'Dice', hint: 'Rolls through the VTT', unavailable: 'Needs the VTT loaded' },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof ToolSwitches>;

/** Every tool the install has, on; the dice wait for the VTT. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch', { name: 'Dice' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('switch', { name: 'Pictures' }));
    await expect(args.onChange).toHaveBeenCalledWith(['draw']);
  },
};

/** Web search switched off for this chat. */
export const OneOff: Story = {
  args: { off: ['web_search'] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('switch', { name: 'Web search' })).not.toBeChecked();
  },
};
