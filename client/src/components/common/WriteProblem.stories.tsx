// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { WriteProblem } from './WriteProblem';

const meta: Meta<typeof WriteProblem> = {
  title: 'Common/Write problem',
  component: WriteProblem,
  args: { problem: 'The record was changed since it was read' },
};
export default meta;
type Story = StoryObj<typeof WriteProblem>;

export const Refused: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent('The record was changed since it was read');
  },
};

export const NoProblem: Story = { args: { problem: null } };
