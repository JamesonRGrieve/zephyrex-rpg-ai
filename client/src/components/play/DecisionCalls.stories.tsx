// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { type DecisionCall, DecisionCalls } from './DecisionCalls';

const meta: Meta<typeof DecisionCalls> = { title: 'Play/Decision calls', component: DecisionCalls };
export default meta;
type Story = StoryObj<typeof DecisionCalls>;

const call: Pick<DecisionCall, 'questions' | 'model' | 'error'> = { questions: [], model: 'd1-2b', error: null };

/** The calls after a message, left to right in the order made: one done, a failure in red with its retry
 * beside it, and one still running. */
export const Stacked: Story = {
  args: {
    calls: [
      {
        ...call,
        id: '1',
        purpose: 'needs_roll',
        state: 'done',
        answers: { roll: { choice: 'yes' } },
        ms: 640,
        createdAt: '2026-11-24T03:00:01',
      },
      {
        ...call,
        id: '2',
        purpose: 'next_turn',
        state: 'done',
        answers: { next: null },
        error: { kind: 'timeout', detail: 'no answer in 12 s (1 questions)' },
        ms: 12000,
        createdAt: '2026-11-24T03:00:02',
      },
      {
        ...call,
        id: '3',
        purpose: 'next_turn',
        state: 'done',
        answers: { next: { choice: 'Old Hesk' } },
        ms: 900,
        createdAt: '2026-11-24T03:00:15',
      },
      {
        ...call,
        id: '4',
        purpose: 'Combat: start',
        state: 'running',
        answers: null,
        model: null,
        ms: null,
        createdAt: '2026-11-24T03:00:16',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Decision calls' });
    const buttons = within(list).getAllByRole('button');
    await expect(buttons).toHaveLength(4);
    // The failure is said, and its retry stands beside it.
    await expect(buttons[1]).toHaveAccessibleName('next_turn, failed');
    await expect(buttons[2]).toHaveAccessibleName('next_turn');
  },
};
