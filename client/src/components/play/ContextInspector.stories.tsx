// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { ContextInspector } from './ContextInspector';

const meta: Meta<typeof ContextInspector> = {
  title: 'Play/Context inspector',
  component: ContextInspector,
  decorators: [(Story) => <div className='max-w-xl'>{Story()}</div>],
  args: {
    prompt: {
      messages: [
        {
          role: 'system',
          content: "Write Ada's next reply in a fictional chat between Ada and Sam.\n\nAda is a ship's engineer.",
          tokens: 26,
        },
        { role: 'assistant', content: '*wipes her hands* Welcome aboard.', tokens: 13 },
        { role: 'user', content: 'I hand her the spanner.', tokens: 10 },
      ],
      dropped: 2,
      tokens: 49,
      context_tokens: 8192,
      max_tokens: 400,
      active_lore: ['e1'],
    },
  },
};
export default meta;
type Story = StoryObj<typeof ContextInspector>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('2 older turns were left out to fit.', { exact: false })).toBeInTheDocument();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
  },
};
