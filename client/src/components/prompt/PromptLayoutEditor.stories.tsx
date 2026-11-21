// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { LayoutEntry } from '~/features/prompt/assemble';
import { PromptLayoutEditor } from './PromptLayoutEditor';

function Harness(): React.ReactElement {
  const [layout, setLayout] = useState<LayoutEntry[]>([]);
  return <PromptLayoutEditor value={layout} onChange={setLayout} />;
}

const meta: Meta<typeof Harness> = {
  title: 'Prompt/Prompt sections',
  component: Harness,
  decorators: [(Story) => <div className='max-w-2xl'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Harness>;

export const Reorder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Move Description up' }));
    const names = canvas.getAllByRole('listitem').map((row) => row.textContent ?? '');
    await expect(names.findIndex((name) => name.includes('Description'))).toBeLessThan(
      names.findIndex((name) => name.includes('Lore before the character')),
    );
    await userEvent.click(canvas.getByRole('switch', { name: 'Include Scenario' }));
    await expect(canvas.getByRole('switch', { name: 'Include Scenario' })).not.toBeChecked();
  },
};

/** A prompt of the person's own (audit gap 3), put in the chat at a depth, and the reply's opening. */
export const OwnPromptAndPrefill: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Add a prompt/ }));
    await userEvent.type(canvas.getByLabelText('Text (macros work here)'), 'Remember the coolant.');
    await userEvent.selectOptions(canvas.getByLabelText('Where'), 'depth');
    await expect(canvas.getByLabelText('Depth')).toHaveValue(0);
    await userEvent.type(canvas.getByLabelText('Start reply with'), '*{{{{char}} grins.*');
    await expect(canvas.getByLabelText('Start reply with')).toHaveValue('*{{char}} grins.*');
  },
};
