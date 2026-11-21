// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ScriptPrompt } from './ScriptPrompt';

const meta: Meta<typeof ScriptPrompt> = { title: 'Play/Script prompt', component: ScriptPrompt, args: { onAnswer: fn() } };
export default meta;
type Story = StoryObj<typeof ScriptPrompt>;

/** /input: a question with a text box. */
export const Input: Story = {
  args: { prompt: 'What is your name?', options: null },
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(page.getByRole('textbox', { name: 'Your answer' }), 'Ana{Enter}');
    await expect(args.onAnswer).toHaveBeenCalledWith('Ana');
  },
};

/** /buttons: a question with choices. */
export const Buttons: Story = {
  args: { prompt: 'What now?', options: ['Fight', 'Flee', 'Talk'] },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole('button', { name: 'Talk' }));
    await expect(args.onAnswer).toHaveBeenCalledWith('Talk');
  },
};
