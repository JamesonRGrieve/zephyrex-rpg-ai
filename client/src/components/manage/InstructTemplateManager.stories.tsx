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
      include_names: false,
      activation_regex: '',
      story_string: '',
      example_separator: '',
      chat_start: '',
    },
  },
};

/** With SillyTavern's context template: every turn named, a story string, for models matching a pattern (audit gap 4). */
export const WithContextTemplate: Story = {
  args: {
    template: {
      id: 't2',
      created_at: 'x',
      updated_at: null,
      name: 'Llama 3 story',
      start: '',
      system_prefix: '<|start_header_id|>system<|end_header_id|>\n',
      system_suffix: '<|eot_id|>',
      user_prefix: '<|start_header_id|>user<|end_header_id|>\n',
      user_suffix: '<|eot_id|>',
      assistant_prefix: '<|start_header_id|>assistant<|end_header_id|>\n',
      assistant_suffix: '<|eot_id|>',
      stop: ['<|eot_id|>'],
      include_names: true,
      activation_regex: 'llama-3',
      story_string: '{{#if system}}{{system}}\n{{/if}}{{description}}',
      example_separator: '***',
      chat_start: '***',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Name every turn')).toBeChecked();
    await expect(canvas.getByLabelText('Use for models matching')).toHaveValue('llama-3');
    await expect(canvas.getByLabelText('Story string')).toHaveValue('{{#if system}}{{system}}\n{{/if}}{{description}}');
  },
};
