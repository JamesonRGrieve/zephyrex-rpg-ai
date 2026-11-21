// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { ExtraBodyField } from './ExtraBodyField';

function Field({ start }: { start: string }) {
  const [text, setText] = useState(start);
  return <ExtraBodyField text={text} onChange={setText} />;
}

const meta: Meta<typeof Field> = {
  title: 'Manage/Extra request fields',
  component: Field,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: { start: '' },
};
export default meta;
type Story = StoryObj<typeof Field>;

/** Turning a thinking model's thinking off. */
export const ThinkingOff: Story = {
  args: { start: '{\n  "reasoning_effort": "none"\n}' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

/** A field that carries the conversation can't be set. */
export const Refused: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Extra request fields (JSON)'), '{{"messages": [[]}');
    await expect(canvas.getByRole('alert')).toHaveTextContent("Extra request fields can't set messages");
  },
};
