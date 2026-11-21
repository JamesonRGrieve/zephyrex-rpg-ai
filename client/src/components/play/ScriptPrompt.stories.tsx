// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ScriptPrompt } from './ScriptPrompt';

const meta: Meta<typeof ScriptPrompt> = { title: 'Play/Script prompt', component: ScriptPrompt, args: { onAnswer: fn() } };
export default meta;
type Story = StoryObj<typeof ScriptPrompt>;

/** The element, once the dialog's opening animation lets it take pointer input. */
async function ready<T extends HTMLElement>(element: T): Promise<T> {
  await waitFor(() => expect(getComputedStyle(element).pointerEvents).not.toBe('none'));
  return element;
}

/** /input: a question with a text box. */
export const Input: Story = {
  args: { prompt: 'What is your name?', options: null },
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await ready(await page.findByRole('textbox', { name: 'Your answer' })), 'Ana{Enter}');
    await expect(args.onAnswer).toHaveBeenCalledWith('Ana');
  },
};

/** /buttons: a question with choices. */
export const Buttons: Story = {
  args: { prompt: 'What now?', options: ['Fight', 'Flee', 'Talk'] },
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await ready(await page.findByRole('button', { name: 'Talk' })));
    await expect(args.onAnswer).toHaveBeenCalledWith('Talk');
  },
};
