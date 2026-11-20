// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { PromptSection } from '~/features/prompt/assemble';
import { PromptLayoutEditor } from './PromptLayoutEditor';

function Harness(): React.ReactElement {
  const [layout, setLayout] = useState<PromptSection[]>([]);
  return <PromptLayoutEditor value={layout} onChange={setLayout} />;
}

const meta: Meta<typeof Harness> = { title: 'Prompt/Prompt sections', component: Harness, decorators: [(Story) => <div className='max-w-2xl'>{Story()}</div>] };
export default meta;
type Story = StoryObj<typeof Harness>;

export const Reorder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Move Description up' }));
    const rows = canvas.getAllByRole('listitem');
    await expect(rows[1]).toHaveTextContent('Description');
    await userEvent.click(canvas.getByRole('switch', { name: 'Include Scenario' }));
    await expect(canvas.getByRole('switch', { name: 'Include Scenario' })).not.toBeChecked();
  },
};
