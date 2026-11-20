// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { InstructTemplateFormView } from './InstructTemplateManager';

const meta: Meta<typeof InstructTemplateFormView> = {
  title: 'Manage/Instruct template form',
  component: InstructTemplateFormView,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: { template: null, onSave: fn(async () => true), done: fn() },
};
export default meta;
type Story = StoryObj<typeof InstructTemplateFormView>;

/** A new template: the markup around each role's message, and the stop strings. */
export const New: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Name'), 'Bracketed');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(args.onSave).toHaveBeenCalled();
  },
};

/** Editing one already saved. */
export const Saved: Story = {
  args: {
    template: {
      id: 't1',
      created_at: 'x',
      updated_at: null,
      name: 'Vicuna',
      start: '',
      system_prefix: '',
      system_suffix: '\n\n',
      user_prefix: 'USER: ',
      user_suffix: '\n',
      assistant_prefix: 'ASSISTANT: ',
      assistant_suffix: '</s>\n',
      stop: ['USER:'],
    },
  },
};
