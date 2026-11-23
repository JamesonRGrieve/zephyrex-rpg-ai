// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { DecisionCalls } from './DecisionCalls';

const meta: Meta<typeof DecisionCalls> = { title: 'Play/Decision calls', component: DecisionCalls };
export default meta;
type Story = StoryObj<typeof DecisionCalls>;

/** The calls about a message side by side: one done, one still running, one failed. */
export const Stacked: Story = {
  args: {
    calls: [
      { id: '1', purpose: 'Roll needed', questions: [], state: 'done', answers: { roll: 'yes' }, model: 'd1-2b', ms: 640 },
      { id: '2', purpose: 'Skill and DC', questions: [], state: 'running', answers: null, model: null, ms: null },
      { id: '3', purpose: 'Who speaks', questions: [], state: 'failed', answers: null, model: 'd1-2b', ms: 9000 },
    ],
  },
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Decision calls' });
    await expect(within(list).getAllByRole('button')).toHaveLength(3);
  },
};
